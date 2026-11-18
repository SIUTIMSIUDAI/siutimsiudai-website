import { CATEGORY_ORDER, PLAN_SLOTS, PORTION_SIZES } from "@/constants/portionSizes";
import type { MealType } from "@/types";
import type { FamilyRole } from "@/types/family";
import type {
  DishTranslation,
  HelperDish,
  HelperLanguage,
  IngredientCategory,
  MyPlanSettings,
  PlanDish,
  PlanIngredient,
  PlanMember,
  PlanStep,
  PortionChoice,
  PortionSize,
  ShoppingSnapshot,
  TranslatedLanguage,
  WeekPlan,
} from "@/types/familyPlan";

// Database rows (database/0012_max_household.sql) into the plan's types. Pure, so what the screen
// trusts is tested: plan-week checked every dish on the way in, and this checks again on the way out,
// because a dish the helper can't cook from, or 食咗 can't log, is better missing than half-broken.

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const UNITS: PlanIngredient["unit"][] = ["g", "ml", "piece"];
const CHOICES: PortionChoice[] = [...PORTION_SIZES, "skip"];
const HELPER_LANGUAGES: HelperLanguage[] = ["en", "fil", "id"];
const TRANSLATED: TranslatedLanguage[] = ["fil", "id"];
const slotRank = (slot: MealType) => PLAN_SLOTS.indexOf(slot);

function ingredientFrom(raw: unknown): PlanIngredient | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const name = str(r.name);
  const nameZh = str(r.nameZh);
  const unit = UNITS.find((u) => u === r.unit);
  if (!name || !nameZh || !unit || !finite(r.quantity) || r.quantity <= 0) return null;
  const category = CATEGORY_ORDER.find((c) => c === r.category) ?? ("other" as IngredientCategory);
  return { name, nameZh, quantity: r.quantity, unit, category };
}

function stepFrom(raw: unknown, index: number): PlanStep | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const instruction = str(r.instruction);
  const instructionZh = str(r.instructionZh);
  if (!instruction || !instructionZh) return null;
  return { stepNumber: index + 1, instruction, instructionZh, durationSeconds: finite(r.durationSeconds) ? r.durationSeconds : null };
}

const stringList = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every((x) => typeof x === "string" && x.trim().length > 0) ? v.map((x) => (x as string).trim()) : null;

/** The cached translations that are whole: a title, and lists of words. Anything else is left out. */
function translationsFrom(raw: unknown): PlanDish["translations"] {
  const out: PlanDish["translations"] = {};
  if (!raw || typeof raw !== "object") return out;
  for (const lang of TRANSLATED) {
    const t = (raw as Record<string, unknown>)[lang] as Record<string, unknown> | undefined;
    const title = str(t?.title);
    const ingredients = stringList(t?.ingredients);
    const steps = stringList(t?.steps);
    if (title && ingredients && steps) out[lang] = { title, ingredients, steps } satisfies DishTranslation;
  }
  return out;
}

/** Everything about a dish except its nutrition, or null when there is nothing safe to show. */
function dishBase(row: Record<string, unknown>): { dish: HelperDish; recipe: Record<string, unknown> } | null {
  const slot = PLAN_SLOTS.find((s) => s === row.slot);
  const recipe = row.recipe as Record<string, unknown> | null;
  if (!slot || !recipe || typeof recipe !== "object") return null;
  const title = str(recipe.title);
  const titleZh = str(recipe.titleZh);
  const ingredients = (Array.isArray(recipe.ingredients) ? recipe.ingredients : [])
    .map(ingredientFrom)
    .filter((i): i is PlanIngredient => i !== null);
  const steps = (Array.isArray(recipe.steps) ? recipe.steps : [])
    .map((s, i) => stepFrom(s, i))
    .filter((s): s is PlanStep => s !== null)
    .map((s, i) => ({ ...s, stepNumber: i + 1 }));
  if (!title || !titleZh || ingredients.length === 0) return null;
  if (typeof row.id !== "string" || typeof row.plan_id !== "string" || typeof row.plan_date !== "string") return null;
  return {
    recipe,
    dish: {
      id: row.id,
      planId: row.plan_id,
      date: row.plan_date,
      slot,
      title,
      titleZh,
      totalMinutes: finite(recipe.totalMinutes) ? recipe.totalMinutes : 30,
      ingredients,
      steps,
      locked: row.locked === true,
      loggedAt: typeof row.logged_at === "string" ? row.logged_at : null,
      translations: translationsFrom(row.translations),
    },
  };
}

/** One dish row, or null when there is nothing safe to show or its nutrition can't be logged. */
export function dishFromRow(row: Record<string, unknown>): PlanDish | null {
  const base = dishBase(row);
  if (!base) return null;
  const n = (base.recipe.perServing ?? {}) as Record<string, unknown>;
  const macros = [n.calories, n.protein, n.carbs, n.fat, n.fiber];
  if (!macros.every((m) => finite(m) && m >= 0)) return null;
  return {
    ...base.dish,
    perServing: {
      calories: n.calories as number,
      protein: n.protein as number,
      carbs: n.carbs as number,
      fat: n.fat as number,
      fiber: n.fiber as number,
    },
  };
}

/** One dish as helper mode gets it: never any nutrition, even if a row carried some. */
export function helperDishFromRow(row: Record<string, unknown>): HelperDish | null {
  return dishBase(row)?.dish ?? null;
}

/** Portion rows folded into slot choices: "YYYY-MM-DD|slot" -> user id -> choice. */
export function portionsFromRows(portionRows: Array<Record<string, unknown>>): WeekPlan["portions"] {
  const portions: WeekPlan["portions"] = {};
  for (const p of portionRows) {
    const choice = CHOICES.find((c) => c === p.choice);
    if (!choice || typeof p.user_id !== "string" || typeof p.plan_date !== "string") continue;
    const key = `${p.plan_date}|${p.slot}`;
    portions[key] = { ...portions[key], [p.user_id]: choice };
  }
  return portions;
}

const byDayAndSlot = <T extends { date: string; slot: MealType }>(a: T, b: T) =>
  a.date.localeCompare(b.date) || slotRank(a.slot) - slotRank(b.slot);

/** A plan with its dishes in day and slot order and its portion rows folded into slot choices. */
export function planFromRows(
  plan: Record<string, unknown>,
  dishRows: Array<Record<string, unknown>>,
  portionRows: Array<Record<string, unknown>>,
): WeekPlan {
  return {
    id: String(plan.id),
    weekStart: String(plan.week_start),
    generatedAt: String(plan.generated_at),
    regenUsed: finite(plan.regen_used) ? plan.regen_used : 0,
    dishes: dishRows
      .map(dishFromRow)
      .filter((d): d is PlanDish => d !== null)
      .sort(byDayAndSlot),
    portions: portionsFromRows(portionRows),
  };
}

/** Helper mode's dishes, in day and slot order. */
export function helperDishesFromRows(dishRows: Array<Record<string, unknown>>): HelperDish[] {
  return dishRows
    .map(helperDishFromRow)
    .filter((d): d is HelperDish => d !== null)
    .sort(byDayAndSlot);
}

/** The family_plan_roster rows: names, usual sizes, and who is the helper. */
export function rosterFromRows(rows: Array<Record<string, unknown>>): PlanMember[] {
  return rows.flatMap((r) => {
    if (typeof r.user_id !== "string") return [];
    const defaultSize = PORTION_SIZES.find((s) => s === r.default_size) ?? ("medium" as PortionSize);
    return [
      {
        userId: r.user_id,
        role: (r.role === "manager" ? "manager" : "dependent") as FamilyRole,
        displayName: typeof r.display_name === "string" ? r.display_name : null,
        defaultSize,
        isHelper: r.is_helper === true,
        helperLanguage: HELPER_LANGUAGES.find((l) => l === r.helper_language) ?? "en",
        sharesLog: r.shares_log === true,
      },
    ];
  });
}

/** My own settings row (or none yet): what the plan defaults to until I save anything. */
export function myPlanSettingsFromRow(raw: unknown): MyPlanSettings {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    defaultSize: PORTION_SIZES.find((s) => s === r.default_size) ?? "medium",
    exclusions: Array.isArray(r.exclusions) ? r.exclusions.filter((e): e is string => typeof e === "string") : [],
    isHelper: r.is_helper === true,
    helperLanguage: HELPER_LANGUAGES.find((l) => l === r.helper_language) ?? "en",
    sharesLog: r.log_private !== true,
  };
}

/** The shopping list the planner's phone published for helper mode, or null when there is none. */
export function shoppingSnapshotFrom(raw: unknown, updatedAt: unknown): ShoppingSnapshot | null {
  if (!raw || typeof raw !== "object" || typeof updatedAt !== "string") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.fromDate !== "string" || !Array.isArray(r.groups)) return null;
  const groups: ShoppingSnapshot["groups"] = [];
  for (const g of r.groups as Array<Record<string, unknown>>) {
    const category = CATEGORY_ORDER.find((c) => c === g?.category);
    if (!category || !Array.isArray(g.lines)) continue;
    const lines: ShoppingSnapshot["groups"][number]["lines"] = [];
    for (const l of g.lines as Array<Record<string, unknown>>) {
      const name = str(l?.name);
      const nameZh = str(l?.nameZh);
      const unit = UNITS.find((u) => u === l?.unit);
      if (name && nameZh && unit && finite(l.quantity) && l.quantity > 0) lines.push({ name, nameZh, quantity: l.quantity, unit });
    }
    if (lines.length > 0) groups.push({ category, lines });
  }
  return { updatedAt, fromDate: r.fromDate, groups };
}
