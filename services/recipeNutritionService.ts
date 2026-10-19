import type { Recipe, RecipeNutrition } from "@/types";
import { nutritionBasis, oneServingRequest, sumServing } from "@/utils/recipeNutrition";
import { nlpMealService } from "./nlpMealService";

// One serving of a recipe, estimated by the same meal estimator the diary uses (the estimate-meal
// Edge Function, through nlpMealService). Reusing it means no new server code: it already returns
// calories, macros and the five tracked micros, respects stated amounts, keeps the AI credential
// server-side, and has its own demo estimator for builds without Supabase (web preview, tests).
//
// Like every service here that can fail, this returns an outcome rather than numbers no matter
// what. A failed, rate-limited or empty answer is a failure the card reports, never a 0 kcal dish.

export type RecipeNutritionOutcome = { ok: true; nutrition: RecipeNutrition } | { ok: false };

export async function estimateRecipeNutrition(
  recipe: Recipe,
  now: () => Date = () => new Date(),
): Promise<RecipeNutritionOutcome> {
  try {
    const answer = await nlpMealService.parse(oneServingRequest(recipe));
    if (!answer.ok) return { ok: false };
    const serving = sumServing(answer.meals);
    if (!serving) return { ok: false };
    return {
      ok: true,
      nutrition: { ...serving, basis: nutritionBasis(recipe), estimatedAt: now().toISOString() },
    };
  } catch {
    return { ok: false };
  }
}
