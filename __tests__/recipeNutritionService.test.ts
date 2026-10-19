import type { ParsedMeal, Recipe } from "@/types";
import { nutritionBasis, oneServingRequest } from "@/utils/recipeNutrition";

// The estimator is the one external call here (Gemini behind the estimate-meal Edge Function), so
// it is the only thing faked. Everything the service decides from its answer runs for real.
jest.mock("@/services/nlpMealService", () => ({ nlpMealService: { parse: jest.fn() } }));

import { nlpMealService } from "@/services/nlpMealService";
import { estimateRecipeNutrition } from "@/services/recipeNutritionService";

const parse = nlpMealService.parse as jest.Mock;

const RECIPE: Recipe = {
  id: "seed-soy-chicken",
  userId: "u",
  title: "Soy Sauce Braised Chicken",
  titleZh: "豉油雞",
  servings: 4,
  sourceType: "manual",
  sourceUrl: null,
  imageUri: null,
  totalMinutes: 45,
  ingredients: [
    { id: "i1", recipeId: "seed-soy-chicken", name: "Chicken", nameZh: "雞肉", quantity: 786, unit: "g", displayUnit: "catty", rawText: "雞 1.3 斤", substitutedFrom: null },
    { id: "i2", recipeId: "seed-soy-chicken", name: "Dark soy sauce", nameZh: "老抽", quantity: 15, unit: "ml", displayUnit: "tbsp", rawText: "老抽 1 湯匙", substitutedFrom: null },
  ],
  steps: [],
  createdAt: "2026-10-01T00:00:00.000Z",
};

// Two items exactly as nlpMealService hands them back after sanitising the model's answer.
const MEALS: ParsedMeal[] = [
  { name: "Chicken", nameZh: "雞肉", calories: 300, protein: 30, carbs: 2, fat: 18, fiber: 0, quantity: 197, unit: "g", mealType: "dinner", micros: { iron: 1.5, potassium: 300 } },
  { name: "Dark soy sauce", nameZh: "老抽", calories: 120, protein: 8, carbs: 7, fat: 7, fiber: 1, quantity: 4, unit: "ml", mealType: "dinner" },
];

const NOW = new Date("2026-10-19T08:00:00.000Z");

beforeEach(() => parse.mockReset());

describe("estimateRecipeNutrition", () => {
  it("asks about one serving and saves the summed answer with its fingerprint", async () => {
    parse.mockResolvedValue({ ok: true, meals: MEALS });
    const out = await estimateRecipeNutrition(RECIPE, () => NOW);

    expect(parse).toHaveBeenCalledWith(oneServingRequest(RECIPE));
    expect(out).toEqual({
      ok: true,
      nutrition: {
        perServing: { calories: 420, protein: 38, carbs: 9, fat: 25, fiber: 1 },
        micros: { iron: 1.5, calcium: 0, potassium: 300, vitaminC: 0, vitaminD: 0 },
        basis: nutritionBasis(RECIPE),
        estimatedAt: "2026-10-19T08:00:00.000Z",
      },
    });
  });

  it("reports failure when the estimator is rate-limited or down, with no numbers", async () => {
    parse.mockResolvedValue({ ok: false, error: "rate_limited" });
    expect(await estimateRecipeNutrition(RECIPE, () => NOW)).toEqual({ ok: false });
  });

  it("reports failure when the estimator can't say what the dish is", async () => {
    parse.mockResolvedValue({ ok: true, meals: [] });
    expect(await estimateRecipeNutrition(RECIPE, () => NOW)).toEqual({ ok: false });
  });

  it("reports failure instead of throwing when the call itself blows up", async () => {
    parse.mockRejectedValue(new Error("network down"));
    expect(await estimateRecipeNutrition(RECIPE, () => NOW)).toEqual({ ok: false });
  });
});
