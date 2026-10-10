import { LogSource, MacroNutrients, MealCustomization } from "@/types";

// 少甜 / 走甜 / 少底 order tweaks, the way a cha chaan teng waiter adjusts an order.
// - less_sugar (少甜) takes off half of the item's added sugar; no_sugar (走甜) takes off all of it.
//   "Added sugar" is what went in when it was made (sugar, syrup, honey, condensed milk), estimated
//   per item by the AI when the meal is logged. Every gram is 4 kcal of carbs.
// - less_rice (少底): halves a rice base under a 碟頭飯 style dish (a fixed, rounded HK estimate).
// Deltas are negative and applied on read, so toggling on and off is perfectly reversible.

/** What a tweak needs to know about the item it adjusts. */
export interface TweakableItem {
  // Grams of added sugar, estimated when the item was logged. Absent when there is no estimate
  // (logged before estimates existed, or typed in by hand); 0 when there is none to take out.
  addedSugar?: number | null;
}

// Order the toggles render in.
export const ALL_CUSTOMIZATIONS: MealCustomization[] = ["less_sugar", "no_sugar", "less_rice"];

const SUGAR_TWEAKS: MealCustomization[] = ["less_sugar", "no_sugar"];
const KCAL_PER_G_SUGAR = 4;
const SUGAR_SHARE: Record<string, number> = { less_sugar: 0.5, no_sugar: 1 };

const LESS_RICE: MacroNutrients = { calories: -140, protein: -3, carbs: -30, fat: -1, fiber: 0 };

// Without an estimate, a sugar tweak assumes a typical sweetened HK drink or dessert: about 4½ tsp
// (22.5 g) of added sugar, so 少甜 keeps the -45 kcal it always had and 走甜 is -90 kcal.
const TYPICAL_ADDED_SUGAR_G = 22.5;

function delta(key: MealCustomization, item: MacroNutrients & TweakableItem): MacroNutrients {
  if (key === "less_rice") return LESS_RICE;
  const sugar = typeof item.addedSugar === "number" ? item.addedSugar : TYPICAL_ADDED_SUGAR_G;
  // Sugar is part of carbs, so no tweak takes out more sugar than the item has carbs.
  const grams = Math.min(sugar * SUGAR_SHARE[key], Math.max(0, item.carbs));
  return { calories: -grams * KCAL_PER_G_SUGAR, protein: 0, carbs: -grams, fat: 0, fiber: 0 };
}

// Macros for a base item after its active tweaks are applied. Never returns a negative
// field, so tweaking a small item can't push it below zero.
export function effectiveMacros(
  base: MacroNutrients & TweakableItem,
  active: MealCustomization[] | undefined,
): MacroNutrients {
  const result: MacroNutrients = {
    calories: base.calories,
    protein: base.protein,
    carbs: base.carbs,
    fat: base.fat,
    // Entries logged before fibre tracking existed rehydrate from storage with no `fiber` field.
    // Treat a missing value as 0 g (honest: it was never measured) so a day that mixes old and new
    // entries totals a real number instead of NaN.
    fiber: base.fiber ?? 0,
  };
  // 走甜 already takes out all the added sugar, so a stray 少甜 alongside it counts for nothing.
  const keys = (active ?? []).filter(
    (k) => !(k === "less_sugar" && active?.includes("no_sugar")),
  );
  for (const key of keys) {
    const d = delta(key, base);
    result.calories += d.calories;
    result.protein += d.protein;
    result.carbs += d.carbs;
    result.fat += d.fat;
    result.fiber += d.fiber;
  }
  return {
    calories: Math.max(0, Math.round(result.calories)),
    protein: Math.max(0, Math.round(result.protein)),
    carbs: Math.max(0, Math.round(result.carbs)),
    fat: Math.max(0, Math.round(result.fat)),
    fiber: Math.max(0, Math.round(result.fiber)),
  };
}

// The kcal a set of tweaks removes from a base item (a positive number for display, e.g.
// "-45 kcal"). Used to caption the toggles.
export function customizationSavings(
  base: MacroNutrients & TweakableItem,
  active: MealCustomization[] | undefined,
): number {
  return base.calories - effectiveMacros(base, active).calories;
}

/**
 * The tweaks worth offering on an item, in display order. The sugar ones only where there is sugar
 * to take out: not when the estimate says none, and not on a packaged product scanned by barcode,
 * which can't be made less sweet. A tweak already ticked always stays, so it can be unticked.
 */
export function availableCustomizations(
  item: TweakableItem & { source?: LogSource; customizations?: MealCustomization[] },
): MealCustomization[] {
  const active = item.customizations ?? [];
  const sugarOffered = item.source !== "barcode" && item.addedSugar !== 0;
  return ALL_CUSTOMIZATIONS.filter(
    (key) => !SUGAR_TWEAKS.includes(key) || sugarOffered || active.includes(key),
  );
}

/** The tweaks after tapping one. 少甜 and 走甜 replace each other rather than stacking. */
export function toggledCustomizations(
  active: MealCustomization[] | undefined,
  key: MealCustomization,
): MealCustomization[] {
  const list = active ?? [];
  if (list.includes(key)) return list.filter((k) => k !== key);
  const kept = SUGAR_TWEAKS.includes(key) ? list.filter((k) => !SUGAR_TWEAKS.includes(k)) : list;
  return [...kept, key];
}

// A day's EFFECTIVE macro totals: each entry's 少甜/走甜/少底 tweaks applied, then summed. The single
// source of truth for a day's numbers — the dashboard total, the cloud sync payload, and the
// manager viewer all call this, so one day can never render two different totals. Structurally
// typed (anything macro-bearing with optional customizations) so it needs no import of FoodEntry.
export function sumEntryMacros(
  entries: ReadonlyArray<MacroNutrients & TweakableItem & { customizations?: MealCustomization[] }>,
): MacroNutrients {
  return entries.reduce<MacroNutrients>(
    (acc, e) => {
      const m = effectiveMacros(e, e.customizations);
      return {
        calories: acc.calories + m.calories,
        protein: acc.protein + m.protein,
        carbs: acc.carbs + m.carbs,
        fat: acc.fat + m.fat,
        fiber: acc.fiber + m.fiber,
      };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  );
}
