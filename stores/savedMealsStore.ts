import { create } from "zustand";
import { persist } from "zustand/middleware";
import { MealType, SavedMeal } from "@/types";
import { HK_DISHES } from "@/constants/hkDishes";
import { newId } from "@/utils/id";
import { persistStorage } from "./persistStorage";

const GUEST_USER = "guest";

export type NewSavedMealInput = Pick<
  SavedMeal,
  "name" | "nameZh" | "calories" | "protein" | "carbs" | "fat" | "fiber" | "addedSugar"
> & { defaultMealType?: MealType };

// The editable fields of a usual. Everything a user can change on the Manage usuals sheet; the
// bookkeeping fields (id, userId, useCount, lastUsedAt) are never patched from the UI.
export type UpdateSavedMealInput = Partial<
  Pick<
    SavedMeal,
    "name" | "nameZh" | "calories" | "protein" | "carbs" | "fat" | "fiber" | "defaultMealType"
  >
>;

// Whether a saveMeal call created a new usual or found one already there, so the UI can say
// "Saved to The usual" versus "Already in The usual" instead of silently making a duplicate chip.
export type SaveMealResult = "added" | "duplicate";

// Whether an updateMeal call applied the edit or was blocked because the new name collides with a
// DIFFERENT usual. Lets the Manage sheet keep the sheet open and warn rather than silently no-op.
export type UpdateMealResult = "updated" | "duplicate";

// Match a usual by its English name, trimmed and case-folded: this is the key users perceive on the
// row, so "  congee " must not create a second "Congee" chip beside the first.
function normaliseName(name: string): string {
  return name.trim().toLowerCase();
}

// A few common cha-chaan-teng picks so the one-tap quick-add row is useful immediately.
const SEED_NAMES: { name: string; mealType: MealType }[] = [
  { name: "HK Milk Tea", mealType: "snack" },
  { name: "Pineapple Bun", mealType: "breakfast" },
  { name: "Wonton Noodles", mealType: "lunch" },
];

interface SavedMealsState {
  meals: SavedMeal[];
  seeded: boolean;

  seedIfEmpty: () => void;
  saveMeal: (input: NewSavedMealInput) => SaveMealResult;
  updateMeal: (id: string, patch: UpdateSavedMealInput) => UpdateMealResult;
  markUsed: (id: string) => void;
  removeMeal: (id: string) => void;

  // Whether a meal with this English name is already a usual. Lets the Edit sheet show the pin as
  // done rather than offering to add a duplicate.
  isSaved: (name: string) => boolean;

  // Most-used first, then most-recent. Powers the one-tap quick-repeat row.
  topMeals: (limit?: number) => SavedMeal[];
}

function seedMeal(name: string, mealType: MealType): SavedMeal | null {
  const dish = HK_DISHES.find((d) => d.name === name);
  if (!dish) return null;
  return {
    id: newId("sm"),
    userId: GUEST_USER,
    name: dish.name,
    nameZh: dish.nameZh,
    calories: dish.calories,
    protein: dish.protein,
    carbs: dish.carbs,
    fat: dish.fat,
    fiber: 0, // curated HK dishes carry no measured fibre; honest 0 rather than an invented figure
    defaultMealType: mealType,
    useCount: 0,
    lastUsedAt: null,
  };
}

export const useSavedMealsStore = create<SavedMealsState>()(
  persist(
    (set, get) => ({
      meals: [],
      seeded: false,

      seedIfEmpty: () => {
        if (get().seeded) return;
        set((state) => {
          if (state.meals.length > 0) return { seeded: true };
          const seeded = SEED_NAMES.map((s) => seedMeal(s.name, s.mealType)).filter(
            (m): m is SavedMeal => m !== null,
          );
          return { meals: seeded, seeded: true };
        });
      },

      saveMeal: (input) => {
        // Never pin the same dish twice: a second save of an existing name is a no-op the UI
        // reports as "already there", so the row stays a clean set of distinct habits.
        const key = normaliseName(input.name);
        if (get().meals.some((m) => normaliseName(m.name) === key)) return "duplicate";
        const meal: SavedMeal = {
          id: newId("sm"),
          userId: GUEST_USER,
          name: input.name,
          nameZh: input.nameZh,
          calories: input.calories,
          protein: input.protein,
          carbs: input.carbs,
          fat: input.fat,
          fiber: input.fiber,
          defaultMealType: input.defaultMealType ?? "snack",
          useCount: 0,
          lastUsedAt: null,
          ...(input.addedSugar !== undefined ? { addedSugar: input.addedSugar } : {}),
        };
        set((state) => ({ meals: [meal, ...state.meals] }));
        return "added";
      },

      updateMeal: (id, patch) => {
        const { meals } = get();
        const target = meals.find((m) => m.id === id);
        // A missing id is a silent no-op: the Manage sheet only ever edits a meal it just listed,
        // so this guards a stale id rather than a real path. Nothing changed, nothing failed.
        if (!target) return "updated";
        // A rename must not collide with a DIFFERENT usual, mirroring saveMeal's dedupe. Renaming a
        // meal to its own name (or just editing macros) is fine, so the id !== m.id excludes self.
        if (patch.name !== undefined) {
          const key = normaliseName(patch.name);
          if (meals.some((m) => m.id !== id && normaliseName(m.name) === key)) return "duplicate";
        }
        // Spread the patch over the existing meal: useCount / lastUsedAt / id / userId are never in
        // the patch, so an edit preserves a usual's habit history.
        set((state) => ({
          meals: state.meals.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        }));
        return "updated";
      },

      isSaved: (name) => {
        const key = normaliseName(name);
        return get().meals.some((m) => normaliseName(m.name) === key);
      },

      markUsed: (id) =>
        set((state) => ({
          meals: state.meals.map((m) =>
            m.id === id
              ? { ...m, useCount: m.useCount + 1, lastUsedAt: new Date().toISOString() }
              : m,
          ),
        })),

      removeMeal: (id) => set((state) => ({ meals: state.meals.filter((m) => m.id !== id) })),

      topMeals: (limit = 6) =>
        [...get().meals]
          .sort((a, b) => {
            if (b.useCount !== a.useCount) return b.useCount - a.useCount;
            return (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? "");
          })
          .slice(0, limit),
    }),
    {
      name: "siutimsiudai-saved-meals",
      storage: persistStorage,
      partialize: (s) => ({ meals: s.meals, seeded: s.seeded }),
      onRehydrateStorage: () => (state) => {
        state?.seedIfEmpty();
      },
    },
  ),
);
