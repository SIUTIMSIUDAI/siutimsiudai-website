import { CATEGORY_ORDER, PLAN_SLOTS, PORTION_SIZES } from "@/constants/portionSizes";
import type { MealType } from "@/types";
import type { FamilyRole } from "@/types/family";
import type {
  IngredientCategory,
  PlanDish,
  PlanIngredient,
  PlanMember,
  PlanStep,
  PortionChoice,
  PortionSize,
  WeekPlan,
} from "@/types/familyPlan";

// Database rows (database/0012_max_household.sql) into the plan's types. Pure, so what the screen
// trusts is tested: plan-week checked every dish on the way in, and this checks again on the way out,
// because a dish the helper can't cook from, or 食咗 can't log, is better missing than half-broken.

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const UNITS: PlanIngredient["unit"][] = ["g", "ml", "piece"];
const CHOICES: PortionChoice[] = [...PORTION_SIZES, "skip"];
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

/** One dish row, or null when there is nothing safe to show. */
export function dishFromRow(row: Record<string, unknown>): PlanDish | null {
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
  const n = (recipe.perServing ?? {}) as Record<string, unknown>;
  const macros = [n.calories, n.protein, n.carbs, n.fat, n.fiber];
  if (!title || !titleZh || ingredients.length === 0 || !macros.every((m) => finite(m) && m >= 0)) return null;
  if (typeof row.id !== "string" || typeof row.plan_id !== "string" || typeof row.plan_date !== "string") return null;
  return {
    id: row.id,
    planId: row.plan_id,
    date: row.plan_date,
    slot,
    title,
    titleZh,
    totalMinutes: finite(recipe.totalMinutes) ? recipe.totalMinutes : 30,
    ingredients,
    steps,
    perServing: {
      calories: n.calories as number,
      protein: n.protein as number,
      carbs: n.carbs as number,
      fat: n.fat as number,
      fiber: n.fiber as number,
    },
    locked: row.locked === true,
    loggedAt: typeof row.logged_at === "string" ? row.logged_at : null,
  };
}

/** A plan with its dishes in day and slot order and its portion rows folded into slot choices. */
export function planFromRows(
  plan: Record<string, unknown>,
  dishRows: Array<Record<string, unknown>>,
  portionRows: Array<Record<string, unknown>>,
): WeekPlan {
  const dishes = dishRows
    .map(dishFromRow)
    .filter((d): d is PlanDish => d !== null)
    .sort((a, b) => a.date.localeCompare(b.date) || slotRank(a.slot) - slotRank(b.slot));
  const portions: WeekPlan["portions"] = {};
  for (const p of portionRows) {
    const choice = CHOICES.find((c) => c === p.choice);
    if (!choice || typeof p.user_id !== "string" || typeof p.plan_date !== "string") continue;
    const key = `${p.plan_date}|${p.slot}`;
    portions[key] = { ...portions[key], [p.user_id]: choice };
  }
  return {
    id: String(plan.id),
    weekStart: String(plan.week_start),
    generatedAt: String(plan.generated_at),
    regenUsed: finite(plan.regen_used) ? plan.regen_used : 0,
    dishes,
    portions,
  };
}

/** The family_plan_roster rows: names and usual sizes. */
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
      },
    ];
  });
}
