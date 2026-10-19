import type { EntryMicronutrients, MacroNutrients, Recipe } from "@/types";
import { TRACKED_MICRO_KEYS, type MicroTotals } from "@/utils/micros";

// The recipe card answers two questions about ONE serving: does it fit what's left of today's
// calories, and what does it give you? Everything the card shows is computed here, pure, so the
// numbers a cook reads are unit-tested. The estimate itself comes from the meal estimator
// (services/recipeNutritionService.ts) and is saved on the recipe with a fingerprint (`basis`).

// One serving's amount, rounded the same way for the fingerprint and the request: whole at 10 and
// above, one decimal below. Rescaling keeps each serving the same, so the fingerprint holds; on the
// rare occasion the store's 2-decimal rescaling nudges an amount across a rounding edge, the cost is
// one extra estimate, never a wrong number.
function perServing(quantity: number, servings: number): number {
  const per = quantity / Math.max(1, servings);
  return per >= 10 ? Math.round(per) : Math.round(per * 10) / 10;
}

// Bumped whenever the request below changes enough that saved estimates should be redone. v2: each
// ingredient is its own entry (2026-10-19); estimates from the one-dish request carry no version.
const REQUEST_VERSION = "v2";

/**
 * Fingerprint of the one-serving ingredient list. Identical for any serving count of the same dish,
 * different once an ingredient or its amount per serving changes, or the request version. Chinese
 * names are left out, so translating a recipe never triggers a new estimate.
 */
export function nutritionBasis(r: Pick<Recipe, "servings" | "ingredients">): string {
  const list = r.ingredients
    .map((i) => `${i.name.trim().toLowerCase()}|${perServing(i.quantity, r.servings)}|${i.unit}`)
    .join(";");
  return `${REQUEST_VERSION}:${list}`;
}

/** True when the saved estimate was made from this exact one-serving ingredient list. */
export function isNutritionFresh(r: Pick<Recipe, "servings" | "ingredients" | "nutrition">): boolean {
  return !!r.nutrition && r.nutrition.basis === nutritionBasis(r);
}

/**
 * What the meal estimator is asked. Each ingredient is its own entry at one serving's amount: asked
 * about "one serving of <dish>", the estimator files it as a single dish (its rule 1) and answers
 * with a typical serving (rule 3), ignoring the amounts. That put the traditional 豉油雞 (skin-on
 * chicken, rock sugar) below its skinless-breast version (owner's phone, 2026-10-19).
 */
export function oneServingRequest(r: Pick<Recipe, "title" | "titleZh" | "servings" | "ingredients">): string {
  const items = r.ingredients
    .map((i) => `${i.name.trim()} ${perServing(i.quantity, r.servings)} ${i.unit}`)
    .join("; ");
  return (
    "Estimate each ingredient below as its own entry, for exactly the amount stated (raw, as used in " +
    `cooking). Together they make one serving of ${r.title} (${r.titleZh}): ${items}`
  );
}

/**
 * Add the estimator's items into one serving. Null when there is nothing usable (no items, or no
 * calories at all): that is a failed estimate, never a 0 kcal dish. `micros` is null when no item
 * carried any, so the card hides the vitamins rather than showing invented zeros.
 */
export function sumServing(
  items: Array<MacroNutrients & { micros?: EntryMicronutrients }>,
): { perServing: MacroNutrients; micros: MicroTotals | null } | null {
  if (items.length === 0) return null;
  const totals: MacroNutrients = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  for (const i of items) {
    totals.calories += i.calories;
    totals.protein += i.protein;
    totals.carbs += i.carbs;
    totals.fat += i.fat;
    totals.fiber += i.fiber;
  }
  if (!(totals.calories > 0)) return null;
  const withMicros = items.filter((i) => i.micros);
  if (withMicros.length === 0) return { perServing: totals, micros: null };
  const micros = {} as MicroTotals;
  for (const k of TRACKED_MICRO_KEYS) micros[k] = withMicros.reduce((s, i) => s + (i.micros?.[k] ?? 0), 0);
  return { perServing: totals, micros };
}

export interface ServingVerdict {
  /** Today's eaten calories plus this serving stay at or under the daily target. */
  fits: boolean;
  /** Calories left today before this serving (negative once already over). */
  left: number;
  /** Calories left after eating it. */
  after: number;
  /** How far over the daily target eating it would go (0 when it fits). */
  over: number;
  /** The bar: today's eaten calories, then this serving, as shares of the target (they never overflow). */
  eatenShare: number;
  dishShare: number;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Whether one serving fits what's left of today's calories, with the numbers the card shows. */
export function servingVerdict(kcal: number, eatenToday: number, dailyTarget: number): ServingVerdict {
  if (!(dailyTarget > 0)) return { fits: true, left: 0, after: 0, over: 0, eatenShare: 0, dishShare: 0 };
  const left = dailyTarget - eatenToday;
  const over = Math.max(0, eatenToday + kcal - dailyTarget);
  const eatenShare = clamp(eatenToday / dailyTarget, 0, 1);
  return {
    fits: over === 0,
    left,
    after: left - kcal,
    over,
    eatenShare,
    dishShare: clamp(kcal / dailyTarget, 0, 1 - eatenShare),
  };
}

/** A nutrient's share of its daily target, in percent, or null when there is no target to compare. */
export function shareOfTarget(amount: number, target: number | null | undefined): number | null {
  return target != null && target > 0 ? (amount / target) * 100 : null;
}

/** Whole percents, with "<1%" for a trace so a real amount never reads as nothing. */
export function formatShare(pct: number): string {
  return pct > 0 && pct < 1 ? "<1%" : `${Math.round(pct)}%`;
}

/**
 * Whole at 10 and above; below 10, one decimal only when it says something, so zero reads "0g" and
 * a whole amount "8g" (owner, 2026-10-19), while a trace still reads "0.5g".
 */
export function formatAmount(value: number, unit: "g" | "mg" | "mcg"): string {
  return `${value >= 10 ? Math.round(value) : Number(value.toFixed(1))}${unit}`;
}
