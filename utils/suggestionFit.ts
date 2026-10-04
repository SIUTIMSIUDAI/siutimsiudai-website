import { normalizeTerm } from "@/constants/ingredientDictionary";
import { PantryItem } from "@/types";
import { resolveCanonical } from "./groceryMerge";

export interface NamedFood {
  name: string;
  nameZh: string;
}

/** How a suggested dish sits against the pantry: what it uses from it, and what else it would need. */
export interface SuggestionFit {
  uses: NamedFood[];
  alsoNeeds: NamedFood[];
}

// The only things the recipe AI may assume a kitchen has (see generate-recipe's prompts): water, a
// neutral cooking oil, salt and black pepper. Spelled out rather than matched loosely, so sesame oil
// or oyster sauce can never pass as a basic.
const BASICS = new Set([
  "water", "cold water", "warm water", "hot water", "boiling water",
  "水", "清水", "凍水", "暖水", "熱水", "滾水", "開水",
  "oil", "cooking oil", "vegetable oil", "neutral oil", "neutral cooking oil", "canola oil",
  "rapeseed oil", "sunflower oil", "peanut oil", "corn oil",
  "油", "食油", "生油", "菜油", "粟米油", "花生油", "芥花籽油",
  "salt", "sea salt", "table salt", "鹽", "食鹽", "海鹽",
  "pepper", "black pepper", "ground black pepper", "ground pepper",
  "胡椒", "胡椒粉", "黑胡椒", "黑胡椒粉", "黑椒",
]);

function isBasic(food: NamedFood): boolean {
  return BASICS.has(normalizeTerm(food.name)) || BASICS.has(normalizeTerm(food.nameZh));
}

/**
 * Matched by the same canonical identity as the recipe screen's "Missing" badges and the pantry update
 * after cooking. "Also needs" exists for the day the model slips and names something the pantry
 * doesn't have: the cook sees it on the card instead of finding out halfway through.
 */
export function suggestionFit(ingredients: NamedFood[], pantry: PantryItem[]): SuggestionFit {
  const stocked = new Map<string, PantryItem>();
  for (const it of pantry) {
    if (!it.inStock) continue;
    const key = resolveCanonical(it.name, it.nameZh);
    if (!stocked.has(key)) stocked.set(key, it);
  }

  const uses: NamedFood[] = [];
  const alsoNeeds: NamedFood[] = [];
  const seen = new Set<string>();
  for (const ing of ingredients) {
    const key = resolveCanonical(ing.name, ing.nameZh);
    const it = stocked.get(key);
    const seenKey = it ? `pantry:${it.id}` : `missing:${key}`;
    if (seen.has(seenKey)) continue;
    seen.add(seenKey);
    if (it) uses.push({ name: it.name, nameZh: it.nameZh });
    else if (!isBasic(ing)) alsoNeeds.push({ name: ing.name, nameZh: ing.nameZh });
  }
  return { uses, alsoNeeds };
}
