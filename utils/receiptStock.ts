import { PantryItem, PantryUnit } from "@/types";
import { resolveCanonical } from "./groceryMerge";
import type { PantryUpdate } from "./pantryDeduction";

/**
 * What a scanned receipt does to the pantry. Something bought that the pantry already holds, in the
 * same unit, tops that item up (and brings it back if it had run out); anything else becomes a new
 * item. Matching uses the same canonical identity as the recipe screen's "Missing" badges and the
 * pantry update after cooking.
 */

/** One reviewed receipt row. */
export interface ReceiptRow {
  name: string;
  nameZh: string;
  quantity: number;
  unit: PantryUnit;
}

/** A row that adds to a pantry item: its amount before and after, and whether it had run out. */
export interface TopUpLine {
  kind: "topUp";
  item: PantryItem;
  from: number;
  to: number;
  wasOut: boolean;
}

/** A row that becomes a new pantry item. */
export interface NewLine {
  kind: "new";
}

export type RestockLine = TopUpLine | NewLine;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** One line per row, in order. Several rows for the same item add up, each starting where the last left off. */
export function planRestock(rows: ReceiptRow[], pantry: PantryItem[]): RestockLine[] {
  // Where each matched item stands after the rows before it.
  const state = new Map<string, { quantity: number; inStock: boolean }>();

  return rows.map((r): RestockLine => {
    const key = resolveCanonical(r.name, r.nameZh);
    const candidates = pantry.filter(
      (it) => it.unit === r.unit && resolveCanonical(it.name, it.nameZh) === key,
    );
    const target = candidates.find((it) => it.inStock) ?? candidates[0];
    if (!target) return { kind: "new" };

    const now = state.get(target.id) ?? {
      quantity: target.inStock ? target.quantity : 0,
      inStock: target.inStock,
    };
    const to = round2(now.quantity + Math.max(0, r.quantity));
    state.set(target.id, { quantity: to, inStock: true });
    return { kind: "topUp", item: target, from: now.quantity, to, wasOut: !now.inStock };
  });
}

/** The pantry changes the top-ups come to: each item once, at its final amount, in stock. */
export function restockUpdates(lines: RestockLine[]): PantryUpdate[] {
  const updates = new Map<string, PantryUpdate>();
  for (const line of lines) {
    if (line.kind !== "topUp") continue;
    if (!line.wasOut && line.to === line.from) continue;
    updates.set(line.item.id, { id: line.item.id, quantity: line.to, inStock: true });
  }
  return [...updates.values()];
}
