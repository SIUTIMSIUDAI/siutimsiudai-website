// Supabase Edge Function: pantry-scan
//
// Server-side proxy for Google Cloud Vertex AI (Gemini vision). The billable credential lives HERE
// as a Supabase secret (GCP_SERVICE_ACCOUNT_KEY) and never ships to a device or the app bundle.
// The client (services/pantryVisionService.ts) sends { imageBase64, mediaType? }; we ask Gemini to
// identify the RAW ingredients in the photo and return them as a clean JSON list.
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

// Vision-capable Gemini. Swappable to any current Gemini vision model (env override) without
// touching the client.
const MODEL = Deno.env.get("VERTEX_MODEL") || "gemini-2.5-flash";

const INSTRUCTION = [
  "You are a kitchen inventory assistant. Look at the photo and list only the RAW food",
  "ingredients you can see (produce, meat, eggs, tofu, sauces, dry goods). Ignore plates,",
  "utensils, packaging text, and prepared/cooked dishes.",
  "",
  "Respond with ONLY a JSON object, no prose, in exactly this shape:",
  '{"items":[{"name":"English name","nameZh":"繁體中文名","quantity":<number>,"unit":"g"|"ml"|"piece","confidence":<0..1>}]}',
  "",
  "Rules: nameZh must be Traditional Chinese in Hong Kong usage (e.g. 豉油, 蒜頭, 薯仔).",
  "Use unit 'piece' for countable items, 'g' for weighed solids, 'ml' for liquids.",
  "quantity is your best visual estimate. confidence is how sure you are (0..1).",
  "If you see no food ingredients, return {\"items\":[]}.",
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
    const { imageBase64, mediaType } = await req.json();
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

    const parsed = extractJson(text) as { items?: unknown };
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    // The client re-validates and sanitises every row (parseScanResponse), so we can forward the
    // model's list as-is; the app never trusts it blindly and always routes it through the human
    // review screen before saving.
    return json({ items }, 200);
  } catch (err) {
    return proxyError(err);
  }
});
