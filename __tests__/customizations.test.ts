import {
  ALL_CUSTOMIZATIONS,
  CUSTOMIZATION_DELTAS,
  customizationSavings,
  effectiveMacros,
  sumEntryMacros,
} from "@/utils/customizations";
import { MacroNutrients, MealCustomization } from "@/types";

const BASE: MacroNutrients = { calories: 800, protein: 30, carbs: 100, fat: 25 };

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
  });

  it("applies 少底 (less rice): -140 kcal, -30 carbs, -3 protein, -1 fat", () => {
    const m = effectiveMacros(BASE, ["less_rice"]);
    expect(m.calories).toBe(660);
    expect(m.carbs).toBe(70);
    expect(m.protein).toBe(27);
    expect(m.fat).toBe(24);
  });

  it("stacks both tweaks", () => {
    const m = effectiveMacros(BASE, ["less_sugar", "less_rice"]);
    expect(m.calories).toBe(800 - 45 - 140);
    expect(m.carbs).toBe(100 - 11 - 30);
  });

  it("never returns a negative field (small item, big tweak)", () => {
    const tiny: MacroNutrients = { calories: 20, protein: 1, carbs: 4, fat: 0 };
    const m = effectiveMacros(tiny, ["less_rice"]);
    expect(m.calories).toBe(0);
    expect(m.carbs).toBe(0);
    expect(m.protein).toBe(0);
    expect(m.fat).toBe(0);
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
  it("has a delta for every listed customization", () => {
    for (const key of ALL_CUSTOMIZATIONS) {
      expect(CUSTOMIZATION_DELTAS[key]).toBeDefined();
    }
  });
});

type Entry = MacroNutrients & { customizations?: MealCustomization[] };

describe("sumEntryMacros", () => {
  it("sums base macros when there are no customizations", () => {
    const entries: Entry[] = [
      { calories: 500, protein: 20, carbs: 60, fat: 15 },
      { calories: 300, protein: 10, carbs: 40, fat: 8 },
    ];
    expect(sumEntryMacros(entries)).toEqual({ calories: 800, protein: 30, carbs: 100, fat: 23 });
  });

  it("applies 少甜/少底 deltas before summing (never below zero per entry)", () => {
    // less_sugar removes 45 kcal / 11 carbs; less_rice removes 140 kcal / 3 protein / 30 carbs / 1 fat.
    const entries: Entry[] = [
      { calories: 600, protein: 12, carbs: 90, fat: 10, customizations: ["less_rice"] },
      { calories: 200, protein: 2, carbs: 30, fat: 3, customizations: ["less_sugar"] },
    ];
    // entry 1 -> 460/9/60/9 ; entry 2 -> 155/2/19/3
    expect(sumEntryMacros(entries)).toEqual({ calories: 615, protein: 11, carbs: 79, fat: 12 });
  });

  it("returns zeros for an empty day", () => {
    expect(sumEntryMacros([])).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  });
});
