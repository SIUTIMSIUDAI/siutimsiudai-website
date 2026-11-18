import type { HealthySwap, Recipe, RecipeNutrition } from "@/types";
import { useRecipeStore } from "@/stores/recipeStore";
import { isNutritionFresh, nutritionBasis } from "@/utils/recipeNutrition";

// The estimate lives on the recipe so it costs one estimator call per dish, not one per visit. These
// pin when it stays valid (rescaling), when it goes stale (a swap) and when an old one comes back
// for free (undoing the swaps).

const base = (): Recipe => ({
  id: "r-soy",
  userId: "u",
  title: "Soy Sauce Braised Chicken",
  titleZh: "豉油雞",
  servings: 4,
  sourceType: "manual",
  sourceUrl: null,
  imageUri: null,
  totalMinutes: 45,
  ingredients: [
    { id: "i1", recipeId: "r-soy", name: "Chicken thigh", nameZh: "雞髀", quantity: 786, unit: "g", displayUnit: "g", rawText: "雞髀 786g", substitutedFrom: null },
    { id: "i2", recipeId: "r-soy", name: "Dark soy sauce", nameZh: "老抽", quantity: 15, unit: "ml", displayUnit: "tbsp", rawText: "老抽 1 湯匙", substitutedFrom: null },
  ],
  steps: [{ id: "s1", recipeId: "r-soy", stepNumber: 1, instruction: "Braise the chicken thigh.", instructionZh: "炆雞髀。", imageUri: null, durationSeconds: null }],
  createdAt: "2026-10-01T00:00:00.000Z",
});

const OTHER: Recipe = { ...base(), id: "r-other", title: "Other", titleZh: "其他" };

const SWAP: HealthySwap = {
  ingredientId: "i1",
  original: "Chicken thigh",
  originalZh: "雞髀",
  substitute: "Chicken breast",
  substituteZh: "雞胸",
  quantityRatio: 1,
  reason: "Leaner cut",
  reasonZh: "較瘦",
  source: "curated",
};

const nutritionFor = (r: Recipe, calories: number): RecipeNutrition => ({
  perServing: { calories, protein: 38, carbs: 9, fat: 25, fiber: 0.5 },
  micros: null,
  basis: nutritionBasis(r),
  estimatedAt: "2026-10-19T08:00:00.000Z",
});

const get = (id = "r-soy") => useRecipeStore.getState().recipes.find((r) => r.id === id)!;

beforeEach(() => {
  useRecipeStore.setState({ recipes: [base(), OTHER], seeded: true });
});

describe("saving a recipe's estimate", () => {
  it("stores it on that recipe only", () => {
    const n = nutritionFor(base(), 420);
    useRecipeStore.getState().setRecipeNutrition("r-soy", n);
    expect(get().nutrition).toEqual(n);
    expect(get("r-other").nutrition).toBeUndefined();
  });

  it("stays valid when the servings are changed", () => {
    useRecipeStore.getState().setRecipeNutrition("r-soy", nutritionFor(base(), 420));
    useRecipeStore.getState().scaleServings("r-soy", 3);
    expect(isNutritionFresh(get())).toBe(true);
  });

  it("goes stale once a healthy swap changes the ingredients", () => {
    useRecipeStore.getState().setRecipeNutrition("r-soy", nutritionFor(base(), 420));
    useRecipeStore.getState().applyHealthySwaps("r-soy", [SWAP]);
    expect(isNutritionFresh(get())).toBe(false);
  });

  it("brings the original estimate back, still valid, when the swaps are undone", () => {
    const original = nutritionFor(base(), 420);
    useRecipeStore.getState().setRecipeNutrition("r-soy", original);
    useRecipeStore.getState().applyHealthySwaps("r-soy", [SWAP]);
    // The healthier version gets its own estimate while it's showing.
    useRecipeStore.getState().setRecipeNutrition("r-soy", nutritionFor(get(), 350));

    useRecipeStore.getState().revertHealthySwaps("r-soy");

    expect(get().nutrition).toEqual(original);
    expect(isNutritionFresh(get())).toBe(true);
  });
});
