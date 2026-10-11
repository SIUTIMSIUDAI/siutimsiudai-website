import {
  ALL_CUSTOMIZATIONS,
  availableCustomizations,
  effectiveMacros,
  isRiceDish,
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

  it("applies 少底 (less rice): -140 kcal, -30 carbs, -3 protein, -1 fat", () => {
    const m = effectiveMacros(BASE, ["less_rice"]);
    expect(m.calories).toBe(660);
    expect(m.carbs).toBe(70);
    expect(m.protein).toBe(27);
    expect(m.fat).toBe(24);
    expect(m.fiber).toBe(8); // fibre is untouched by 少底
  });

  it("stacks both tweaks", () => {
    const m = effectiveMacros(BASE, ["less_sugar", "less_rice"]);
    expect(m.calories).toBe(800 - 45 - 140);
    expect(m.carbs).toBe(100 - 11 - 30);
  });

  it("never returns a negative field (small item, big tweak)", () => {
    const tiny: MacroNutrients = { calories: 20, protein: 1, carbs: 4, fat: 0, fiber: 0 };
    const m = effectiveMacros(tiny, ["less_rice"]);
    expect(m.calories).toBe(0);
    expect(m.carbs).toBe(0);
    expect(m.protein).toBe(0);
    expect(m.fat).toBe(0);
    expect(m.fiber).toBe(0);
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

  it("leaves 少底 as it was, alongside a sugar tweak", () => {
    const meal = { calories: 700, protein: 25, carbs: 95, fat: 20, fiber: 3, addedSugar: 10 };
    const m = effectiveMacros(meal, ["less_rice", "no_sugar"]);
    expect(m.calories).toBe(700 - 140 - 40);
    expect(m.carbs).toBe(95 - 30 - 10);
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
    expect(availableCustomizations({ name: "Wonton noodles", nameZh: "雲吞麵", source: "manual" })).toEqual([]);
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

type Entry = MacroNutrients & { customizations?: MealCustomization[]; addedSugar?: number };

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
    // less_sugar removes 45 kcal / 11 carbs; less_rice removes 140 kcal / 3 protein / 30 carbs / 1 fat.
    const entries: Entry[] = [
      { calories: 600, protein: 12, carbs: 90, fat: 10, fiber: 4, customizations: ["less_rice"] },
      { calories: 200, protein: 2, carbs: 30, fat: 3, fiber: 1, customizations: ["less_sugar"] },
    ];
    // entry 1 -> 460/9/60/9 ; entry 2 -> 155/2/19/3 ; fibre untouched by both tweaks (4 + 1)
    expect(sumEntryMacros(entries)).toEqual({
      calories: 615,
      protein: 11,
      carbs: 79,
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
