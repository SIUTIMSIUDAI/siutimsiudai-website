import { CanonicalUnit, GroceryListItem, PantryItem, RecipeIngredient } from "@/types";
import {
  canonicalizeIngredient,
  dictionaryEntry,
  exactCanonical,
  normalizeTerm,
} from "@/constants/ingredientDictionary";

export interface MergeInput {
  ingredient: Pick<RecipeIngredient, "name" | "nameZh" | "quantity" | "unit" | "displayUnit">;
  recipeId: string;
}

let counter = 0;
function genId(): string {
  counter += 1;
  return `gli_${Date.now().toString(36)}_${counter}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Prefer the canonical key that maps to a dictionary entry so English and
// Chinese spellings of the same item resolve identically. Exported so the recipe
// screen can flag a "missing" ingredient with the exact same identity the merge uses.
export function resolveCanonical(name: string, nameZh: string): string {
  const a = canonicalizeIngredient(name);
  if (dictionaryEntry(a)) return a;
  const b = canonicalizeIngredient(nameZh);
  if (dictionaryEntry(b)) return b;
  return a;
}

/**
 * Stricter than resolveCanonical: the same ingredient only when a name IS a known name or alias in
 * either language, else the English name itself. resolveCanonical also matches part of a Chinese
 * name, so 雞湯 (stock) and 雞胸肉 (breast) became 雞肉 and chicken in the pantry "covered" them
 * (owner, 2026-10-26). Used where a wrong match hides something to buy: the recipe page's missing
 * ingredients and the family plan's shopping list.
 */
export function strictCanonical(name: string, nameZh: string): string {
  return exactCanonical(name) ?? exactCanonical(nameZh) ?? normalizeTerm(name || nameZh);
}

interface Acc {
  canonical: string;
  unit: CanonicalUnit;
  quantity: number;
  sample: { name: string; nameZh: string };
  mergedFrom: string[];
  recipeIds: Set<string>;
}

/**
 * Compile recipe ingredients into a deduplicated grocery list. Same item written
 * in English or Traditional Chinese folds into one line (bilingual merge), and
 * anything marked in-stock in the pantry is deducted. `resolve` decides what counts as the same
 * item; the family plan passes a stricter one (see utils/weekPlan.ts).
 */
export function mergeIngredients(
  inputs: MergeInput[],
  pantry: PantryItem[],
  groceryListId = "tmp",
  resolve: (name: string, nameZh: string) => string = resolveCanonical,
): GroceryListItem[] {
  const pantryByKey = new Map<string, PantryItem>();
  for (const p of pantry) {
    if (!p.inStock) continue;
    pantryByKey.set(resolve(p.name, p.nameZh), p);
  }

  const groups = new Map<string, Acc>();
  for (const { ingredient, recipeId } of inputs) {
    const canonical = resolve(ingredient.name, ingredient.nameZh);
    const key = `${canonical}|${ingredient.unit}`;
    const existing = groups.get(key);
    const rawLabel = ingredient.name || ingredient.nameZh;
    if (existing) {
      existing.quantity += ingredient.quantity;
      if (!existing.mergedFrom.includes(rawLabel)) existing.mergedFrom.push(rawLabel);
      existing.recipeIds.add(recipeId);
    } else {
      groups.set(key, {
        canonical,
        unit: ingredient.unit,
        quantity: ingredient.quantity,
        sample: { name: ingredient.name, nameZh: ingredient.nameZh },
        mergedFrom: [rawLabel],
        recipeIds: new Set([recipeId]),
      });
    }
  }

  const items: GroceryListItem[] = [];
  for (const acc of groups.values()) {
    const entry = dictionaryEntry(acc.canonical);
    const pantryItem = pantryByKey.get(acc.canonical);

    let remaining = acc.quantity;
    let inPantry = false;
    let checked = false;
    if (pantryItem) {
      inPantry = true;
      if (pantryItem.quantity > 0 && pantryItem.unit === acc.unit) {
        remaining = Math.max(0, acc.quantity - pantryItem.quantity);
      } else {
        remaining = 0; // marked in stock without an amount: treat as covered
      }
      checked = remaining === 0;
    }

    items.push({
      id: genId(),
      groceryListId,
      name: entry?.en ?? acc.sample.name,
      nameZh: entry?.zh ?? acc.sample.nameZh,
      quantity: round2(remaining),
      unit: acc.unit,
      displayUnit: acc.unit,
      checked,
      sourceRecipeIds: Array.from(acc.recipeIds),
      mergedFrom: acc.mergedFrom,
      inPantry,
    });
  }
  return items;
}
