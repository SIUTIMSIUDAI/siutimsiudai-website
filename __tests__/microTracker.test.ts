import {
  isLimitMicro,
  emptyMicroTotals,
  sanitizeMicros,
  sumMicroTotals,
  TRACKED_MICRO_KEYS,
} from "@/utils/micros";
import { useNutritionStore } from "@/stores/nutritionStore";
import { useSubscriptionStore } from "@/stores/useSubscriptionStore";
import { parseRecipeResponse } from "@/services/recipeGenerationService";
import type { EntryMicronutrients } from "@/types";

// The premium micronutrient tracker. Everything here is pure or store-level so the two guarantees
// that matter — (1) untrusted numbers are sanitised, (2) the tracker is premium-only end to end —
// are provable without rendering the dashboard widget or booting the paywall.

describe("sanitizeMicros", () => {
  it("keeps known finite non-negative fields, rounded to 2dp", () => {
    expect(
      sanitizeMicros({ iron: 3.456, calcium: 120, potassium: 300, vitaminC: 12, vitaminD: 1.2 }),
    ).toEqual({ iron: 3.46, calcium: 120, potassium: 300, vitaminC: 12, vitaminD: 1.2 });
  });

  it("drops negatives, non-numbers and unknown keys (never trusts the model)", () => {
    expect(sanitizeMicros({ iron: -5, calcium: "lots", magnesium: 40, vitaminC: 9 })).toEqual({
      vitaminC: 9,
    });
  });

  it("returns undefined for non-objects or empty/unusable payloads", () => {
    expect(sanitizeMicros(null)).toBeUndefined();
    expect(sanitizeMicros("x")).toBeUndefined();
    expect(sanitizeMicros({})).toBeUndefined();
    expect(sanitizeMicros({ foo: 1 })).toBeUndefined();
  });

  it("retains sodium when present even though the tracker doesn't chart it", () => {
    expect(sanitizeMicros({ sodium: 480 })).toEqual({ sodium: 480 });
  });
});

describe("sumMicroTotals", () => {
  it("is all zero for no entries", () => {
    expect(sumMicroTotals([])).toEqual(emptyMicroTotals());
  });

  it("adds the six tracked micros across entries and ignores null / absent captures", () => {
    expect(
      sumMicroTotals([
        { micros: { iron: 2, calcium: 100, potassium: 200, sodium: 600, vitaminC: 10, vitaminD: 1 } },
        { micros: null },
        { micros: { iron: 1, potassium: 50, sodium: 400 } },
        {},
      ]),
    ).toEqual({ iron: 3, calcium: 100, potassium: 250, sodium: 1000, vitaminC: 10, vitaminD: 1 });
  });

  // Owner, 2026-11-17: the estimator returns sodium, and the tracker charts it as a daily ceiling.
  it("tracks sodium, as a ceiling", () => {
    const totals = sumMicroTotals([{ micros: { sodium: 999 } as EntryMicronutrients }]);
    expect(totals.sodium).toBe(999);
    expect(TRACKED_MICRO_KEYS).toContain("sodium");
    expect(isLimitMicro("sodium")).toBe(true);
    expect(isLimitMicro("iron")).toBe(false);
  });
});

// The gate that keeps the whole feature premium: micros are stripped at the save path for free
// users, so their running totals are structurally zero — no widget state can leak real figures.
describe("microTotalsForDate is premium-only by construction", () => {
  const DATE = "2026-07-12";
  const CAPTURE: EntryMicronutrients = {
    iron: 2,
    calcium: 50,
    potassium: 100,
    sodium: 300,
    vitaminC: 5,
    vitaminD: 1,
  };

  beforeEach(() => {
    useNutritionStore.setState({ logsByDate: {} });
  });

  it("sums the captured micros for a paid user's logged meals", () => {
    useSubscriptionStore.setState({ activeTier: "pro" });
    useNutritionStore.getState().addEntry(
      {
        name: "Congee",
        nameZh: "粥",
        calories: 270,
        protein: 16,
        carbs: 40,
        fat: 5,
        fiber: 3,
        mealType: "lunch",
        micros: CAPTURE,
      },
      DATE,
    );
    expect(useNutritionStore.getState().microTotalsForDate(DATE)).toEqual(CAPTURE);
  });

  it("stays all zero for a free user even when the meal carried micros", () => {
    useSubscriptionStore.setState({ activeTier: "free" });
    useNutritionStore.getState().addEntry(
      {
        name: "Congee",
        nameZh: "粥",
        calories: 270,
        protein: 16,
        carbs: 40,
        fat: 5,
        fiber: 3,
        mealType: "lunch",
        micros: CAPTURE,
      },
      DATE,
    );
    expect(useNutritionStore.getState().microTotalsForDate(DATE)).toEqual(emptyMicroTotals());
  });
});

// Re-estimating a logged meal from a corrected name flows fresh micros through editEntry. That
// patch must obey the SAME free/paid gate as the log path, or a free user could edit premium
// micros into their history the save path would have stripped. And a macro-only edit (no
// re-estimate) must never touch a paid user's existing micros.
describe("editEntry applies the micros tier-gate to a re-estimate patch", () => {
  const DATE = "2026-07-13";
  const CAPTURE: EntryMicronutrients = {
    iron: 2,
    calcium: 50,
    potassium: 100,
    sodium: 300,
    vitaminC: 5,
    vitaminD: 1,
  };

  beforeEach(() => {
    useNutritionStore.setState({ logsByDate: {} });
  });

  function seed(micros?: EntryMicronutrients): string {
    useNutritionStore.getState().addEntry(
      {
        name: "Congee",
        nameZh: "粥",
        calories: 270,
        protein: 16,
        carbs: 40,
        fat: 5,
        fiber: 3,
        mealType: "lunch",
        micros,
      },
      DATE,
    );
    return useNutritionStore.getState().entriesForDate(DATE)[0].id;
  }

  it("keeps re-estimated micros for a paid user's edited entry", () => {
    useSubscriptionStore.setState({ activeTier: "pro" });
    const id = seed();
    useNutritionStore.getState().editEntry(DATE, id, { calories: 300, micros: CAPTURE });
    const entry = useNutritionStore.getState().entriesForDate(DATE)[0];
    expect(entry.calories).toBe(300);
    expect(entry.micros).toEqual(CAPTURE);
  });

  it("drops re-estimated micros to null for a free user's edited entry", () => {
    useSubscriptionStore.setState({ activeTier: "free" });
    const id = seed();
    useNutritionStore.getState().editEntry(DATE, id, { calories: 300, micros: CAPTURE });
    const entry = useNutritionStore.getState().entriesForDate(DATE)[0];
    expect(entry.calories).toBe(300);
    expect(entry.micros).toBeNull();
  });

  it("leaves an existing paid entry's micros untouched on a macro-only edit (no re-estimate)", () => {
    useSubscriptionStore.setState({ activeTier: "pro" });
    const id = seed(CAPTURE);
    useNutritionStore.getState().editEntry(DATE, id, { calories: 300 });
    const entry = useNutritionStore.getState().entriesForDate(DATE)[0];
    expect(entry.calories).toBe(300);
    expect(entry.micros).toEqual(CAPTURE);
  });
});

describe("parseRecipeResponse micros", () => {
  const base = {
    title: "Egg Bowl",
    titleZh: "蛋碗",
    ingredients: [{ name: "egg", nameZh: "蛋", quantity: 2, unit: "piece" }],
    steps: [{ stepNumber: 1, instruction: "cook", instructionZh: "煮" }],
  };

  it("sanitises the model's per-serving micro estimate onto the recipe", () => {
    const r = parseRecipeResponse({
      recipe: {
        ...base,
        micros: { iron: 2.5, calcium: 80, potassium: 210, vitaminC: 3, vitaminD: 1.1, magnesium: 99 },
      },
    });
    expect(r?.micros).toEqual({ iron: 2.5, calcium: 80, potassium: 210, vitaminC: 3, vitaminD: 1.1 });
  });

  it("omits micros entirely when the model returns none", () => {
    const r = parseRecipeResponse({ recipe: base });
    expect(r?.micros).toBeUndefined();
  });
});
