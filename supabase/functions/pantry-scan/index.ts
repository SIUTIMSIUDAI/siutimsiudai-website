// Supabase Edge Function: pantry-scan
//
// Server-side proxy for Google Cloud Vertex AI (Gemini vision). The billable credential lives HERE
// as a Supabase secret (GCP_SERVICE_ACCOUNT_KEY) and never ships to a device or the app bundle.
// The client (services/pantryVisionService.ts) sends { imageBase64, mediaType? }; we ask Gemini to
// identify the RAW ingredients in the photo and return them as a clean JSON list.
//
// Receipt mode: { mode: "receipt", images: [{ data, mediaType? }] } with one to three photos of the
// same grocery receipt, read together in ONE call (one AI use). Same { items } reply, so the app's
// review screen handles both. Requests without `mode` (every app already installed) are unchanged.
//
// Deploy:  supabase functions deploy pantry-scan
// Secrets (shared by pantry-scan and generate-recipe):
//   supabase secrets set GCP_SERVICE_ACCOUNT_KEY="$(cat service-account.json)"
//   supabase secrets set GOOGLE_CLOUD_PROJECT=your-gcp-project-id   # optional; falls back to the
//                                                                   # project_id inside the JSON
//   supabase secrets set VERTEX_LOCATION=us-central1                # optional; default us-central1
//   supabase secrets set VERTEX_MODEL=gemini-2.5-flash          # optional; default below
// The service account needs the "Vertex AI User" role. Auth flow + token minting: ../_shared/vertex.ts.
//
// Auth: the gateway's default verify_jwt is NOT sufficient on its own. It accepts the anon key,
// which ships inlined in the app bundle, so for a while this proxy WAS an open relay to a billable
// Vertex credential for anyone who unzipped the APK. requireUser below resolves the bearer token to
// a real auth user, which is what actually closes it. Never run this with `--no-verify-jwt`.
//
// This file runs in the Supabase Deno runtime, not the React Native bundle, so it is excluded from
// the app tsconfig (see "exclude": ["supabase"]). `Deno` is a runtime global here.

import { CORS, extractJson, json, proxyError, vertexGenerateContent } from "../_shared/vertex.ts";
import { requireUser } from "../_shared/requireUser.ts";
import { enforceAiQuota } from "../_shared/aiQuota.ts";
import { receiptImages } from "./receipt.ts";

// Vision-capable Gemini. Swappable to any current Gemini vision model (env override) without
// touching the client.
const MODEL = Deno.env.get("VERTEX_MODEL") || "gemini-2.5-flash";

const INSTRUCTION = [
  "You are a kitchen inventory assistant. Look at the photo and list the food ingredients and drinks",
  "you can see (produce, meat, eggs, tofu, sauces, dry goods, milk, juice, bottled water). Ignore",
  "plates, utensils, printed text on packaging, and prepared/cooked dishes.",
  "",
  "Respond with ONLY a JSON object, no prose, in exactly this shape:",
  '{"items":[{"name":"English name","nameZh":"繁體中文名","quantity":<number>,"unit":"piece"|"box"|"carton"|"bottle"|"jar"|"can"|"pack"|"bag"|"bunch"|"loaf"|"g"|"ml","confidence":<0..1>}]}',
  "",
  "Rules: nameZh must be Traditional Chinese in Hong Kong usage (e.g. 豉油, 蒜頭, 薯仔).",
  "Units: count what you can see. Packaged goods use their package: box (punnets, tofu, eggs),",
  "carton (milk, juice), bottle (water, soy sauce, oil), jar (jam, sauces), can, pack (noodles,",
  "sausages, dumplings) or bag (rice, frozen vegetables). Loose items use piece, bunch (leafy greens,",
  "spring onions, herbs) or loaf (bread). Use g or ml only when nothing can be counted, such as loose",
  "mince or leftovers. quantity is how many of that unit you see: 3 boxes is quantity 3, unit box.",
  "quantity is your best visual estimate. confidence is how sure you are (0..1).",
  "If you see no food ingredients, return {\"items\":[]}.",
].join("\n");

// The receipt brief: what was BOUGHT, read off the paper, rather than what a photo shows. Same item
// shape and units as INSTRUCTION, so the review screen and the pantry treat both alike.
const RECEIPT_INSTRUCTION = [
  "You are reading a grocery shopping receipt, usually from Hong Kong. The photos are parts of ONE",
  "receipt, in order from top to bottom, and may overlap: never count the same line twice.",
  "",
  "List the food and drink that was bought: produce, meat, seafood, eggs, dairy, tofu, sauces,",
  "seasonings, dry goods, noodles, rice, frozen food, bread, snacks and drinks. Leave out everything",
  "else: non-food (tissues, detergent, toiletries, kitchenware), bags, bottle deposits, discounts,",
  "coupons, points, subtotals, totals, tax, payment and change lines.",
  "",
  "Receipts abbreviate. Turn each line into the plain ingredient a cook would recognise and drop",
  "brand names and pack codes, for example 'MKPL本地菜心' is Choy sum / 菜心 and 'NESTLE EVAP MILK",
  "410G' is Evaporated milk / 淡奶.",
  "",
  "Respond with ONLY a JSON object, no prose, in exactly this shape:",
  '{"items":[{"name":"English name","nameZh":"繁體中文名","quantity":<number>,"unit":"piece"|"box"|"carton"|"bottle"|"jar"|"can"|"pack"|"bag"|"bunch"|"loaf"|"g"|"ml","confidence":<0..1>}]}',
  "",
  "Rules: nameZh must be Traditional Chinese in Hong Kong usage (e.g. 豉油, 蒜頭, 薯仔).",
  "quantity is how many were bought: '2 x', 'QTY 2' or '@2' means 2. Packaged goods use their",
  "package as the unit: box (eggs, tofu, punnets), carton (milk, juice), bottle, jar, can, pack or",
  "bag. Produce sold by count uses piece or bunch, and bread uses loaf. Anything sold by weight uses",
  "g (convert kg: 0.452 kg is 452 g); anything sold by volume without a package uses ml. A multipack",
  "counts as one pack unless the receipt shows more were bought.",
  "If the same item appears on several lines, combine them into one row.",
  "confidence is how sure you are that you read the line and named the item correctly (0..1).",
  "If the photos are not a receipt, or it lists no food or drink, return {\"items\":[]}.",
].join("\n");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Identity gate, before any billable work. Platform verify_jwt accepts the anon key that ships in
  // the app bundle, so this is what actually separates a signed-in user from anyone who unzipped
  // the app. See ../_shared/requireUser.ts for the failure mode.
  const auth = await requireUser(req, CORS);
  if (!auth.ok) return auth.response;

  // Daily per-user ceiling, charged before the Vertex call rather than after it. gemini-2.5-flash
  // runs on dynamic shared quota, so Google Cloud offers no project-level number to cap; this
  // counter is the only limit on what one verified account can spend. See ../_shared/aiQuota.ts.
  const quota = await enforceAiQuota(auth.userId, CORS);
  if (!quota.ok) return quota.response;

  try {
    const body = await req.json();

    // Receipt mode: one to three photos of the same receipt in one call. Everything below it is
    // the fridge scan, unchanged.
    if (body?.mode === "receipt") {
      const images = receiptImages(body.images);
      if (!images) return json({ error: "bad_request" }, 400);
      const receiptText = await vertexGenerateContent(MODEL, {
        // A long receipt is a long bilingual list. Vertex bills tokens produced, not the ceiling.
        maxOutputTokens: 4096,
        parts: [
          ...images.map((image) => ({ inlineData: { mimeType: image.mimeType, data: image.data } })),
          { text: RECEIPT_INSTRUCTION },
        ],
      });
      const receipt = extractJson(receiptText, "items") as { items?: unknown };
      // Re-validated row by row in the app (parseScanResponse) and always reviewed before saving.
      return json({ items: Array.isArray(receipt.items) ? receipt.items : [] }, 200);
    }

    const { imageBase64, mediaType } = body;
    if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
      return json({ error: "bad_request" }, 400);
    }
    const mimeType = typeof mediaType === "string" && mediaType ? mediaType : "image/jpeg";

    const text = await vertexGenerateContent(MODEL, {
      // Headroom for a long bilingual ingredient list. Vertex bills tokens actually produced, not
      // the ceiling, so a generous limit is free while truncation costs the whole scan.
      maxOutputTokens: 2048,
      parts: [
        { inlineData: { mimeType, data: imageBase64 } },
        { text: INSTRUCTION },
      ],
    });

    const parsed = extractJson(text, "items") as { items?: unknown };
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    // The client re-validates and sanitises every row (parseScanResponse), so we can forward the
    // model's list as-is; the app never trusts it blindly and always routes it through the human
    // review screen before saving.
    return json({ items }, 200);
  } catch (err) {
    return proxyError(err);
  }
});
