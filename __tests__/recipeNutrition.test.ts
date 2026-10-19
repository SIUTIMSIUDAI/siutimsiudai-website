import type { RecipeIngredient, RecipeNutrition } from "@/types";
import {
  formatAmount,
  formatShare,
  isNutritionFresh,
  nutritionBasis,
  oneServingRequest,
  servingVerdict,
  shareOfTarget,
  sumServing,
} from "@/utils/recipeNutrition";

// The recipe card answers "does one serving fit what's left of today, and what does it give me?".
// Everything it shows is computed here, so these tests pin the numbers a cook will read.

const ing = (name: string, quantity: number, unit: RecipeIngredient["unit"], nameZh = name): RecipeIngredient => ({
  id: `i-${name}`,
  recipeId: "r",
  name,
  nameZh,
  quantity,
  unit,
  displayUnit: unit,
  rawText: `${name} ${quantity}${unit}`,
  substitutedFrom: null,
});

// 豉油雞 for four, and the same dish scaled to three exactly as the store's round2 scaling leaves it.
const SOY_CHICKEN = {
  title: "Soy Sauce Braised Chicken",
  titleZh: "豉油雞",
  servings: 4,
  ingredients: [ing("chicken", 786, "g", "雞肉"), ing("dark soy sauce", 15, "ml", "老抽"), ing("ginger", 3, "piece", "薑")],
};
const SOY_CHICKEN_FOR_THREE = {
  ...SOY_CHICKEN,
  servings: 3,
  ingredients: [ing("chicken", 589.5, "g", "雞肉"), ing("dark soy sauce", 11.25, "ml", "老抽"), ing("ginger", 2.25, "piece", "薑")],
};

const estimate = (basis: string): RecipeNutrition => ({
  perServing: { calories: 420, protein: 38, carbs: 9, fat: 25, fiber: 0.5 },
  micros: null,
  basis,
  estimatedAt: "2026-10-19T08:00:00.000Z",
});

describe("nutritionBasis: when a saved estimate still describes the dish", () => {
  it("is the same for any serving count, so scaling never re-estimates", () => {
    expect(nutritionBasis(SOY_CHICKEN_FOR_THREE)).toBe(nutritionBasis(SOY_CHICKEN));
  });

  it("changes when an ingredient changes, as after a healthy swap", () => {
    const swapped = { ...SOY_CHICKEN, ingredients: [ing("chicken breast", 786, "g"), ...SOY_CHICKEN.ingredients.slice(1)] };
    expect(nutritionBasis(swapped)).not.toBe(nutritionBasis(SOY_CHICKEN));
  });

  it("changes when an amount per serving changes", () => {
    const moreSoy = { ...SOY_CHICKEN, ingredients: [SOY_CHICKEN.ingredients[0], ing("dark soy sauce", 30, "ml"), SOY_CHICKEN.ingredients[2]] };
    expect(nutritionBasis(moreSoy)).not.toBe(nutritionBasis(SOY_CHICKEN));
  });

  it("ignores the Chinese names, so translating a recipe never re-estimates it", () => {
    const retranslated = { ...SOY_CHICKEN, ingredients: SOY_CHICKEN.ingredients.map((i) => ({ ...i, nameZh: `${i.nameZh}（新）` })) };
    expect(nutritionBasis(retranslated)).toBe(nutritionBasis(SOY_CHICKEN));
  });
});

describe("isNutritionFresh", () => {
  it("is fresh when the saved estimate was made from this ingredient list", () => {
    expect(isNutritionFresh({ ...SOY_CHICKEN, nutrition: estimate(nutritionBasis(SOY_CHICKEN)) })).toBe(true);
  });

  it("is stale with no estimate, or one made from different ingredients", () => {
    expect(isNutritionFresh({ ...SOY_CHICKEN, nutrition: null })).toBe(false);
    expect(isNutritionFresh({ ...SOY_CHICKEN })).toBe(false);
    expect(isNutritionFresh({ ...SOY_CHICKEN, nutrition: estimate("something else") })).toBe(false);
  });
});

describe("oneServingRequest", () => {
  it("asks the estimator about exactly one serving, ingredient by ingredient", () => {
    expect(oneServingRequest(SOY_CHICKEN)).toBe(
      "One serving (1/4 of the recipe) of Soy Sauce Braised Chicken (豉油雞), made from: chicken 197 g, dark soy sauce 3.8 ml, ginger 0.8 piece",
    );
  });
});

describe("sumServing", () => {
  it("adds the estimator's items into one serving", () => {
    expect(
      sumServing([
        { calories: 300, protein: 30, carbs: 2, fat: 18, fiber: 0, micros: { iron: 1.5 } },
        { calories: 120, protein: 8, carbs: 7, fat: 7, fiber: 0.5 },
      ]),
    ).toEqual({
      perServing: { calories: 420, protein: 38, carbs: 9, fat: 25, fiber: 0.5 },
      micros: { iron: 1.5, calcium: 0, potassium: 0, vitaminC: 0, vitaminD: 0 },
    });
  });

  it("never invents vitamins: no micros on any item means none to show", () => {
    expect(sumServing([{ calories: 300, protein: 30, carbs: 2, fat: 18, fiber: 0 }])?.micros).toBeNull();
  });

  it("treats an empty or zero-calorie answer as no estimate at all", () => {
    expect(sumServing([])).toBeNull();
    expect(sumServing([{ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }])).toBeNull();
  });
});

describe("servingVerdict: does one serving fit what's left of today", () => {
  it("fits, with what's left before and after", () => {
    const v = servingVerdict(420, 1150, 1800);
    expect(v).toMatchObject({ fits: true, left: 650, after: 230, over: 0 });
    expect(v.eatenShare).toBeCloseTo(0.639, 3);
    expect(v.dishShare).toBeCloseTo(0.233, 3);
  });

  it("goes over, by how much, with the dish filling only the room that's left", () => {
    const v = servingVerdict(420, 1500, 1800);
    expect(v).toMatchObject({ fits: false, left: 300, over: 120 });
    expect(v.dishShare).toBeCloseTo(0.167, 3);
  });

  it("is already over before this dish", () => {
    expect(servingVerdict(420, 1900, 1800)).toMatchObject({ fits: false, over: 520, eatenShare: 1, dishShare: 0 });
  });

  it("fits exactly at the target", () => {
    expect(servingVerdict(650, 1150, 1800)).toMatchObject({ fits: true, after: 0, over: 0 });
  });

  it("never divides by a missing target", () => {
    expect(servingVerdict(100, 0, 0)).toMatchObject({ fits: true, eatenShare: 0, dishShare: 0 });
  });
});

describe("shares and number formats", () => {
  it("gives a share of the daily target, or nothing without a target", () => {
    expect(shareOfTarget(38, 90)).toBeCloseTo(42.2, 1);
    expect(shareOfTarget(5, undefined)).toBeNull();
    expect(shareOfTarget(5, null)).toBeNull();
    expect(shareOfTarget(5, 0)).toBeNull();
  });

  it("formats shares as whole percents, with <1% for a trace", () => {
    expect(formatShare(0.4)).toBe("<1%");
    expect(formatShare(0)).toBe("0%");
    expect(formatShare(42.2)).toBe("42%");
  });

  // Owner, 2026-10-19: zero reads "0g", not "0.0g". Same for any whole amount below 10 ("8g").
  it("formats amounts without a pointless .0: one decimal below 10 only when it says something", () => {
    expect(formatAmount(0, "g")).toBe("0g");
    expect(formatAmount(8, "g")).toBe("8g");
    expect(formatAmount(1, "g")).toBe("1g");
    expect(formatAmount(0.5, "g")).toBe("0.5g");
    expect(formatAmount(2.4, "mg")).toBe("2.4mg");
    expect(formatAmount(38.4, "g")).toBe("38g");
    expect(formatAmount(450, "mg")).toBe("450mg");
    expect(formatAmount(0.3, "mcg")).toBe("0.3mcg");
    expect(formatAmount(12, "mcg")).toBe("12mcg");
    expect(formatAmount(9.96, "g")).toBe("10g");
  });
});
