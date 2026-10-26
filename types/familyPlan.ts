// Weekly family meal plan (Max). One plan per family per week, Sunday to Saturday: a dish per enabled meal
// slot per day, each member's portion of it, and the shopping list and 食咗 entries derived from that.
// TypeScript fields are camelCase; the SQL schema in database/0012_max_household.sql uses snake_case,
// and services/familyPlanService.ts maps between them.

import type { FamilyRole } from "./family";
import type { CanonicalUnit, MacroNutrients, MealType } from "./index";

export type PortionSize = "small" | "medium" | "large";

/** The languages helper mode speaks. Dish text is translated by AI into fil and id. */
export type HelperLanguage = "en" | "fil" | "id";
export type TranslatedLanguage = Exclude<HelperLanguage, "en">;

/** One dish's words in a helper's language, in the dish's own ingredient and step order. */
export interface DishTranslation {
  title: string;
  ingredients: string[];
  steps: string[];
}

/** A member's choice for one dish: a size, or 唔食呢餐 ("skip"). */
export type PortionChoice = PortionSize | "skip";

/** The six shopping-list groups the generator tags each ingredient with. */
export type IngredientCategory =
  | "meat"
  | "seafood"
  | "produce"
  | "eggs_dairy_soy"
  | "dry_goods"
  | "other";

export interface PlanIngredient {
  name: string;
  nameZh: string;
  /** For ONE standard (中) serving, in the canonical unit. */
  quantity: number;
  unit: CanonicalUnit;
  category: IngredientCategory;
}

export interface PlanStep {
  stepNumber: number;
  instruction: string;
  instructionZh: string;
  durationSeconds: number | null;
}

export interface PlanDish {
  id: string;
  planId: string;
  date: string; // YYYY-MM-DD
  slot: MealType;
  title: string;
  titleZh: string;
  /** One standard (中) serving. Cooking amounts scale this by everyone's portions. */
  ingredients: PlanIngredient[];
  steps: PlanStep[];
  totalMinutes: number;
  /** One standard serving, estimated by the generator (shown as 估算). */
  perServing: MacroNutrients;
  /** Kept when the day is regenerated, and not swappable until unlocked. */
  locked: boolean;
  /** When 食咗 was logged for the family, or null. */
  loggedAt: string | null;
  /** AI translations for helper mode, cached per language; dropped when the dish changes. */
  translations: Partial<Record<TranslatedLanguage, DishTranslation>>;
}

/** A dish as helper mode receives it: what to cook, never its nutrition. */
export type HelperDish = Omit<PlanDish, "perServing">;

export interface PlanMember {
  userId: string;
  role: FamilyRole;
  displayName: string | null;
  /** Used for every dish the member hasn't set a different portion for. */
  defaultSize: PortionSize;
  /** The family's helper: helper mode shows her what to cook and how much, never anyone's nutrition. */
  isHelper: boolean;
  /** The language helper mode uses for her. */
  helperLanguage: HelperLanguage;
  /** Whether she lets the planner see her food diary. Only she can turn it on. */
  sharesLog: boolean;
}

export interface WeekPlan {
  id: string;
  weekStart: string; // the Sunday, YYYY-MM-DD
  generatedAt: string; // ISO
  /** Dish swaps and day regenerations used on this plan, against REGEN_LIMIT_PER_WEEK. */
  regenUsed: number;
  dishes: PlanDish[];
  /**
   * Choices that differ from a member's usual size, by slot ("YYYY-MM-DD|dinner") then user id. Kept
   * per slot rather than per dish, so a member who isn't home for Tuesday dinner still isn't after
   * the dinner is swapped.
   */
  portions: Record<string, Record<string, PortionChoice>>;
}

/** The caller's own planning preferences. Only the member can set their exclusions. */
export interface MyPlanSettings {
  defaultSize: PortionSize;
  /** Foods they don't eat or are allergic to, in their own words. */
  exclusions: string[];
  /** Set by the planner, never by the member. */
  isHelper: boolean;
  helperLanguage: HelperLanguage;
  /** A helper's food diary is private unless she turns this on. */
  sharesLog: boolean;
}

/** The planner's latest shopping list, published for helper mode (the pantry lives on the planner's phone). */
export interface ShoppingSnapshot {
  /** When the planner's phone last worked it out (ISO). */
  updatedAt: string;
  /** The first day it shops for. */
  fromDate: string;
  groups: Array<{
    category: IngredientCategory;
    lines: Array<{ name: string; nameZh: string; quantity: number; unit: CanonicalUnit }>;
  }>;
}

/** Everything helper mode renders. No nutrition anywhere. */
export interface HelperSnapshot {
  groupId: string;
  myUserId: string;
  me: MyPlanSettings;
  members: PlanMember[];
  slots: MealType[];
  plans: Array<Omit<WeekPlan, "dishes" | "regenUsed" | "generatedAt"> & {
    dishes: HelperDish[];
    shopping: ShoppingSnapshot | null;
  }>;
}

/** Everything the plan screen renders, fetched in one go. */
export interface FamilyPlanSnapshot {
  /** The caller's role, or null when they aren't in a family yet (a Max user planning alone). */
  role: FamilyRole | null;
  /** The family the plan belongs to, or null before there is one. */
  groupId: string | null;
  /** The meal slots this family plans, remembered for next time. */
  slots: MealType[];
  members: PlanMember[];
  /** Plans for this week and next, where they exist. */
  plans: WeekPlan[];
  me: MyPlanSettings;
  /** The caller's user id, so the screen can tell which member row is theirs. */
  myUserId: string;
}

/** One person's diary entry for a dish the family ate, as 食咗 creates it. */
export interface FamilyLogEntry extends MacroNutrients {
  name: string;
  nameZh: string;
  mealType: MealType;
  /** Their portion, in standard servings (細 0.75, 中 1, 大 1.25). */
  quantity: number;
  unit: "serving";
}

/** A 食咗 entry waiting on the server for its member's phone to import it. */
export interface InboxEntry {
  id: string;
  date: string; // YYYY-MM-DD, the day the meal was planned for
  entry: FamilyLogEntry;
}

export type PlanFailReason =
  | "max_required"
  | "not_manager"
  | "not_member"
  | "already_generated"
  | "regen_limit"
  | "locked"
  | "already_logged"
  | "rate_limited"
  | "unavailable"
  | "unknown";

export type PlanResult<T> = { ok: true; value: T } | { ok: false; reason: PlanFailReason };
