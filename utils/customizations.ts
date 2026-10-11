import { LogSource, MacroNutrients, MealCustomization } from "@/types";

// 少甜 / 走甜 / 少底 order tweaks, the way a cha chaan teng waiter adjusts an order.
// - less_sugar (少甜) takes off half of the item's added sugar; no_sugar (走甜) takes off all of it.
//   "Added sugar" is what went in when it was made (sugar, syrup, honey, condensed milk), estimated
//   per item by the AI when the meal is logged. Every gram is 4 kcal of carbs.
// - less_rice (少底): halves a rice base under a 碟頭飯 style dish (a fixed, rounded HK estimate),
//   offered on rice dishes only.
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

// A rice dish, by name: 飯 in Chinese (焗豬扒飯, 炒飯, 白飯), or the word "rice" in English unless it is
// rice noodles, rice vermicelli, a rice roll (腸粉), rice balls (湯圓), rice paper, rice wine, a rice
// cake, rice crackers or congee.
const RICE_ZH = /[飯饭]/;
const RICE_EN = /\brice\b(?!\s*(noodle|vermicelli|roll|ball|paper|wine|cake|cracker|flour|milk|vinegar))/i;
const NOT_RICE_EN = /\b(congee|porridge)\b/i;

export function isRiceDish(item: { name?: string; nameZh?: string }): boolean {
  const en = item.name ?? "";
  // A dish typed in Chinese only carries the Chinese in both fields, so check both for 飯.
  if (RICE_ZH.test(item.nameZh ?? "") || RICE_ZH.test(en)) return true;
  return RICE_EN.test(en) && !NOT_RICE_EN.test(en);
}

// A drink or sweet dessert, by name, in either language: where a cha chaan teng or dessert shop adds
// the sugar, syrup or condensed milk itself, so 少甜 / 走甜 can be asked for. Never savoury food, a rice
// dish, a bake, a soda or anything already sugar-free; and an unrecognised name is a no, because a
// missing chip costs less than 走甜 on 焗豬扒飯.
const NO_SUGAR = /無糖|走甜|走糖|冇糖|零糖|無加糖|不加糖|零系|\bno (added )?sugar\b|sugar[- ]?free|unsweetened|\bzero\b|\bdiet\b/i;
const BAKED =
  /蛋糕|包|撻|餅|多士|酥|批|曲奇|雪糕|布甸|\b(cakes?|buns?|tarts?|cookies?|biscuits?|toast|pastry|pastries|croissants?|muffins?|bread|waffles?|pancakes?|ice[- ]?cream)\b/i;
// Meat and seafood, so a drink in a dish's name (咖啡排骨, 奶茶雞翼) doesn't make it one. 牛奶, 牛油 and
// 羊奶 are not meat.
const SAVOURY =
  /骨|雞|鴨|鵝|豬|牛(?![奶油])|羊(?!奶)|魚|蝦|蟹|鍋|\b(ribs?|chicken|wings?|pork|beef|lamb|mutton|fish|shrimps?|prawns?|crab|duck|goose|hot ?pot)\b/i;
const SWEET_ZH =
  /奶茶|檸檬?茶|茶走|啡|鴛鴦|好立克|華田|朱古力牛?奶|[熱凍]朱古力|豆漿|豆奶|奶昔|沙冰|檸檬?水|檸蜜|蜜糖水|薑茶|拿鐵|糖水|紅豆沙|綠豆沙|芝麻糊|[合核]桃露|杏仁[露糊茶]|豆腐?花|西米露|楊枝甘露|喳咋|龜苓膏|仙草|薑汁撞奶|湯[圓丸]|紅豆冰|菠蘿冰/;
const SWEET_EN =
  /\b(milk tea|lemon tea|coffee|latte|cappuccino|mocha|americano|macchiato|flat white|frapp\w*|yuen ?yeung|yuan ?yang|horlicks|ovaltine|hot chocolate|iced chocolate|chocolate milk|soya? ?milk|bubble tea|boba|milkshake|smoothie|lemonade|lemon water|honey lemon|lemon honey|ginger tea|sweet soup|tong ?sui|red bean soup|mung bean soup|green bean soup|black sesame soup|sesame paste|walnut (soup|paste)|almond (soup|tea|paste)|tofu pudding|douhua|tofu fa|sago|mango pomelo|herbal jelly|grass jelly|ginger milk curd|glutinous rice balls?|tangyuan|red bean ice|pineapple ice)\b/i;
// Any other tea is a cup of tea (綠茶, 菊花茶, green tea), unless it's an egg, a restaurant or a meal.
const TEA = /茶|\btea\b/i;
const TEA_NOT_DRINK =
  /茶(葉|餐|記|樓|點|粿|果|香|燻|熏|油|碗蒸|樹|泡飯)|飲茶|早茶|下午茶|\btea[- ]?(eggs?|smoked|leaf|leaves|set|house|restaurant)\b|\b(afternoon|high) tea\b/i;

export function isSweetDrinkOrDessert(item: { name?: string; nameZh?: string }): boolean {
  const text = `${item.name ?? ""} ${item.nameZh ?? ""}`;
  if (NO_SUGAR.test(text) || BAKED.test(text) || SAVOURY.test(text) || isRiceDish(item)) return false;
  return SWEET_ZH.test(text) || SWEET_EN.test(text) || (TEA.test(text) && !TEA_NOT_DRINK.test(text));
}

/**
 * The tweaks worth offering on an item, in display order. The sugar ones only on a drink or sweet
 * dessert with sugar to take out: not when the estimate says none, and not on a packaged product
 * scanned by barcode, which can't be made less sweet. 少底 only on a rice dish. A tweak already ticked
 * always stays, so it can be unticked.
 */
export function availableCustomizations(
  item: TweakableItem & {
    name?: string;
    nameZh?: string;
    source?: LogSource;
    customizations?: MealCustomization[];
  },
): MealCustomization[] {
  const active = item.customizations ?? [];
  const sugarOffered = item.source !== "barcode" && item.addedSugar !== 0 && isSweetDrinkOrDessert(item);
  const riceOffered = isRiceDish(item);
  return ALL_CUSTOMIZATIONS.filter(
    (key) => active.includes(key) || (SUGAR_TWEAKS.includes(key) ? sugarOffered : riceOffered),
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
