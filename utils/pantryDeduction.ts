import { CanonicalUnit, PantryItem, PantryUnit } from "@/types";
import { resolveCanonical } from "./groceryMerge";

/**
 * After cooking, what came out of the pantry. Recipe lines are matched to in-stock pantry items by
 * the same canonical identity the recipe screen's "Missing" badges use, so an ingredient that shows
 * as in the pantry there is exactly one that gets offered for deduction here.
 */

/** One ingredient line of the dish just cooked, in its canonical unit and already scaled to the servings shown. */
export interface PantryUseLine {
  name: string;
  nameZh: string;
  quantity: number;
  unit: CanonicalUnit;
}

/** A pantry item whose amount can be worked out, because the recipe and the pantry count it in the same unit. */
export interface AmountRow {
  kind: "amount";
  item: PantryItem;
  used: number;
}

/** A pantry item the cook answers for: it is counted in packages, has no amount, or the units differ. */
export interface ChoiceRow {
  kind: "choice";
  item: PantryItem;
  // "Used 1 box" only makes sense for something counted, with two or more of it.
  canUseOne: boolean;
}

export type DeductionRow = AmountRow | ChoiceRow;

export interface DeductionPlan {
  rows: DeductionRow[];
  // Ingredients the pantry has no stock of, each counted once however many lines it has.
  notInPantry: number;
}

export type ChoiceAnswer = "keep" | "useOne" | "useUp";

export interface AmountDecision {
  kind: "amount";
  include: boolean;
  used: number;
}

export interface ChoiceDecision {
  kind: "choice";
  answer: ChoiceAnswer;
}

export type RowDecision = AmountDecision | ChoiceDecision;

/** The pantry change one row comes to: the new amount and whether the item is still in stock. */
export interface PantryUpdate {
  id: string;
  quantity: number;
  inStock: boolean;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isCountUnit(unit: PantryUnit): boolean {
  return unit !== "g" && unit !== "ml";
}

// Half an egg still means cracking one, so piece counts round up. Grams and millilitres keep one decimal.
function usedAmount(total: number, unit: CanonicalUnit): number {
  return unit === "piece" ? Math.ceil(total - 1e-9) : round1(total);
}

export function planPantryDeduction(lines: PantryUseLine[], pantry: PantryItem[]): DeductionPlan {
  // The first in-stock entry for each food, in the pantry's own order (newest first).
  const stocked = new Map<string, PantryItem>();
  for (const it of pantry) {
    if (!it.inStock) continue;
    const key = resolveCanonical(it.name, it.nameZh);
    if (!stocked.has(key)) stocked.set(key, it);
  }

  const groups = new Map<string, { item: PantryItem; lines: PantryUseLine[] }>();
  const missing = new Set<string>();
  for (const l of lines) {
    const key = resolveCanonical(l.name, l.nameZh);
    const it = stocked.get(key);
    if (!it) {
      missing.add(key);
      continue;
    }
    const group = groups.get(it.id);
    if (group) group.lines.push(l);
    else groups.set(it.id, { item: it, lines: [l] });
  }

  const rows: DeductionRow[] = [];
  for (const { item: it, lines: used } of groups.values()) {
    const measurable =
      it.quantity > 0 && used.every((l) => l.unit === it.unit && l.quantity > 0);
    if (measurable) {
      const total = used.reduce((sum, l) => sum + l.quantity, 0);
      rows.push({ kind: "amount", item: it, used: usedAmount(total, used[0].unit) });
    } else {
      rows.push({ kind: "choice", item: it, canUseOne: isCountUnit(it.unit) && it.quantity >= 2 });
    }
  }
  return { rows, notInPantry: missing.size };
}

/** What the sheet starts with: worked-out amounts are taken off, everything else is left as it is. */
export function defaultDecision(row: DeductionRow): RowDecision {
  return row.kind === "amount"
    ? { kind: "amount", include: true, used: row.used }
    : { kind: "choice", answer: "keep" };
}

/** The change one row makes to the pantry, or null when it leaves the item alone. Running out keeps the item, out of stock. */
export function pantryUpdateFor(row: DeductionRow, decision: RowDecision): PantryUpdate | null {
  const { item: it } = row;
  let used: number;
  if (decision.kind === "amount") {
    if (!decision.include || !(decision.used > 0)) return null;
    used = decision.used;
  } else {
    if (decision.answer === "keep") return null;
    if (decision.answer === "useUp") return { id: it.id, quantity: 0, inStock: false };
    used = 1;
  }
  const left = round2(Math.max(0, it.quantity - used));
  return left > 0
    ? { id: it.id, quantity: left, inStock: true }
    : { id: it.id, quantity: 0, inStock: false };
}
