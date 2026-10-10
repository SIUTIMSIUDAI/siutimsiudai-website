import {
  ALL_CUSTOMIZATIONS,
  availableCustomizations,
  customizationSavings,
  effectiveMacros,
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

describe("customizationSavings", () => {
  it("reports the positive kcal removed", () => {
    expect(customizationSavings(BASE, ["less_sugar"])).toBe(45);
    expect(customizationSavings(BASE, ["less_rice"])).toBe(140);
    expect(customizationSavings(BASE, [])).toBe(0);
  });
});

describe("customization tables", () => {
  it("every listed tweak takes something off an item", () => {
    for (const key of ALL_CUSTOMIZATIONS) {
      expect(customizationSavings(BASE, [key])).toBeGreaterThan(0);
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
    expect(customizationSavings(milkTea, ["no_sugar"])).toBe(36);
  });

  it("falls back to a typical sweetened drink when the item has no estimate", () => {
    expect(customizationSavings(BASE, ["no_sugar"])).toBe(90);
    expect(effectiveMacros(BASE, ["no_sugar"]).carbs).toBe(78);
    expect(customizationSavings(BASE, ["less_sugar"])).toBe(45);
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

describe("availableCustomizations", () => {
  it("offers both sugar tweaks and 少底 for an item with added sugar", () => {
    expect(availableCustomizations({ source: "photo", addedSugar: 22 })).toEqual([
      "less_sugar",
      "no_sugar",
      "less_rice",
    ]);
  });

  it("offers the sugar tweaks, at typical figures, when there is no estimate", () => {
    expect(availableCustomizations({ source: "manual" })).toEqual(["less_sugar", "no_sugar", "less_rice"]);
  });

  it("hides the sugar tweaks when the item has no added sugar", () => {
    expect(availableCustomizations({ source: "photo", addedSugar: 0 })).toEqual(["less_rice"]);
  });

  it("hides the sugar tweaks for a packaged product scanned by barcode", () => {
    expect(availableCustomizations({ source: "barcode" })).toEqual(["less_rice"]);
  });

  it("still shows a sugar tweak that is already ticked, so it can be unticked", () => {
    expect(
      availableCustomizations({ source: "barcode", customizations: ["less_sugar"] }),
    ).toEqual(["less_sugar", "less_rice"]);
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
