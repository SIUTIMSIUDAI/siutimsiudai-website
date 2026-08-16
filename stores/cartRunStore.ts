import { create } from "zustand";
import { persist } from "zustand/middleware";
import { GroceryRetailer } from "@/types";
import { canonicalizeIngredient } from "@/constants/ingredientDictionary";
import { persistStorage } from "./persistStorage";

/**
 * A shopping run: which store you picked for a recipe, and which of its missing ingredients you
 * have already put in your basket. Persisted, because a run is interrupted by definition. You leave
 * for HKTVmall, the OS may evict us while you shop, and coming back to a list that forgot
 * everything would be worse than having no ticks at all.
 *
 * Ticks are keyed by CANONICAL INGREDIENT NAME, never by GroceryListItem.id. That is not a style
 * preference: missingItemsFromRecipe runs the grocery merge fresh every time, and the merge mints a
 * new genId() for every row, so those ids change on any recompute (a pantry edit, a re-render after
 * returning from the store). Ids would look fine in a single sitting and silently lose every tick
 * the moment anything upstream moved. The canonical key is stable, already language-independent,
 * and is the same identity the availability check uses.
 */
export interface CartRun {
  retailer: GroceryRetailer;
  checkedKeys: string[];
}

interface CartRunState {
  // Keyed by recipe id. Runs are per-recipe by design: the sheet is opened from a dish.
  runs: Record<string, CartRun>;

  /** Begin (or switch) a run for a recipe. Changing store keeps the ticks: you bought the ginger. */
  startRun: (recipeId: string, retailer: GroceryRetailer) => void;
  /** Tick or untick one ingredient. Untick has to work, because people mis-tap in a supermarket. */
  toggleItem: (recipeId: string, ingredientName: string) => void;
  /** True if this ingredient is already in the basket for this run. */
  isChecked: (recipeId: string, ingredientName: string) => boolean;
  /** How many of the given ingredients are ticked, for the "2 of 4" counter. */
  checkedCount: (recipeId: string, ingredientNames: string[]) => number;
  /**
   * Drop ticks for ingredients that are no longer missing. Called when the sheet opens: if the
   * pantry gained soy sauce since yesterday, yesterday's tick for it must not linger and inflate
   * the progress on a list that no longer contains it.
   */
  reconcile: (recipeId: string, ingredientNames: string[]) => void;
  /** Finish the run and forget it, so the next visit starts clean. */
  clearRun: (recipeId: string) => void;
}

export const useCartRunStore = create<CartRunState>()(
  persist(
    (set, get) => ({
      runs: {},

      startRun: (recipeId, retailer) =>
        set((s) => ({
          runs: {
            ...s.runs,
            [recipeId]: { retailer, checkedKeys: s.runs[recipeId]?.checkedKeys ?? [] },
          },
        })),

      toggleItem: (recipeId, ingredientName) =>
        set((s) => {
          const run = s.runs[recipeId];
          if (!run) return s;
          const key = canonicalizeIngredient(ingredientName);
          const checkedKeys = run.checkedKeys.includes(key)
            ? run.checkedKeys.filter((k) => k !== key)
            : [...run.checkedKeys, key];
          return { runs: { ...s.runs, [recipeId]: { ...run, checkedKeys } } };
        }),

      isChecked: (recipeId, ingredientName) =>
        get().runs[recipeId]?.checkedKeys.includes(canonicalizeIngredient(ingredientName)) ?? false,

      checkedCount: (recipeId, ingredientNames) => {
        const keys = get().runs[recipeId]?.checkedKeys;
        if (!keys?.length) return 0;
        // Count distinct ingredients, since two rows can canonicalise to the same key.
        const present = new Set(ingredientNames.map(canonicalizeIngredient));
        return keys.filter((k) => present.has(k)).length;
      },

      reconcile: (recipeId, ingredientNames) =>
        set((s) => {
          const run = s.runs[recipeId];
          if (!run) return s;
          const live = new Set(ingredientNames.map(canonicalizeIngredient));
          const checkedKeys = run.checkedKeys.filter((k) => live.has(k));
          // Only write when something actually changed, so opening the sheet does not churn
          // AsyncStorage or re-render every subscriber for nothing.
          if (checkedKeys.length === run.checkedKeys.length) return s;
          return { runs: { ...s.runs, [recipeId]: { ...run, checkedKeys } } };
        }),

      clearRun: (recipeId) =>
        set((s) => {
          if (!s.runs[recipeId]) return s;
          const runs = { ...s.runs };
          delete runs[recipeId];
          return { runs };
        }),
    }),
    {
      name: "siutimsiudai-cart-run",
      storage: persistStorage,
      partialize: (s) => ({ runs: s.runs }),
    },
  ),
);
