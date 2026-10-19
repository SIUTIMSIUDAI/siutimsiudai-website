import { useCallback, useEffect, useState } from "react";
import type { Recipe, RecipeNutrition } from "@/types";
import { useRecipeStore } from "@/stores/recipeStore";
import { estimateRecipeNutrition, type RecipeNutritionOutcome } from "@/services/recipeNutritionService";
import { isNutritionFresh, nutritionBasis } from "@/utils/recipeNutrition";

export type RecipeNutritionStatus = "estimating" | "ready" | "failed";

export interface RecipeNutritionState {
  status: RecipeNutritionStatus;
  /** The saved estimate, only while it still matches the recipe's ingredients. */
  nutrition: RecipeNutrition | null;
  /** Ask again after a failure. Nothing retries on its own: every call is a paid AI call. */
  retry: () => void;
}

// One estimate per dish and ingredient list at a time, shared by every screen showing it, so
// reopening a recipe mid-estimate waits on the same call instead of paying for a second one.
const inFlight = new Map<string, Promise<RecipeNutritionOutcome>>();

function startEstimate(recipe: Recipe, key: string, basis: string): Promise<RecipeNutritionOutcome> {
  const running = inFlight.get(key);
  if (running) return running;
  const call = estimateRecipeNutrition(recipe).then((out) => {
    inFlight.delete(key);
    // Saved even if the screen has gone, so the next visit opens straight onto the numbers. But only
    // for the ingredient list it was asked about: a swap made mid-flight gets its own estimate.
    const current = useRecipeStore.getState().recipes.find((r) => r.id === recipe.id);
    if (out.ok && current && nutritionBasis(current) === basis) {
      useRecipeStore.getState().setRecipeNutrition(recipe.id, out.nutrition);
    }
    return out;
  });
  inFlight.set(key, call);
  return call;
}

/**
 * One serving's nutrition for the recipe card: shown at once when a saved estimate still matches the
 * ingredients, otherwise estimated once and saved on the recipe (see utils/recipeNutrition.ts).
 */
export function useRecipeNutrition(recipe: Recipe): RecipeNutritionState {
  const basis = nutritionBasis(recipe);
  const fresh = isNutritionFresh(recipe);
  const key = `${recipe.id}:${basis}`;
  const [failedKey, setFailedKey] = useState<string | null>(null);

  useEffect(() => {
    if (fresh || failedKey === key) return;
    let alive = true;
    startEstimate(recipe, key, basis).then((out) => {
      if (alive && !out.ok) setFailedKey(key);
    });
    return () => {
      alive = false;
    };
    // The recipe is read through `key` (id + ingredient fingerprint): a title edit must not re-estimate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fresh, failedKey]);

  const retry = useCallback(() => setFailedKey(null), []);

  return {
    status: fresh ? "ready" : failedKey === key ? "failed" : "estimating",
    nutrition: fresh ? (recipe.nutrition ?? null) : null,
    retry,
  };
}
