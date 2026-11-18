import { CATEGORY_ORDER, PLAN_SLOTS, PORTION_FACTOR } from "@/constants/portionSizes";
import { GRAMS_PER_TAEL } from "@/constants/units";
import type { CanonicalUnit, MealType, PantryItem } from "@/types";
import type { FamilyRole } from "@/types/family";
import type {
  FamilyLogEntry,
  InboxEntry,
  IngredientCategory,
  PlanDish,
  PlanIngredient,
  PlanMember,
  PortionChoice,
  PortionSize,
  WeekPlan,
} from "@/types/familyPlan";
import { addDays } from "@/utils/dateRange";
import { mergeIngredients, strictCanonical, type MergeInput } from "@/utils/groceryMerge";

// The weekly family plan's arithmetic, pure so every number a cook or a diary sees is unit-tested.
// A dish is stored as ONE standard (中) serving; everything else is derived from that and from each
// member's portion: what the cook makes, what each person's share is worth, what the week still needs
// from the shops, and the diary entries 食咗 writes.

type Portions = WeekPlan["portions"];

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The seven days of a plan week, from its Monday. */
export function planWeekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** The days a new plan cooks for: today onwards in the current week, the whole of a later one. */
export function daysToPlan(weekStart: string, today: string): string[] {
  return planWeekDates(weekStart).filter((d) => d >= today);
}

/** The slots a family has switched on, once each and in the order a day is shown. */
export function normaliseSlots(raw: unknown): MealType[] {
  if (!Array.isArray(raw)) return [];
  return PLAN_SLOTS.filter((s) => raw.includes(s));
}

/** The key portions are kept under: a day's slot, so a choice outlives a swapped dish. */
export function slotKey(dish: Pick<PlanDish, "date" | "slot">): string {
  return `${dish.date}|${dish.slot}`;
}

/** A member's choice for one slot: what they set for it, or their usual size. */
export function choiceFor(key: string, member: PlanMember, portions: Portions): PortionChoice {
  return portions[key]?.[member.userId] ?? member.defaultSize;
}

export interface Eater {
  userId: string;
  size: PortionSize;
  factor: number;
}

/** Everyone eating in a slot, in roster order. 唔食呢餐 leaves a member out. */
export function eatersOf(key: string, members: PlanMember[], portions: Portions): Eater[] {
  const eaters: Eater[] = [];
  for (const m of members) {
    const choice = choiceFor(key, m, portions);
    if (choice !== "skip") eaters.push({ userId: m.userId, size: choice, factor: PORTION_FACTOR[choice] });
  }
  return eaters;
}

/** How many standard servings to cook: 細 + 中 + 大 is 0.75 + 1 + 1.25 = 3. */
export function servingsFor(eaters: Eater[]): number {
  return round2(eaters.reduce((sum, e) => sum + e.factor, 0));
}

/** The dish's ingredients for that many standard servings. */
export function scaledIngredients(dish: Pick<PlanDish, "ingredients">, servings: number): PlanIngredient[] {
  return dish.ingredients.map((i) => ({ ...i, quantity: round2(i.quantity * servings) }));
}

/** One person's share of a standard serving's estimated calories. */
export function personKcal(perServingKcal: number, factor: number): number {
  return Math.round(perServingKcal * factor);
}

/** The planner sets anyone's portion; everyone else sets only their own. */
export function canEditPortion(myUserId: string, myRole: FamilyRole | null, targetUserId: string): boolean {
  return myRole === "manager" || myUserId === targetUserId;
}

/** 食咗 is for a meal that's due (today or earlier) and hasn't been logged for the family yet. */
export function canLogDish(dish: Pick<PlanDish, "date" | "loggedAt">, today: string): boolean {
  return dish.date <= today && !dish.loggedAt;
}

export interface MealLogLine {
  userId: string;
  size: PortionSize;
  entry: FamilyLogEntry;
}

/** What 食咗 writes: each eater's own share, for their own diary. Nobody eating means nothing. */
export function mealLogLines(dish: PlanDish, members: PlanMember[], portions: Portions): MealLogLine[] {
  const s = dish.perServing;
  return eatersOf(slotKey(dish), members, portions).map(({ userId, size, factor }) => ({
    userId,
    size,
    entry: {
      name: dish.title,
      nameZh: dish.titleZh,
      mealType: dish.slot,
      calories: personKcal(s.calories, factor),
      protein: round1(s.protein * factor),
      carbs: round1(s.carbs * factor),
      fat: round1(s.fat * factor),
      fiber: round1(s.fiber * factor),
      quantity: factor,
      unit: "serving",
    },
  }));
}

export interface ShoppingLine {
  key: string;
  name: string;
  nameZh: string;
  /** Still to buy, in the canonical unit. */
  quantity: number;
  unit: CanonicalUnit;
  category: IngredientCategory;
  dishIds: string[];
}

export interface WeeklyShopping {
  /** Non-empty groups, in CATEGORY_ORDER. */
  groups: Array<{ category: IngredientCategory; lines: ShoppingLine[] }>;
  /** Ingredients the pantry already covers in full. */
  coveredCount: number;
}

export interface ShoppingInput {
  dishes: PlanDish[];
  members: PlanMember[];
  portions: Portions;
  slots: MealType[];
  /** Meals before this day are past, so not shopped for. */
  fromDate: string;
}

const slotRank = (slot: MealType) => PLAN_SLOTS.indexOf(slot);

/**
 * The week's shopping: every remaining meal's ingredients for the people eating it, combined through
 * the app's grocery merge (so 雞肉 and "chicken thigh" are one line), minus what the pantry has, and
 * grouped by category. An ingredient two dishes tagged differently stays in the first dish's group, so
 * it is never listed twice.
 */
export function weeklyShoppingList(input: ShoppingInput, pantry: PantryItem[]): WeeklyShopping {
  const keyOf = (name: string, nameZh: string, unit: CanonicalUnit) => `${strictCanonical(name, nameZh)}|${unit}`;
  const dishes = input.dishes
    .filter((d) => d.date >= input.fromDate && input.slots.includes(d.slot))
    .sort((a, b) => a.date.localeCompare(b.date) || slotRank(a.slot) - slotRank(b.slot));

  const categoryOf = new Map<string, IngredientCategory>();
  const inputsBy = new Map<IngredientCategory, MergeInput[]>();
  for (const d of dishes) {
    const servings = servingsFor(eatersOf(slotKey(d), input.members, input.portions));
    if (servings <= 0) continue;
    for (const i of d.ingredients) {
      const key = keyOf(i.name, i.nameZh, i.unit);
      const category = categoryOf.get(key) ?? i.category;
      categoryOf.set(key, category);
      const list = inputsBy.get(category) ?? [];
      list.push({
        ingredient: { name: i.name, nameZh: i.nameZh, quantity: i.quantity * servings, unit: i.unit, displayUnit: i.unit },
        recipeId: d.id,
      });
      inputsBy.set(category, list);
    }
  }

  let coveredCount = 0;
  const groups: WeeklyShopping["groups"] = [];
  for (const category of CATEGORY_ORDER) {
    const inputs = inputsBy.get(category);
    if (!inputs) continue;
    const lines: ShoppingLine[] = [];
    for (const item of mergeIngredients(inputs, pantry, "week", strictCanonical)) {
      if (item.quantity <= 0) {
        coveredCount += 1;
        continue;
      }
      lines.push({
        key: `${category}:${keyOf(item.name, item.nameZh, item.unit)}`,
        name: item.name,
        nameZh: item.nameZh,
        quantity: item.quantity,
        unit: item.unit,
        category,
        dishIds: item.sourceRecipeIds,
      });
    }
    if (lines.length > 0) groups.push({ category, lines });
  }
  return { groups, coveredCount };
}

// Drops a pointless ".0", so 8 reads "8" and 1.0 kg reads "1kg".
const trim1 = (n: number) => Number(n.toFixed(1));

function catties(grams: number): string | null {
  // Below a tael nobody weighs it out at a stall, so grams alone say it better.
  if (grams < GRAMS_PER_TAEL) return null;
  const taels = Math.round(grams / GRAMS_PER_TAEL);
  const catty = Math.floor(taels / 16);
  const rest = taels % 16;
  return `${catty > 0 ? `${catty}斤` : ""}${rest > 0 ? `${rest}兩` : ""}`;
}

/**
 * An amount as the plan shows it: grams (or ml) plus 斤／兩 for weights, the way a wet market sells.
 * Pieces round up to whole ones on the shopping list (half an egg can't be bought) and to the nearest
 * half for cooking (half an onion can be cooked).
 */
export function formatPlanAmount(
  quantity: number,
  unit: CanonicalUnit,
  mode: "cook" | "shop",
): { metric: string; market: string | null } {
  if (unit === "piece") {
    const q = round2(quantity);
    const n = mode === "shop" ? Math.ceil(q) : Math.max(0.5, Math.round(q * 2) / 2);
    return { metric: `x${q > 0 ? n : 0}`, market: null };
  }
  const small = (n: number) => (n >= 10 ? Math.round(n) : trim1(n));
  if (unit === "ml") {
    return { metric: quantity >= 1000 ? `${trim1(quantity / 1000)}L` : `${small(quantity)}ml`, market: null };
  }
  return {
    metric: quantity >= 1000 ? `${trim1(quantity / 1000)}kg` : `${small(quantity)}g`,
    market: catties(quantity),
  };
}

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const isAmount = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

/**
 * A waiting 食咗 entry from the server, or null if anything about it is off. It is about to be written
 * into someone's own diary, so a malformed one is dropped rather than turned into a wrong number.
 */
export function inboxEntryFrom(raw: unknown): InboxEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || r.id.length === 0) return null;
  if (typeof r.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) return null;
  const e = r.entry as Record<string, unknown> | null | undefined;
  if (!e || typeof e !== "object") return null;
  const name = typeof e.name === "string" ? e.name.trim() : "";
  const nameZh = typeof e.nameZh === "string" ? e.nameZh.trim() : "";
  if (!name || !nameZh) return null;
  if (!MEAL_TYPES.includes(e.mealType as MealType)) return null;
  const { calories, protein, carbs, fat, fiber, quantity } = e;
  if (![calories, protein, carbs, fat, fiber].every(isAmount)) return null;
  if (!isAmount(quantity) || quantity <= 0 || e.unit !== "serving") return null;
  return {
    id: r.id,
    date: r.date,
    entry: {
      name,
      nameZh,
      mealType: e.mealType as MealType,
      calories: calories as number,
      protein: protein as number,
      carbs: carbs as number,
      fat: fat as number,
      fiber: fiber as number,
      quantity,
      unit: "serving",
    },
  };
}
