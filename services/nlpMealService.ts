import { MealType, ParsedMeal } from "@/types";
import { detectMealType } from "@/utils/parseMeal";
import { estimateMealText } from "@/utils/estimateMeal";
import { sanitizeMicros } from "@/utils/micros";
import { isSupabaseConfigured, supabase } from "./supabase";
import { classifyInvokeError, InvokeFailure } from "./functionError";
import { delay } from "./util";

// The logging AI: turns a free meal description ("朝早食咗一碗麥片加 mixed berries") into estimated
// foods with macros + micros. Two layers, exactly like pantryVisionService / recipeGenerationService:
//
//   1. Live: a Supabase Edge Function ("estimate-meal") holds the Google Cloud service account
//      SERVER-SIDE and asks Vertex AI (Gemini) to estimate the meal. The billable credential never
//      ships client-side, so it can't be pulled off a device the way an EXPO_PUBLIC_ key could. See
//      supabase/functions/estimate-meal/index.ts.
//   2. Demo mock: an on-device three-tier estimator (estimateMealText: HK dishes -> common foods ->
//      generic) reachable ONLY when Supabase is not configured (Expo Go without env, web, tests),
//      so the whole log flow stays demoable and testable with no key.
//
// The mock is NOT a failure fallback. These numbers go straight into someone's calorie ring and
// micronutrient tracker; a locally-invented estimate presented as an AI reading is the worst
// outcome in this app. A configured build either gets a real estimate or reports failure.
//
// Swapping AI providers is a server-only change (edit the Edge Function); this interface and every
// AI-backed tab (voice, smart manual) stay put.

export interface NlpMealSuccess {
  ok: true;
  // May be empty: "I could not work out what that was" is a real answer. The caller shows a
  // try-again / rename nudge rather than papering over it with a generic guess.
  meals: ParsedMeal[];
}

export interface NlpMealFailure {
  ok: false;
  // "rate_limited" is the daily per-user cap, which is a different message and a different user
  // action from a genuine outage: come back tomorrow, not tap again now. See ./functionError.
  error: InvokeFailure;
}

export type NlpMealOutcome = NlpMealSuccess | NlpMealFailure;

export interface NlpMealService {
  // Handles code-switched input, e.g. "朝早食咗一碗麥片加 mixed berries".
  parse(text: string): Promise<NlpMealOutcome>;
}

const ESTIMATE_FN = "estimate-meal";
const MEAL_TYPES: readonly MealType[] = ["breakfast", "lunch", "dinner", "snack"];

// --- Response validation (live path) --------------------------------------------------------
// A model can return almost anything; we sanitise every field before it reaches the log. Macros are
// clamped to finite, non-negative numbers; the meal type is clamped to our enum (falling back to the
// one detected from the text); micros run through the same sanitiseMicros used everywhere else.

function toNonNegative(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

function toMeal(raw: unknown, fallbackMealType: MealType): ParsedMeal | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim() : "";
  const nameZh = typeof r.nameZh === "string" ? r.nameZh.trim() : "";
  if (!name && !nameZh) return null; // a food we can't label is useless in the log
  const q = Number(r.quantity);
  const micros = sanitizeMicros(r.micros);
  return {
    name: name || nameZh,
    nameZh: nameZh || name,
    calories: toNonNegative(r.calories),
    protein: toNonNegative(r.protein),
    carbs: toNonNegative(r.carbs),
    fat: toNonNegative(r.fat),
    fiber: toNonNegative(r.fiber),
    quantity: Number.isFinite(q) && q > 0 ? q : 1,
    unit: typeof r.unit === "string" && r.unit.trim() ? r.unit.trim() : "1 serving",
    mealType: MEAL_TYPES.includes(r.mealType as MealType) ? (r.mealType as MealType) : fallbackMealType,
    ...(micros ? { micros } : {}),
  };
}

// Parse and sanitise the Edge Function payload. Returns null (not throw) when the payload is
// malformed (no `meals` array) so the caller falls back to the local mock.
export function parseMealResponse(data: unknown, fallbackMealType: MealType): ParsedMeal[] | null {
  const meals = (data as { meals?: unknown })?.meals;
  if (!Array.isArray(meals)) return null;
  return meals.map((m) => toMeal(m, fallbackMealType)).filter((x): x is ParsedMeal => x !== null);
}

async function estimateViaProxy(text: string, fallbackMealType: MealType): Promise<NlpMealOutcome> {
  if (!supabase) return { ok: false, error: "unavailable" };
  const { data, error } = await supabase.functions.invoke<{ meals?: unknown }>(ESTIMATE_FN, {
    body: { text },
  });
  if (error) return { ok: false, error: await classifyInvokeError(error) };
  const meals = parseMealResponse(data, fallbackMealType);
  return meals === null ? { ok: false, error: "unavailable" } : { ok: true, meals };
}

export const nlpMealService: NlpMealService = {
  async parse(text) {
    const trimmed = text.trim();
    if (!trimmed) return { ok: true, meals: [] };

    // Configured means this is the real product, so the live path is the ONLY path. Note what is
    // deliberately absent: the old code also fell through to the mock when the model returned an
    // EMPTY list, which quietly replaced "I don't know" with an invented generic estimate.
    if (isSupabaseConfigured) {
      const mealType = detectMealType(trimmed);
      return await estimateViaProxy(trimmed, mealType).catch(
        () => ({ ok: false, error: "unavailable" }) as NlpMealOutcome,
      );
    }

    await delay(450); // exercise the "estimating" state in mock mode
    return { ok: true, meals: estimateMealText(trimmed) };
  },
};
