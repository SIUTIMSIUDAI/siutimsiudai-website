import type { IngredientCategory, PortionSize } from "@/types/familyPlan";
import type { MealType } from "@/types";

// The family plan's numbers, kept in one place so they can be tuned without touching the logic.

/** 細 / 中 / 大 as a share of one standard serving (owner's brief, 2026-10-21). */
export const PORTION_FACTOR: Record<PortionSize, number> = {
  small: 0.75,
  medium: 1,
  large: 1.25,
};

export const PORTION_SIZES: PortionSize[] = ["small", "medium", "large"];

/** Every slot a family can plan, in the order a day is shown. Snacks start switched off. */
export const PLAN_SLOTS: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
export const DEFAULT_PLAN_SLOTS: MealType[] = ["breakfast", "lunch", "dinner"];

/** The order the shopping list is grouped in. */
export const CATEGORY_ORDER: IngredientCategory[] = [
  "meat",
  "seafood",
  "produce",
  "eggs_dairy_soy",
  "dry_goods",
  "other",
];

/** Dish swaps plus day regenerations a family gets per plan week, on top of the one full generation. */
export const REGEN_LIMIT_PER_WEEK = 20;
