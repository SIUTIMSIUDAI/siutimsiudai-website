import { FoodRecognitionResult } from "@/types";
import { HK_DISHES, HkDish } from "@/constants/hkDishes";
import { sanitizeMicros } from "@/utils/micros";
import { isSupabaseConfigured, supabase } from "./supabase";
import { classifyInvokeError, InvokeFailure } from "./functionError";
import { delay } from "./util";

// Meal-photo recognition: turn a photo of a dish into editable nutrition guesses.
//
//   1. Live: the "estimate-meal" Edge Function in PHOTO mode. It holds the Google Cloud service
//      account SERVER-SIDE and asks Vertex AI (Gemini vision) what is on the plate, returning the
//      same { meals: [...] } contract the text path uses. See supabase/functions/estimate-meal.
//   2. Demo mock: a rotating list of HK classics, reachable ONLY when Supabase is unconfigured
//      (Expo Go without env, web preview, tests).
//
// History worth keeping: this service used to be mock-ONLY. It had no network import at all and
// `recognize()` declared zero parameters, so the photo was accepted and silently discarded — every
// capture returned the next dish in a hardcoded list. A photo of bread came back as an egg tart.
// The mock must never again be reachable from a build that has a backend configured.

export interface VisionFoodSuccess {
  ok: true;
  // May be empty: "there is no food in this photo" is a real answer the model is asked to give,
  // and is far better than a confident guess that lands in someone's calorie log.
  results: FoodRecognitionResult[];
}

export interface VisionFoodFailure {
  ok: false;
  // "rate_limited" is the daily per-user cap, which is a different message and a different user
  // action from a genuine outage: come back tomorrow, not tap again now. See ./functionError.
  error: InvokeFailure;
}

export type VisionFoodOutcome = VisionFoodSuccess | VisionFoodFailure;

export interface VisionFoodService {
  // imageBase64 is a raw base64 JPEG (no data: prefix). The UI always shows results as editable
  // guesses with a confidence badge, never as a silent auto-log: recognition is fuzzy, so a
  // one-tap manual correction is the guardrail.
  recognize(imageBase64: string): Promise<VisionFoodOutcome>;
}

const ESTIMATE_FN = "estimate-meal";

function toNonNegative(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

// Coerce one loosely-typed row from the proxy into a clean FoodRecognitionResult. A model can
// return anything, so every field is clamped before it can reach the confirmation card.
function toRecognitionRow(raw: unknown): FoodRecognitionResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim() : "";
  const nameZh = typeof r.nameZh === "string" ? r.nameZh.trim() : "";
  if (!name && !nameZh) return null; // a dish we can't label is useless on the card
  const unit = typeof r.unit === "string" && r.unit.trim() ? r.unit.trim() : "1 serving";
  const unitZh = typeof r.unitZh === "string" && r.unitZh.trim() ? r.unitZh.trim() : unit;
  const c = Number(r.confidence);
  const micros = sanitizeMicros(r.micros);
  return {
    name: name || nameZh,
    nameZh: nameZh || name,
    calories: toNonNegative(r.calories),
    protein: toNonNegative(r.protein),
    carbs: toNonNegative(r.carbs),
    fat: toNonNegative(r.fat),
    // Deliberately middling default: an unlabelled guess should not wear a high-confidence badge.
    confidence: Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0.6,
    portionLabel: unit,
    portionLabelZh: unitZh,
    ...(micros ? { micros } : {}),
  };
}

// Returns null ONLY when the payload is malformed (no `meals` array), which the caller treats as a
// failed call. A well-formed empty list is honoured as a real "no food here" answer.
export function parseRecognitionResponse(data: unknown): FoodRecognitionResult[] | null {
  const meals = (data as { meals?: unknown })?.meals;
  if (!Array.isArray(meals)) return null;
  return meals.map(toRecognitionRow).filter((x): x is FoodRecognitionResult => x !== null);
}

async function recognizeViaProxy(imageBase64: string): Promise<VisionFoodOutcome> {
  if (!supabase) return { ok: false, error: "unavailable" };
  const { data, error } = await supabase.functions.invoke<{ meals?: unknown }>(ESTIMATE_FN, {
    body: { imageBase64, mediaType: "image/jpeg" },
  });
  if (error) return { ok: false, error: await classifyInvokeError(error) };
  const results = parseRecognitionResponse(data);
  return results === null ? { ok: false, error: "unavailable" } : { ok: true, results };
}

function toResult(dish: HkDish, confidence: number): FoodRecognitionResult {
  const { keywords, ...macros } = dish;
  return { ...macros, confidence };
}

// Rotate through a few photogenic dishes so repeated captures during an offline demo vary.
const POOL = ["Har Gow", "Siu Mai", "Baked Pork Chop Rice", "Egg Tart", "Pineapple Bun"];
let cursor = 0;

// Exported so a test can assert its shape without a camera or a network client.
export function mockRecognize(): FoodRecognitionResult[] {
  const primaryName = POOL[cursor % POOL.length];
  cursor += 1;
  const primary = HK_DISHES.find((d) => d.name === primaryName) ?? HK_DISHES[0];
  const alt = HK_DISHES.find((d) => d.name !== primary.name) ?? HK_DISHES[1];
  return [toResult(primary, 0.86), toResult(alt, 0.41)];
}

export const visionFoodService: VisionFoodService = {
  async recognize(imageBase64) {
    // Configured means this is the real product, so the live path is the ONLY path.
    if (isSupabaseConfigured) {
      return await recognizeViaProxy(imageBase64).catch(
        () => ({ ok: false, error: "unavailable" }) as VisionFoodOutcome,
      );
    }
    await delay(900); // exercise the "recognising" state in mock mode
    return { ok: true, results: mockRecognize() };
  },
};
