import {
  ALL_CUSTOMIZATIONS,
  availableCustomizations,
  customizationLabelKey,
  effectiveMacros,
  isNoodleDish,
  isRiceDish,
  isSavouryDish,
  isSweetDrinkOrDessert,
  sumEntryMacros,
  toggledCustomizations,
} from "@/utils/customizations";
import { MacroNutrients, MealCustomization } from "@/types";

const BASE: MacroNutrients = { calories: 800, protein: 30, carbs: 100, fat: 25, fiber: 8 };

describe("effectiveMacros", () => {
  it("returns the base (rounded) when nothing is toggled", () => {
    expect(effectiveMacros(BASE, undefined)).toEqual(BASE);
    expect(effectiveMacros(BASE, [])).toEqual(BASE);
  });

  it("applies 少甜 (less sugar): -45 kcal, -11 carbs", () => {
    const m = effectiveMacros(BASE, ["less_sugar"]);
    expect(m.calories).toBe(755);
    expect(m.carbs).toBe(89);
    expect(m.protein).toBe(30);
    expect(m.fat).toBe(25);
    expect(m.fiber).toBe(8); // fibre is untouched by 少甜
  });

  it("stacks a sugar tweak and 少底, each worked out from the untweaked item", () => {
    // No name, so 少底 is a quarter smaller portion; 少甜 with no estimate is the typical 11.25 g.
    const m = effectiveMacros(BASE, ["less_sugar", "less_rice"]);
    expect(m.calories).toBe(800 - 45 - 200);
    expect(m.carbs).toBe(Math.round(100 - 11.25 - 25));
  });

  it("never returns a negative field (small item, stacked tweaks)", () => {
    const tiny: MacroNutrients = { calories: 20, protein: 1, carbs: 4, fat: 0, fiber: 0 };
    const m = effectiveMacros(tiny, ["no_sugar", "less_rice"]);
    expect(m.calories).toBe(0);
    expect(m.carbs).toBe(0);
    for (const v of Object.values(m)) expect(v).toBeGreaterThanOrEqual(0);
  });

  it("treats a missing fiber field as 0 g (entry logged before fibre tracking)", () => {
    // Rehydrated pre-fibre entries have no `fiber` key; the getter must not yield NaN.
    const legacy = { calories: 200, protein: 8, carbs: 20, fat: 5 } as MacroNutrients;
    expect(effectiveMacros(legacy, undefined).fiber).toBe(0);
  });
});

describe("customization tables", () => {
  it("every listed tweak takes something off an item", () => {
    for (const key of ALL_CUSTOMIZATIONS) {
      expect(effectiveMacros(BASE, [key]).calories).toBeLessThan(BASE.calories);
    }
  });
});

// A sweetened drink the AI estimated: 22 g of its carbs are added sugar.
const LEMON_TEA = { calories: 160, protein: 0, carbs: 38, fat: 0, fiber: 0, addedSugar: 22 };

describe("sugar tweaks with the item's own added sugar", () => {
  it("takes off all the added sugar for 走甜: 4 kcal a gram", () => {
    const m = effectiveMacros(LEMON_TEA, ["no_sugar"]);
    expect(m.carbs).toBe(16);
    expect(m.calories).toBe(72);
  });

  it("takes off half of it for 少甜", () => {
    const m = effectiveMacros(LEMON_TEA, ["less_sugar"]);
    expect(m.carbs).toBe(27);
    expect(m.calories).toBe(116);
  });

  it("uses each item's own amount, so a less sweet item saves less", () => {
    const milkTea = { calories: 120, protein: 3, carbs: 18, fat: 5, fiber: 0, addedSugar: 9 };
    expect(effectiveMacros(milkTea, ["no_sugar"]).calories).toBe(120 - 36);
  });

  it("falls back to a typical sweetened drink when the item has no estimate", () => {
    expect(effectiveMacros(BASE, ["no_sugar"]).calories).toBe(800 - 90);
    expect(effectiveMacros(BASE, ["no_sugar"]).carbs).toBe(78);
    expect(effectiveMacros(BASE, ["less_sugar"]).calories).toBe(800 - 45);
  });

  it("never goes below zero, even with the typical fallback on a small item", () => {
    const small: MacroNutrients = { calories: 50, protein: 1, carbs: 10, fat: 1, fiber: 0 };
    const m = effectiveMacros(small, ["no_sugar"]);
    expect(m.calories).toBe(10);
    expect(m.carbs).toBe(0);
  });

  it("counts only 走甜 if both sugar tweaks are somehow on", () => {
    expect(effectiveMacros(LEMON_TEA, ["less_sugar", "no_sugar"])).toEqual(
      effectiveMacros(LEMON_TEA, ["no_sugar"]),
    );
  });

  it("applies 少底 and a sugar tweak side by side on an older entry that has both ticked", () => {
    const meal = { name: "Sweet and sour pork rice", nameZh: "咕嚕肉飯", calories: 700, protein: 25, carbs: 95, fat: 20, fiber: 3, addedSugar: 10 };
    const m = effectiveMacros(meal, ["less_rice", "no_sugar"]);
    // 少底: 40% of 95 g carbs = 38 g of rice carbs; 走甜: 10 g sugar.
    expect(m.carbs).toBe(95 - 38 - 10);
    expect(m.calories).toBe(Math.round(700 - (38 * 140) / 30 - 40));
  });
});

// Owner, 2026-10-12: 少底 on every savoury dish, scaled with the dish. On a rice or noodle dish it takes
// about half the base (40% of the dish's carbs, with the bit of protein and fat rice carries, the shape
// of the old fixed 140 kcal / 30 g allowance); the meat and veg are untouched. With no base to cut,
// it's a quarter smaller portion of everything.
describe("少底 scales with the dish", () => {
  const PLATE: MacroNutrients = { calories: 800, protein: 30, carbs: 100, fat: 25, fiber: 8 };

  it("takes about half the rice off a rice dish, from its carbs", () => {
    const m = effectiveMacros({ ...PLATE, name: "Baked pork chop rice", nameZh: "焗豬扒飯" }, ["less_rice"]);
    expect(m.carbs).toBe(60); // 40 g of rice carbs off
    expect(m.calories).toBe(Math.round(800 - (40 * 140) / 30));
    expect(m.protein).toBe(26); // rice carries a little protein...
    expect(m.fat).toBe(24); // ...and fat
    expect(m.fiber).toBe(8); // fibre untouched, as before
  });

  it("does the same with noodles", () => {
    const m = effectiveMacros({ ...PLATE, name: "Wonton noodles", nameZh: "雲吞麵" }, ["less_rice"]);
    expect(m.carbs).toBe(60);
    expect(m.calories).toBe(Math.round(800 - (40 * 140) / 30));
  });

  it("matches the figures the owner approved: 焗豬扒飯 about -195 kcal, 雲吞麵 about -100", () => {
    const porkChopRice = { name: "Baked Pork Chop Rice", nameZh: "焗豬扒飯", calories: 850, protein: 32, carbs: 105, fat: 30, fiber: 3 };
    const wontonNoodles = { name: "Wonton Noodles", nameZh: "雲吞麵", calories: 430, protein: 20, carbs: 55, fat: 14, fiber: 2 };
    expect(850 - effectiveMacros(porkChopRice, ["less_rice"]).calories).toBe(196);
    expect(430 - effectiveMacros(wontonNoodles, ["less_rice"]).calories).toBe(103);
  });

  it("makes any other savoury dish a quarter smaller", () => {
    const m = effectiveMacros({ ...PLATE, name: "Poached chicken", nameZh: "白切雞" }, ["less_rice"]);
    expect(m).toEqual({ calories: 600, protein: 23, carbs: 75, fat: 19, fiber: 6 });
  });

  it("counts a 200 kcal plate of 燒賣 as -50", () => {
    const siuMai = { name: "Siu mai", nameZh: "燒賣", calories: 200, protein: 10, carbs: 16, fat: 11, fiber: 1 };
    expect(effectiveMacros(siuMai, ["less_rice"]).calories).toBe(150);
  });
});

const TEA = { name: "Iced lemon tea", nameZh: "凍檸茶" };
const PORK_CHOP_RICE = { name: "Baked pork chop rice", nameZh: "焗豬扒飯" };

describe("availableCustomizations", () => {
  it("offers both sugar tweaks on a sweet drink, and no 少底", () => {
    expect(availableCustomizations({ ...TEA, source: "photo", addedSugar: 22 })).toEqual([
      "less_sugar",
      "no_sugar",
    ]);
  });

  it("offers the sugar tweaks on a drink, at typical figures, when there is no estimate", () => {
    expect(availableCustomizations({ ...TEA, source: "manual" })).toEqual(["less_sugar", "no_sugar"]);
  });

  it("offers them on a sweet dessert too", () => {
    expect(availableCustomizations({ name: "Red bean soup", nameZh: "紅豆沙", source: "manual" })).toEqual([
      "less_sugar",
      "no_sugar",
    ]);
  });

  it("offers only 少底 on a rice dish with no added sugar", () => {
    expect(availableCustomizations({ ...PORK_CHOP_RICE, source: "photo", addedSugar: 0 })).toEqual([
      "less_rice",
    ]);
  });

  // Owner, 2026-10-11: 焗豬扒飯 should not have 少甜 / 走甜. Old 老規矩 entries carry no estimate, which
  // used to fall back to "a typical sweet drink" and put sugar chips on every savoury dish.
  it("never offers sugar tweaks on savoury food, even with no estimate", () => {
    expect(availableCustomizations({ ...PORK_CHOP_RICE, source: "manual" })).toEqual(["less_rice"]);
    expect(availableCustomizations({ name: "Wonton noodles", nameZh: "雲吞麵", source: "manual" })).toEqual([
      "less_rice",
    ]);
  });

  // Owner, 2026-10-12: every savoury dish gets 少底, not only rice dishes.
  it("offers 少底 on every savoury dish", () => {
    for (const [name, nameZh] of [
      ["Siu mai", "燒賣"],
      ["Poached chicken", "白切雞"],
      ["Curry fish balls", "咖喱魚蛋"],
      ["Ham sandwich", "火腿三文治"],
      ["Pork chop bun", "豬扒包"],
    ]) {
      expect(availableCustomizations({ name, nameZh, source: "manual" })).toEqual(["less_rice"]);
    }
  });

  it("but not on drinks, sweets or fruit", () => {
    for (const [name, nameZh] of [
      ["Coke", "可樂"],
      ["Water", "清水"],
      ["Unsweetened soy milk", "無糖豆漿"],
      ["Egg tart", "蛋撻"],
      ["Mixed berries", "雜莓"],
      ["Cereal", "麥片"],
    ]) {
      expect(availableCustomizations({ name, nameZh, source: "manual" })).toEqual([]);
    }
  });

  it("nor on a packaged item scanned by barcode", () => {
    expect(availableCustomizations({ name: "Instant noodles", nameZh: "出前一丁", source: "barcode" })).toEqual([]);
  });

  it("nor on a savoury dish whose sauce has sugar in it", () => {
    const sweetSourPork = { name: "Sweet and sour pork rice", nameZh: "咕嚕肉飯", source: "photo" as const, addedSugar: 12 };
    expect(availableCustomizations(sweetSourPork)).toEqual(["less_rice"]);
  });

  it("nor on a bun, or on anything already sugar-free", () => {
    expect(availableCustomizations({ name: "Pineapple bun", nameZh: "菠蘿包", source: "manual" })).toEqual([]);
    expect(
      availableCustomizations({ name: "無糖豆漿燕麥片配奇亞籽", nameZh: "無糖豆漿燕麥片配奇亞籽", source: "manual" }),
    ).toEqual([]);
  });

  it("offers nothing on a packaged drink scanned by barcode", () => {
    expect(availableCustomizations({ name: "Vita lemon tea", nameZh: "維他檸檬茶", source: "barcode" })).toEqual([]);
  });

  it("still shows a tweak that is already ticked, so it can be unticked", () => {
    expect(
      availableCustomizations({ ...TEA, source: "barcode", customizations: ["less_sugar", "less_rice"] }),
    ).toEqual(["less_sugar", "less_rice"]);
  });
});

describe("isRiceDish", () => {
  it("knows a rice dish by 飯 in its Chinese name", () => {
    for (const nameZh of ["焗豬扒飯", "揚州炒飯", "白飯", "石鍋拌飯", "飯糰"]) {
      expect(isRiceDish({ name: "", nameZh })).toBe(true);
    }
  });

  it("knows a rice dish by the word 'rice' in its English name", () => {
    for (const name of ["Steamed rice", "Yangzhou fried rice", "Glutinous rice with chicken", "Rice"]) {
      expect(isRiceDish({ name, nameZh: "" })).toBe(true);
    }
  });

  it("leaves out rice noodles, rice rolls, rice paper, rice wine, rice cakes, rice crackers and congee", () => {
    const notRice: Array<[string, string]> = [
      ["Rice noodle roll", "腸粉"],
      // The name 腸粉 carries in the app's own HK dish list (constants/hkDishes.ts).
      ["Steamed Rice Roll", "腸粉"],
      ["Fried rice vermicelli", "炒米粉"],
      ["Rice paper rolls", "米紙卷"],
      ["Rice wine", "米酒"],
      ["Rice cake", "年糕"],
      ["Rice crackers", "米餅"],
      ["Rice porridge", "白粥"],
    ];
    for (const [name, nameZh] of notRice) expect(isRiceDish({ name, nameZh })).toBe(false);
  });

  it("leaves out 湯圓, a dessert of glutinous rice balls", () => {
    expect(isRiceDish({ name: "Glutinous rice balls in ginger soup", nameZh: "薑汁湯圓" })).toBe(false);
  });

  it("isn't fooled by drinks, noodles or words that merely contain 'rice'", () => {
    expect(isRiceDish({ name: "Hong Kong milk tea", nameZh: "港式奶茶" })).toBe(false);
    expect(isRiceDish({ name: "Beef chow fun", nameZh: "乾炒牛河" })).toBe(false);
    expect(isRiceDish({ name: "Price special", nameZh: "" })).toBe(false);
  });
});

// 少甜 / 走甜 are things you ask a cha chaan teng or dessert shop for: on drinks and sweet desserts,
// where they add the sugar, syrup or condensed milk themselves (owner's choice, 2026-10-11).
describe("isSweetDrinkOrDessert", () => {
  const yes = (name: string, nameZh: string) => expect(isSweetDrinkOrDessert({ name, nameZh })).toBe(true);
  const no = (name: string, nameZh: string) => expect(isSweetDrinkOrDessert({ name, nameZh })).toBe(false);

  it("knows the drinks", () => {
    yes("Hong Kong milk tea", "港式奶茶");
    yes("Iced lemon tea", "凍檸茶");
    yes("Hot coffee", "熱咖啡");
    yes("Yuenyeung", "鴛鴦");
    yes("Soy milk", "豆漿");
    yes("Bubble milk tea", "珍珠奶茶");
    yes("Horlicks", "好立克");
    yes("Matcha latte", "抹茶拿鐵");
    yes("Green tea", "綠茶");
    yes("Honey lemon", "檸蜜");
  });

  it("knows them typed in Chinese only", () => {
    yes("凍啡", "凍啡");
    yes("檸檬水", "檸檬水");
    yes("菊花茶", "菊花茶");
  });

  it("knows them typed in English only", () => {
    yes("Iced latte", "");
    yes("Mango pomelo sago", "");
  });

  it("doesn't take milk or butter for meat", () => {
    yes("Chocolate milk", "朱古力牛奶");
    yes("Avocado milkshake", "牛油果奶昔");
  });

  it("knows the sweet desserts", () => {
    yes("Red bean soup", "紅豆沙");
    yes("Tofu pudding", "豆腐花");
    yes("Mango pomelo sago", "楊枝甘露");
    yes("Black sesame soup", "芝麻糊");
    yes("Glutinous rice balls in ginger soup", "薑汁湯圓");
    yes("Sweet soup", "糖水");
  });

  it("leaves out savoury food, even when it has a drink in its name", () => {
    no("Baked pork chop rice", "焗豬扒飯");
    no("Wonton noodles", "雲吞麵");
    no("Coffee pork ribs", "咖啡排骨");
    no("Milk tea chicken wings", "奶茶雞翼");
    no("Lemon chicken", "檸檬雞");
    no("Tea egg", "茶葉蛋");
    no("Chawanmushi", "茶碗蒸");
    no("Yuenyeung fried rice", "鴛鴦炒飯");
  });

  it("leaves out buns, cakes and tarts", () => {
    no("Pineapple bun", "菠蘿包");
    no("Egg tart", "蛋撻");
    no("Lemon tart", "檸檬撻");
    no("Hong Kong-style French toast", "西多士");
    no("Matcha cake", "抹茶蛋糕");
  });

  it("leaves out a tea meal, which isn't a cup of tea", () => {
    no("Cha chaan teng set", "茶餐廳常餐");
    no("Afternoon tea set", "下午茶餐");
  });

  it("leaves out sodas and anything already sugar-free", () => {
    no("Coke", "可樂");
    no("Coke Zero", "零系可樂");
    no("Unsweetened soy milk", "無糖豆漿");
    no("無糖豆漿燕麥片配奇亞籽", "無糖豆漿燕麥片配奇亞籽");
    no("Iced lemon tea, no sugar", "凍檸茶走甜");
  });

  it("says no when it doesn't recognise the name", () => {
    no("Mystery bowl", "");
  });
});

describe("isNoodleDish", () => {
  it("knows noodles, rice noodles and pasta", () => {
    for (const [name, nameZh] of [
      ["Wonton noodles", "雲吞麵"],
      ["Beef brisket noodles", "牛腩麵"],
      ["Dry-fried beef ho fun", "乾炒牛河"],
      ["Singapore fried vermicelli", "星洲炒米"],
      ["Fried rice vermicelli", "炒米粉"],
      ["Mixian", "米線"],
      ["Spaghetti bolognese", "肉醬意粉"],
      ["Macaroni soup with ham", "火腿通粉"],
      ["Udon", "烏冬"],
    ]) {
      expect(isNoodleDish({ name, nameZh })).toBe(true);
    }
  });

  it("knows them in either language alone", () => {
    expect(isNoodleDish({ name: "星洲炒米", nameZh: "星洲炒米" })).toBe(true);
    expect(isNoodleDish({ name: "Spaghetti carbonara", nameZh: "" })).toBe(true);
  });

  it("isn't fooled by bread, bean paste or a rice dish", () => {
    expect(isNoodleDish({ name: "Bread", nameZh: "麵包" })).toBe(false);
    expect(isNoodleDish({ name: "Steamed fish with bean paste", nameZh: "麵豉蒸魚" })).toBe(false);
    expect(isNoodleDish({ name: "Baked pork chop rice", nameZh: "焗豬扒飯" })).toBe(false);
  });
});

describe("isSavouryDish", () => {
  const yes = (name: string, nameZh: string) => expect(isSavouryDish({ name, nameZh })).toBe(true);
  const no = (name: string, nameZh: string) => expect(isSavouryDish({ name, nameZh })).toBe(false);

  it("counts rice and noodle dishes, meat, seafood and dim sum", () => {
    yes("Baked pork chop rice", "焗豬扒飯");
    yes("Wonton noodles", "雲吞麵");
    yes("Poached chicken", "白切雞");
    yes("Shrimp dumplings", "蝦餃");
    yes("Siu mai", "燒賣");
    yes("Char siu bao", "叉燒包");
    yes("Century egg and pork congee", "皮蛋瘦肉粥");
  });

  it("counts a savoury dish with a drink or fruit in its name", () => {
    yes("Coffee pork ribs", "咖啡排骨");
    yes("Sweet and sour pork with pineapple", "菠蘿咕嚕肉");
    yes("菠蘿咕嚕肉", "菠蘿咕嚕肉"); // Chinese only: 肉 beats 菠蘿
    yes("Yuenyeung fried rice", "鴛鴦炒飯");
    yes("Pineapple fried rice", "菠蘿炒飯"); // the rice base beats 菠蘿
  });

  it("keeps a dessert a dessert, even with 肉 in it", () => {
    no("Longan sweet soup", "龍眼肉糖水");
  });

  it("counts an unrecognised dish as savoury", () => {
    yes("Scrambled eggs with tomato", "番茄炒蛋");
  });

  it("leaves out drinks, sweet or not", () => {
    no("Hong Kong milk tea", "港式奶茶");
    no("Unsweetened soy milk", "無糖豆漿");
    no("Coke", "可樂");
    no("Orange juice", "橙汁");
    no("Water", "清水");
    no("Beer", "啤酒");
    no("Green tea, unsweetened", "無糖綠茶");
    no("Sugar-free tofu pudding", "無糖豆腐花");
    // Typed in Chinese only, a sugar-free dessert is known only by its dessert name.
    no("無糖豆腐花", "無糖豆腐花");
    no("無糖紅豆沙", "無糖紅豆沙");
  });

  it("leaves out desserts, sweet bakes, cereal and fruit", () => {
    no("Red bean soup", "紅豆沙");
    no("Pineapple bun", "菠蘿包");
    no("Cocktail bun", "雞尾包");
    no("Egg waffle", "雞蛋仔");
    no("Egg tart", "蛋撻");
    no("Hong Kong-style French toast", "西多士");
    no("Cereal", "麥片");
    no("Mixed berries", "雜莓");
    no("Banana", "香蕉");
    no("Croissant", "牛角包");
    no("Cinnamon roll", "肉桂卷");
  });

  it("still counts a tea egg or a tea set meal, which aren't drinks", () => {
    yes("Tea egg", "茶葉蛋");
    yes("Cha chaan teng set", "茶餐廳常餐");
  });
});

describe("customizationLabelKey", () => {
  it("names 少底 by what it takes off, so English never says rice on noodles", () => {
    expect(customizationLabelKey("less_rice", { name: "Baked pork chop rice", nameZh: "焗豬扒飯" })).toBe("custom.lessRice");
    expect(customizationLabelKey("less_rice", { name: "Wonton noodles", nameZh: "雲吞麵" })).toBe("custom.lessNoodles");
    expect(customizationLabelKey("less_rice", { name: "Poached chicken", nameZh: "白切雞" })).toBe("custom.smallerPortion");
  });

  it("keeps the sugar labels as they are", () => {
    expect(customizationLabelKey("less_sugar", {})).toBe("custom.lessSugar");
    expect(customizationLabelKey("no_sugar", {})).toBe("custom.noSugar");
  });
});

describe("toggledCustomizations", () => {
  it("ticks and unticks a tweak", () => {
    expect(toggledCustomizations([], "less_rice")).toEqual(["less_rice"]);
    expect(toggledCustomizations(["less_rice"], "less_rice")).toEqual([]);
  });

  it("swaps 少甜 for 走甜 and back, never both", () => {
    expect(toggledCustomizations(["less_sugar", "less_rice"], "no_sugar")).toEqual(["less_rice", "no_sugar"]);
    expect(toggledCustomizations(["no_sugar"], "less_sugar")).toEqual(["less_sugar"]);
  });

  it("treats a missing list as nothing ticked", () => {
    expect(toggledCustomizations(undefined, "no_sugar")).toEqual(["no_sugar"]);
  });
});

type Entry = MacroNutrients & {
  customizations?: MealCustomization[];
  addedSugar?: number;
  name?: string;
  nameZh?: string;
};

describe("sumEntryMacros", () => {
  it("sums base macros when there are no customizations", () => {
    const entries: Entry[] = [
      { calories: 500, protein: 20, carbs: 60, fat: 15, fiber: 3 },
      { calories: 300, protein: 10, carbs: 40, fat: 8, fiber: 2 },
    ];
    expect(sumEntryMacros(entries)).toEqual({
      calories: 800,
      protein: 30,
      carbs: 100,
      fat: 23,
      fiber: 5,
    });
  });

  it("applies 少甜/少底 deltas before summing (never below zero per entry)", () => {
    // 少底 on a rice dish takes 40% of its carbs (36 g here: 168 kcal, 3.6 g protein, 1.2 g fat);
    // 少甜 with no estimate takes 11.25 g sugar (45 kcal).
    const entries: Entry[] = [
      { name: "Char siu rice", nameZh: "叉燒飯", calories: 600, protein: 12, carbs: 90, fat: 10, fiber: 4, customizations: ["less_rice"] },
      { calories: 200, protein: 2, carbs: 30, fat: 3, fiber: 1, customizations: ["less_sugar"] },
    ];
    // entry 1 -> 432/8/54/9 ; entry 2 -> 155/2/19/3 ; fibre untouched by both tweaks (4 + 1)
    expect(sumEntryMacros(entries)).toEqual({
      calories: 587,
      protein: 10,
      carbs: 73,
      fat: 12,
      fiber: 5,
    });
  });

  it("uses each entry's own added sugar when summing a day", () => {
    const entries: Entry[] = [
      { ...LEMON_TEA, customizations: ["no_sugar"] },
      { calories: 300, protein: 10, carbs: 40, fat: 8, fiber: 2 },
    ];
    expect(sumEntryMacros(entries).calories).toBe(72 + 300);
  });

  it("returns zeros for an empty day", () => {
    expect(sumEntryMacros([])).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
  });

  it("sums a day mixing pre-fibre and new entries to a number, not NaN", () => {
    // The realistic post-update state: some entries predate fibre tracking (no `fiber` field),
    // some carry it. The day total must stay a real number, with legacy entries counted as 0 g.
    const legacy = { calories: 400, protein: 10, carbs: 50, fat: 12 } as Entry;
    const fresh: Entry = { calories: 100, protein: 5, carbs: 10, fat: 2, fiber: 6 };
    const total = sumEntryMacros([legacy, fresh]);
    expect(total.fiber).toBe(6);
    expect(Number.isNaN(total.fiber)).toBe(false);
    expect(total.calories).toBe(500);
  });
});
