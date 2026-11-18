// Supabase Edge Function: estimate-meal
//
// Server-side proxy for Google Cloud Vertex AI (Gemini). This is the LOGGING AI: it turns a free
// meal description ("朝早食咗一碗麥片加 mixed berries", "two boiled eggs and toast") into a clean list
// of foods with estimated macros AND the five tracked micronutrients, so a smart-manual / voice log
// resolves ANY real food, not just the curated HK list. The billable credential lives HERE as a
// Supabase secret (GCP_SERVICE_ACCOUNT_KEY) and never ships to a device or the app bundle — the same
// boundary as generate-recipe and pantry-scan.
//
// The client (services/nlpMealService.ts) sends { text }; we return { meals: [...] } shaped to
// ParsedMeal. The client re-validates and sanitises every field (parseMealResponse). It reaches its
// on-device mock ONLY when Supabase is unconfigured (Expo Go without env, web, jest) — a failure
// here surfaces to the user as a failure, never as invented numbers.
//
// Deploy:  supabase functions deploy estimate-meal
// Secrets: shared with pantry-scan / generate-recipe — see pantry-scan's header (GCP_SERVICE_ACCOUNT_KEY,
//          and optional GOOGLE_CLOUD_PROJECT / VERTEX_LOCATION / VERTEX_MODEL). Auth flow + token
//          minting live in ../_shared/vertex.ts. The service account needs the "Vertex AI User" role.
//
// Auth: the gateway's default verify_jwt is NOT sufficient on its own. It accepts the anon key,
// which ships inlined in the app bundle, so for a while this proxy WAS an open relay to a billable
// Vertex credential for anyone who unzipped the APK. requireUser below resolves the bearer token to
// a real auth user, which is what actually closes it. Never run this with `--no-verify-jwt`.
//
// Runs in the Supabase Deno runtime, excluded from the app tsconfig. `Deno` is a runtime global.

import {
  CORS,
  extractJson,
  json,
  proxyError,
  vertexGenerateContent,
  VertexPart,
} from "../_shared/vertex.ts";
import { requireUser } from "../_shared/requireUser.ts";
import { enforceAiQuota } from "../_shared/aiQuota.ts";

const MODEL = Deno.env.get("VERTEX_MODEL") || "gemini-2.5-flash";

// The nutritionist's brief. Kept as a proper Gemini systemInstruction (not buried in the user turn)
// so this judgement governs every estimate. The user turn only carries the raw meal text and the
// required JSON shape.
const SYSTEM_PROMPT = [
  "You are a nutrition estimator for a Hong Kong meal-logging app. You read a short, free-text meal",
  "description that may mix English and Traditional Chinese / Cantonese, and you estimate its",
  "nutrition. Follow these rules strictly:",
  "",
  "1. SPLIT INTO FOODS: Identify each distinct food or dish in the description and return one entry",
  "   per food. 'two eggs and toast' is two entries; 'wonton noodles' is one.",
  "2. RESPECT THE PORTION: If the text states an amount ('2 eggs', '一碗', 'a large bowl'), reflect it",
  "   in the totals and describe it in `quantity` + `unit`. If no amount is given, assume one normal",
  "   serving (quantity 1).",
  "3. ESTIMATE REALISTICALLY: Give sensible per-portion figures for a typical version of the food.",
  "   calories in kcal; protein, carbs, fat and dietary fibre in grams (fibre is 0 for foods that",
  "   have none, e.g. plain meat or a sugary drink). These DESCRIBE the food — never tailor them to",
  "   anyone's calorie or macro target.",
  "4. ALWAYS FILL MICROS: iron, calcium, potassium, sodium and vitamin C in milligrams (mg); vitamin D",
  "   in micrograms (mcg). Use 0 for a micronutrient the food genuinely lacks, never null.",
  "5. NEVER DEAD-END: If the food is unclear, return your single best-guess entry rather than an",
  "   empty list. Only truly empty input yields an empty list.",
  "6. ADDED SUGAR: addedSugar is the grams of sugar added when the food is made or served: table",
  "   sugar, syrup, honey, condensed milk, a sweet sauce poured over. It is the part a customer could",
  "   ask to leave out (少甜 / 走甜), e.g. the sugar in Hong Kong milk tea or lemon tea, or the syrup",
  "   in a dessert soup. It is part of carbs, never more than carbs. Use 0 for foods with none",
  "   (plain rice, meat, vegetables, unsweetened drinks).",
  // Logged meals showed every salmon and mackerel dish at exactly 10 mcg of vitamin D and the same
  // fish dish at anything from 2 to 10 (2026-11-15). Figures below are USDA FoodData Central. The
  // rule is scoped to vitamin D in so many words: an earlier wording moved fish calories (smoked
  // salmon 50 g from 70 to 117 kcal, its per-100 g figure).
  "7. VITAMIN D ONLY. This rule sets the vitamin D figure and nothing else; estimate calories,",
  "   protein, fat and every other field exactly as rules 1 to 6 say. Most foods have little or no",
  "   vitamin D; plain rice, noodles, bread, vegetables and fruit have essentially none. The main food",
  "   sources are fish and eggs. Vitamin D per 100 g (USDA FoodData Central): cooked farmed salmon",
  "   13.1 mcg, smoked salmon 17.1 mcg, cooked tilapia (a lean white fish) 3.7 mcg, boiled egg 2.2 mcg",
  "   (about 1.1 mcg per egg), cooked chicken breast 0.1 mcg. Scale by the weight of the fish or egg in",
  "   the portion: a 150 g salmon fillet has about 20 mcg of vitamin D. There is no upper cap; never",
  "   round a portion of oily fish down to 10 mcg.",
  // A USDA check of every nutrient (2026-11-17) found vitamin C, potassium and iron for cooked
  // vegetables and potatoes taken straight from the RAW figures (boiled broccoli at raw broccoli's
  // exact 89.2 mg of vitamin C), and egg iron at nearly double. Rules 8 and 9 are scoped the way rule 7
  // is, so they cannot move calories or macros. Figures are USDA FoodData Central (SR Legacy).
  // The spinach iron (168463) and the luncheon meat (172951) and instant noodle (171177) sodium were
  // added 2026-11-18 for gemini-3.5-flash-lite, which put spinach at 2.1 mg iron and luncheon meat at
  // 360 to 580 mg sodium.
  "8. VITAMINS AND MINERALS AS EATEN. This rule sets iron, calcium, potassium and vitamin C and",
  "   nothing else. Use the values for the food as it is eaten, cooked if it is cooked: never the raw",
  "   figure for a boiled, steamed, stir-fried or roasted food. Cooking destroys some vitamin C, and per",
  "   cooked gram the minerals differ from raw. Per 100 g as eaten (USDA FoodData Central): boiled",
  "   broccoli 65 mg vitamin C (raw is 89), boiled spinach 10 mg vitamin C, 466 mg potassium and 3.6 mg iron,",
  "   boiled peeled potato 7 mg vitamin C and 328 mg potassium.",
  "   A boiled egg (about 50 g) has about 0.6 mg iron.",
  "9. SODIUM ONLY. This rule sets the sodium figure and nothing else. Sodium comes mostly from what the",
  "   food is made or served with: salt, soy sauce, oyster sauce, fish sauce, stock, seasoning packets,",
  "   and cured or processed meat. One tablespoon of soy sauce has about 880 mg (USDA). Processed and",
  "   preserved foods are salty (USDA): canned luncheon meat has about 1,400 mg per 100 g, and",
  "   a 100 g pack of instant noodles cooked with all its seasoning about 1,850 mg. Plain rice, fresh",
  "   fruit and vegetables boiled without salt have almost none. Restaurant and takeaway dishes are",
  "   seasoned, so count their sauce and seasoning.",
  "",
  "nameZh must be Traditional Chinese as used in Hong Kong (e.g. 雞胸肉, 奇異果, 多士).",
].join("\n");

// PHOTO mode. Same meals[] contract as the text path so the client parser is shared, plus two
// fields only a photo can justify: `confidence` (how sure the model is about what it is looking at)
// and `unitZh` (a Chinese portion label for the confirmation card).
//
// Rule 5 of the system prompt ("never dead-end, always return a best guess") is right for typed
// text — someone who typed a description definitely ate something. It is WRONG for a photo, where
// the honest answer to a picture of a cat is an empty list. The override is stated explicitly.
function buildPhotoPrompt(): string {
  return [
    "Look at this photo and estimate the nutrition of the meal in it.",
    "",
    "Identify each distinct food or dish you can see. If the photo shows one composed dish (say, a",
    "plate of baked pork chop rice), return it as ONE entry rather than splitting it into rice, pork",
    "and sauce. Order the list most confident first.",
    "",
    "IMPORTANT - this OVERRIDES rule 5: you are looking at a photo, not reading a description. If the",
    'photo contains no recognisable food, return {"meals":[]}. Do NOT guess a dish to avoid an empty',
    "answer. A wrong guess is logged as real nutrition, so an empty list is far better than a fake one.",
    "",
    "Respond with ONLY a JSON object, no prose, in exactly this shape:",
    "{",
    '  "meals": [',
    "    {",
    '      "name": "English food name", "nameZh": "中文名",',
    '      "calories": <kcal>, "protein": <g>, "carbs": <g>, "fat": <g>, "fiber": <g>, "addedSugar": <g>,',
    '      "quantity": <number>, "unit": "portion label, e.g. 1 bowl / 2 pieces / 100 g",',
    '      "unitZh": "中文份量, e.g. 一碗 / 兩件 / 100 克",',
    '      "mealType": "breakfast" | "lunch" | "dinner" | "snack",',
    '      "confidence": <0..1 - how sure you are the photo really shows this dish>,',
    '      "micros": {"iron":<mg>,"calcium":<mg>,"potassium":<mg>,"sodium":<mg>,"vitaminC":<mg>,"vitaminD":<mcg>}',
    "    }",
    "  ]",
    "}",
  ].join("\n");
}

function buildPrompt(text: string): string {
  return [
    "Estimate the nutrition for this meal description:",
    "",
    `"${text}"`,
    "",
    "Respond with ONLY a JSON object, no prose, in exactly this shape:",
    "{",
    '  "meals": [',
    "    {",
    '      "name": "English food name", "nameZh": "中文名",',
    '      "calories": <kcal>, "protein": <g>, "carbs": <g>, "fat": <g>, "fiber": <g>, "addedSugar": <g>,',
    '      "quantity": <number>, "unit": "portion label, e.g. 1 bowl / 2 pieces / 100 g",',
    '      "mealType": "breakfast" | "lunch" | "dinner" | "snack",',
    '      "micros": {"iron":<mg>,"calcium":<mg>,"potassium":<mg>,"sodium":<mg>,"vitaminC":<mg>,"vitaminD":<mcg>}',
    "    }",
    "  ]",
    "}",
  ].join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Identity gate, before any billable work. Platform verify_jwt accepts the anon key that ships in
  // the app bundle, so this is what actually separates a signed-in user from anyone who unzipped
  // the app. Matters most here: this is the endpoint that accepts a photo and runs vision
  // inference, so it is both the costliest to abuse and the one handling personal images.
  // See ../_shared/requireUser.ts for the failure mode.
  const auth = await requireUser(req, CORS);
  if (!auth.ok) return auth.response;

  // Daily per-user ceiling, charged before the Vertex call rather than after it. gemini-2.5-flash
  // runs on dynamic shared quota, so Google Cloud offers no project-level number to cap; this
  // counter is the only limit on what one verified account can spend. See ../_shared/aiQuota.ts.
  const quota = await enforceAiQuota(auth.userId, CORS);
  if (!quota.ok) return quota.response;

  try {
    // Two input modes, one contract. `imageBase64` is the meal-photo path (services/
    // visionFoodService.ts); `text` is the voice / smart-manual path (services/nlpMealService.ts).
    // Both return { meals: [...] }, so the client's validation is shared.
    const { text, imageBase64, mediaType } = await req.json();
    const hasImage = typeof imageBase64 === "string" && imageBase64.length > 0;
    const hasText = typeof text === "string" && text.trim().length > 0;
    if (!hasImage && !hasText) return json({ error: "bad_request" }, 400);

    const parts: VertexPart[] = hasImage
      ? [
          {
            inlineData: {
              mimeType: typeof mediaType === "string" && mediaType ? mediaType : "image/jpeg",
              data: imageBase64,
            },
          },
          { text: buildPhotoPrompt() },
        ]
      : [{ text: buildPrompt(text.trim()) }];

    const raw = await vertexGenerateContent(MODEL, {
      system: SYSTEM_PROMPT,
      parts,
      maxOutputTokens: 2048,
    });

    const parsed = extractJson(raw, "meals") as { meals?: unknown };
    const meals = Array.isArray(parsed.meals) ? parsed.meals : [];
    // The client re-validates and sanitises every meal (parseMealResponse) before anything reaches
    // the log, so forwarding the model's list as-is is safe — the app never trusts it blindly.
    return json({ meals }, 200);
  } catch (err) {
    return proxyError(err);
  }
});
