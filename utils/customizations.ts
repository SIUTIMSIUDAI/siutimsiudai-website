import { LogSource, MacroNutrients, MealCustomization } from "@/types";

// 少甜 / 走甜 / 少底 order tweaks, the way a cha chaan teng waiter adjusts an order.
// - less_sugar (少甜) takes off half of the item's added sugar; no_sugar (走甜) takes off all of it.
//   "Added sugar" is what went in when it was made (sugar, syrup, honey, condensed milk), estimated
//   per item by the AI when the meal is logged. Every gram is 4 kcal of carbs.
// - less_rice (少底), on every savoury dish and scaled with it: about half the rice or noodles off a
//   rice or noodle dish, leaving the meat and veg alone; with no base to cut, a quarter smaller portion.
// Deltas are negative and applied on read, so toggling on and off is perfectly reversible.

/** What a tweak needs to know about the item it adjusts. */
export interface TweakableItem {
  // Grams of added sugar, estimated when the item was logged. Absent when there is no estimate
  // (logged before estimates existed, or typed in by hand); 0 when there is none to take out.
  addedSugar?: number | null;
  // The dish's names, which tell 少底 whether there is rice or noodles to cut.
  name?: string | null;
  nameZh?: string | null;
}

// Order the toggles render in.
export const ALL_CUSTOMIZATIONS: MealCustomization[] = ["less_sugar", "no_sugar", "less_rice"];

const SUGAR_TWEAKS: MealCustomization[] = ["less_sugar", "no_sugar"];
const KCAL_PER_G_SUGAR = 4;
const SUGAR_SHARE: Record<string, number> = { less_sugar: 0.5, no_sugar: 1 };

// Without an estimate, a sugar tweak assumes a typical sweetened HK drink or dessert: about 4½ tsp
// (22.5 g) of added sugar, so 少甜 keeps the -45 kcal it always had and 走甜 is -90 kcal.
const TYPICAL_ADDED_SUGAR_G = 22.5;

// 少底 on a rice or noodle dish takes about half the base: 40% of the dish's carbs (most of its carbs
// are the base). Each gram of base carbs carries the bit of protein and fat cooked rice has, the shape
// of the old fixed allowance (140 kcal, 3 g protein and 1 g fat per 30 g carbs).
const BASE_CARB_SHARE = 0.4;
const KCAL_PER_G_BASE_CARB = 140 / 30;
const PROTEIN_PER_G_BASE_CARB = 3 / 30;
const FAT_PER_G_BASE_CARB = 1 / 30;
// With no base to cut, 少底 is a smaller portion: a quarter less of everything.
const SMALLER_PORTION_SHARE = 0.25;

function lessBaseDelta(item: MacroNutrients & TweakableItem): MacroNutrients {
  if (lessBaseKind(item) !== "portion") {
    const carbs = BASE_CARB_SHARE * Math.max(0, item.carbs);
    return {
      calories: -carbs * KCAL_PER_G_BASE_CARB,
      protein: -carbs * PROTEIN_PER_G_BASE_CARB,
      carbs: -carbs,
      fat: -carbs * FAT_PER_G_BASE_CARB,
      fiber: 0,
    };
  }
  const s = SMALLER_PORTION_SHARE;
  return {
    calories: -item.calories * s,
    protein: -item.protein * s,
    carbs: -item.carbs * s,
    fat: -item.fat * s,
    fiber: -(item.fiber ?? 0) * s,
  };
}

function delta(key: MealCustomization, item: MacroNutrients & TweakableItem): MacroNutrients {
  if (key === "less_rice") return lessBaseDelta(item);
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

export function isRiceDish(item: { name?: string | null; nameZh?: string | null }): boolean {
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
// Meat and seafood, so a drink in a dish's name (咖啡排骨, 奶茶雞翼) doesn't make it one. 雞蛋 and 雞尾
// are not chicken; 牛奶, 牛油, 牛角 (croissant) and 羊奶 are not meat.
const SAVOURY =
  /骨|雞(?![蛋尾])|鴨|鵝|豬|牛(?![奶油角])|羊(?!奶)|魚|蝦|蟹|鍋|\b(ribs?|chicken|wings?|pork|beef|lamb|mutton|fish|shrimps?|prawns?|crab|duck|goose|hot ?pot)\b/i;
const SWEET_ZH =
  /奶茶|檸檬?茶|茶走|啡|鴛鴦|好立克|華田|朱古力牛?奶|[熱凍]朱古力|豆漿|豆奶|奶昔|沙冰|檸檬?水|檸蜜|蜜糖水|薑茶|拿鐵|糖水|紅豆沙|綠豆沙|芝麻糊|[合核]桃露|杏仁[露糊茶]|豆腐?花|西米露|楊枝甘露|喳咋|龜苓膏|仙草|薑汁撞奶|湯[圓丸]|紅豆冰|菠蘿冰/;
const SWEET_EN =
  /\b(milk tea|lemon tea|coffee|latte|cappuccino|mocha|americano|macchiato|flat white|frapp\w*|yuen ?yeung|yuan ?yang|horlicks|ovaltine|hot chocolate|iced chocolate|chocolate milk|soya? ?milk|bubble tea|boba|milkshake|smoothie|lemonade|lemon water|honey lemon|lemon honey|ginger tea|sweet soup|tong ?sui|red bean soup|mung bean soup|green bean soup|black sesame soup|sesame paste|walnut (soup|paste)|almond (soup|tea|paste)|tofu pudding|douhua|tofu fa|sago|mango pomelo|herbal jelly|grass jelly|ginger milk curd|glutinous rice balls?|tangyuan|red bean ice|pineapple ice)\b/i;
// Any other tea is a cup of tea (綠茶, 菊花茶, green tea), unless it's an egg, a restaurant or a meal.
const TEA = /茶|\btea\b/i;
const TEA_NOT_DRINK =
  /茶(葉|餐|記|樓|點|粿|果|香|燻|熏|油|碗蒸|樹|泡飯)|飲茶|早茶|下午茶|\btea[- ]?(eggs?|smoked|leaf|leaves|set|house|restaurant)\b|\b(afternoon|high) tea\b/i;

export function isSweetDrinkOrDessert(item: { name?: string | null; nameZh?: string | null }): boolean {
  const text = `${item.name ?? ""} ${item.nameZh ?? ""}`;
  if (NO_SUGAR.test(text) || BAKED.test(text) || SAVOURY.test(text) || isRiceDish(item)) return false;
  return SWEET_ZH.test(text) || SWEET_EN.test(text) || (TEA.test(text) && !TEA_NOT_DRINK.test(text));
}

// A noodle dish, by name: noodles, rice noodles (河粉, 米粉, 米線) or pasta. Not bread (麵包), bean paste
// (麵豉), flour or gluten.
const NOODLE_ZH = /麵(?![包豉粉筋])|米粉|米線|炒米|河粉|牛河|炒河|湯河|瀨粉|銀針粉|通粉|意粉|烏冬|粉絲/;
const NOODLE_EN =
  /\b(noodles?|vermicelli|ho fun|chow fun|udon|ramen|pasta|spaghetti|macaroni|linguine|penne|fettuccine|mixian|lo mein|chow mein)\b/i;

export function isNoodleDish(item: { name?: string | null; nameZh?: string | null }): boolean {
  const text = `${item.name ?? ""} ${item.nameZh ?? ""}`;
  return NOODLE_ZH.test(text) || NOODLE_EN.test(text);
}

// A savoury dish, which gets 少底 (owner, 2026-10-12): anything on rice or noodles, anything with meat
// or seafood, and any other food not recognised as a drink, a sweet or fruit. A recognised dessert stays
// a dessert (龍眼肉糖水), but meat beats a drink or fruit in the name (咖啡排骨, 菠蘿咕嚕肉).
const MEATY =
  /肉(?!桂)|叉燒|火腿|香腸|臘腸|煙肉|午餐肉|餐肉|豆腐(?!花)|\b(ham|bacon|sausages?|spam)\b|\btofu\b(?!\s*(pudding|fa|flower))/i;
const DRINK =
  /啡|豆漿|豆奶|牛奶|鮮奶|奶昔|沙冰|乳酪飲品|益力多|維他奶|汽水|可樂|七喜|雪碧|忌廉|沙示|梳打|礦泉水|蒸餾水|清水|熱水|暖水|冰水|椰青|椰子水|果汁|橙汁|蘋果汁|西柚汁|菠蘿汁|提子汁|西瓜汁|蔗汁|檸檬?水|蜜糖水|啤酒|紅酒|白酒|清酒|香檳|威士忌|雞尾酒|飲品|\b(coffee|latte|cappuccino|mocha|americano|espresso|water|juice|soda|cola|coke|sprite|7[- ]?up|lemonade|milk|milkshake|smoothie|beer|wine|sake|champagne|whiske?y|cocktail|kombucha|yakult|drink|beverage)\b/i;
const SWEET_TREAT =
  /菠蘿包|菠蘿油|雞尾包|奶油豬|撻|西多士|奶油多|奶醬多|蛋糕|曲奇|餅乾|雪糕|布甸|老婆餅|月餅|蛋卷|沙翁|雞蛋仔|格仔餅|窩夫|班戟|冬甩|甜甜圈|朱古力|糖果|甜品|麥片|燕麥|乳酪|穀物|牛角包|肉桂|\b(pineapple bun|cocktail bun|tarts?|french toast|cakes?|cookies?|biscuits?|ice[- ]?cream|puddings?|waffles?|pancakes?|crepes?|donuts?|doughnuts?|chocolates?|candy|sweets|desserts?|cereal|granola|oat(meal|s)|muesli|yogh?urt|muffins?|scones?|croissants?|brownies?|mochi|macarons?|pies?|cinnamon)\b/i;
const FRUIT =
  /水果|生果|雜果|雜莓|士多啤梨|草莓|藍莓|蘋果|香蕉|橙|提子|葡萄|西瓜|蜜瓜|哈密瓜|芒果|奇異果|菠蘿|木瓜|榴槤|火龍果|車厘子|櫻桃|荔枝|龍眼|\b(fruits?|berries|strawberr(y|ies)|blueberr(y|ies)|apples?|bananas?|oranges?|grapes?|watermelon|melon|mangoe?s?|kiwi|pineapple|papaya|durian|dragon fruit|cherr(y|ies)|lychees?)\b/i;

export function isSavouryDish(item: { name?: string | null; nameZh?: string | null }): boolean {
  if (isRiceDish(item) || isNoodleDish(item)) return true;
  if (isSweetDrinkOrDessert(item)) return false;
  const text = `${item.name ?? ""} ${item.nameZh ?? ""}`;
  if (SAVOURY.test(text) || MEATY.test(text)) return true;
  // Drinks and desserts by name even when sugar-free (無糖豆漿, 無糖豆腐花), which the sweet check skips.
  const drinkOrDessert =
    SWEET_ZH.test(text) || SWEET_EN.test(text) || DRINK.test(text) || (TEA.test(text) && !TEA_NOT_DRINK.test(text));
  return !(drinkOrDessert || SWEET_TREAT.test(text) || FRUIT.test(text));
}

/** What 少底 cuts on an item: its rice, its noodles, or (with no base) the portion. */
export type LessBaseKind = "rice" | "noodles" | "portion";

export function lessBaseKind(item: { name?: string | null; nameZh?: string | null }): LessBaseKind {
  if (isRiceDish(item)) return "rice";
  if (isNoodleDish(item)) return "noodles";
  return "portion";
}

const LABEL_KEY: Record<MealCustomization, string> = {
  less_sugar: "custom.lessSugar",
  no_sugar: "custom.noSugar",
  less_rice: "custom.lessRice",
};
const LESS_BASE_LABEL_KEY: Record<LessBaseKind, string> = {
  rice: "custom.lessRice",
  noodles: "custom.lessNoodles",
  portion: "custom.smallerPortion",
};

/**
 * The i18n key for a tweak's chip. 少底 is 少底 in Chinese everywhere, but English says what it cuts
 * ("Less rice", "Less noodles", "Smaller portion"), so it never says rice on a bowl of noodles.
 */
export function customizationLabelKey(
  key: MealCustomization,
  item: { name?: string | null; nameZh?: string | null },
): string {
  return key === "less_rice" ? LESS_BASE_LABEL_KEY[lessBaseKind(item)] : LABEL_KEY[key];
}

/**
 * The tweaks worth offering on an item, in display order. The sugar ones only on a drink or sweet
 * dessert with sugar to take out: not when the estimate says none, and not on a packaged product
 * scanned by barcode, which can't be made less sweet. 少底 on every savoury dish, but not a packaged
 * one. A tweak already ticked always stays, so it can be unticked.
 */
export function availableCustomizations(
  item: TweakableItem & {
    source?: LogSource;
    customizations?: MealCustomization[];
  },
): MealCustomization[] {
  const active = item.customizations ?? [];
  const notPackaged = item.source !== "barcode";
  const sugarOffered = notPackaged && item.addedSugar !== 0 && isSweetDrinkOrDessert(item);
  const lessBaseOffered = notPackaged && isSavouryDish(item);
  return ALL_CUSTOMIZATIONS.filter(
    (key) => active.includes(key) || (SUGAR_TWEAKS.includes(key) ? sugarOffered : lessBaseOffered),
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
