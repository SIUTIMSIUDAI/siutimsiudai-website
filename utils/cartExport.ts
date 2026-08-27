import { GroceryListItem, PantryItem, Recipe } from "@/types";
import { RetailerConfig, SearchLanguage } from "@/constants/retailers";
import { mergeIngredients, MergeInput, resolveCanonical } from "./groceryMerge";

/**
 * The missing shopping list for a single recipe: merge the recipe's ingredients (folding bilingual
 * duplicates and canonicalising names through the dictionary), deduct whatever the pantry already
 * has in stock, and keep only what's still short. Reuses the exact grocery-merge path the app uses
 * everywhere else, so "missing" here means the same thing as on the grocery screen.
 */
export function missingItemsFromRecipe(recipe: Recipe, pantry: PantryItem[]): GroceryListItem[] {
  const inputs: MergeInput[] = recipe.ingredients.map((ing) => ({
    ingredient: {
      name: ing.name,
      nameZh: ing.nameZh,
      quantity: ing.quantity,
      unit: ing.unit,
      displayUnit: ing.displayUnit,
    },
    recipeId: recipe.id,
  }));
  return mergeIngredients(inputs, pantry, recipe.id).filter((item) => item.quantity > 0);
}

/**
 * The canonical identities of a recipe's missing ingredients. The recipe screen badges each
 * required-ingredient row by testing its identity against this set, so a badge appears on exactly
 * the lines the cart sheet would send to a store: one source of truth, no drift between the two.
 */
export function missingCanonicalKeys(recipe: Recipe, pantry: PantryItem[]): Set<string> {
  return new Set(
    missingItemsFromRecipe(recipe, pantry).map((item) => resolveCanonical(item.name, item.nameZh)),
  );
}

/** The canonical identity of a single recipe ingredient, matched against missingCanonicalKeys. */
export function ingredientCanonicalKey(item: { name: string; nameZh: string }): string {
  return resolveCanonical(item.name, item.nameZh);
}

/**
 * The language rule, in one place: HKTVmall (en) searches the English name; Wellcome and ParknShop
 * (zh) search the Traditional Chinese name, falling back to the other field if a line somehow lacks
 * the preferred one.
 */
export function searchTermFor(
  item: Pick<GroceryListItem, "name" | "nameZh">,
  lang: SearchLanguage,
): string {
  if (lang === "zh") return item.nameZh.trim() || item.name;
  return item.name.trim() || item.nameZh;
}

/**
 * Round a quantity to what a person can actually shop for.
 *
 * The wet-market maths is what forces this. A catty is 604.79g and a tael 37.8g, deliberately exact
 * because HK market prices are quoted per catty and the rounded Mainland values would be wrong. Run
 * a recipe through that and you get 786.23g, which is honest and useless: nobody buys chicken to the
 * hundredth of a gram, and a checklist full of trailing decimals reads like a spreadsheet.
 *
 * The threshold is where precision stops mattering and starts being noise. Past 100 the decimal is
 * below what a shop scale or a packet size will give you anyway, so whole units. Below it the
 * decimal is the whole quantity: rounding 0.5 tsp to 1 doubles it, and to 0 loses the ingredient
 * outright. Small amounts are also the potent ones, so that is exactly the wrong place to be vague.
 */
function roundForDisplay(quantity: number): number {
  if (!Number.isFinite(quantity)) return 0;
  if (Math.abs(quantity) >= 100) return Math.round(quantity);
  return Math.round(quantity * 10) / 10;
}

/**
 * A compact, human-readable amount for the checklist and the clipboard list. Piece counts read as
 * "x3"; masses and volumes read as "400g" / "15ml" / "12.5g".
 *
 * Both surfaces share this on purpose. What the shopper ticks off on screen and what they paste into
 * the store have to agree, and they would drift apart the moment either one rounded on its own.
 */
export function humanizeAmount(quantity: number, unit: string): string {
  // Half an egg is not a thing you can put in a basket, so piece counts are always whole.
  if (unit === "piece") return `x${Math.round(quantity)}`;
  return `${roundForDisplay(quantity)}${unit}`;
}

/**
 * The full missing list as newline-separated text, every line in the store's language:
 * "<term> <amount>". This is the clipboard payload, and nothing is ever truncated, so even though a
 * deep link can only seed one search term the shopper still has the whole basket ready to paste.
 */
export function formatClipboardList(
  items: Array<Pick<GroceryListItem, "name" | "nameZh" | "quantity" | "unit">>,
  lang: SearchLanguage,
): string {
  return items
    .map((item) => `${searchTermFor(item, lang)} ${humanizeAmount(item.quantity, item.unit)}`)
    .join("\n");
}

// Fill a retailer URL template's {q} slot with a single URL-encoded search term. Kept separate so
// the encoding rule lives in one testable spot. Encoding matters more than it looks: two of the
// three stores are searched in Chinese, so the term is almost always multi-byte.
function fillTemplate(template: string, term: string): string {
  return template.replace("{q}", encodeURIComponent(term));
}

/**
 * The search query for a whole missing list. Where the store's engine ORs terms (HKTVmall) this is
 * every ingredient at once, so a single tap searches the entire list rather than only its first
 * line. Where it does not (Wellcome, and PARKnSHOP by assumption) it is the first item alone,
 * because those engines match the joined string as one phrase and confidently return nothing.
 */
export function searchQueryFor(
  retailer: RetailerConfig,
  items: Array<Pick<GroceryListItem, "name" | "nameZh">>,
): string {
  if (items.length === 0) return "";
  const terms = retailer.supportsMultiTermSearch ? items : items.slice(0, 1);
  return terms.map((item) => searchTermFor(item, retailer.searchLanguage)).join(" ");
}

/**
 * The URL(s) to open for a retailer's search results.
 *
 * webUrl is an https search URL, which on iOS and Android doubles as the app deep link wherever the
 * retailer's app claims that path: tapping HKTVmall opens the HKTVmall app on the results, not a
 * browser. deepLinkUrl is only for a legacy custom scheme, and no retailer currently sets one, so
 * it mirrors webUrl and the launcher skips the canOpenURL probe entirely.
 */
export function buildSearchUrl(
  retailer: RetailerConfig,
  items: Array<Pick<GroceryListItem, "name" | "nameZh">>,
): { webUrl: string; deepLinkUrl: string } {
  const query = searchQueryFor(retailer, items);
  const webUrl = fillTemplate(retailer.webSearchTemplate, query);
  const deepLinkUrl = retailer.appSearchTemplate
    ? fillTemplate(retailer.appSearchTemplate, query)
    : webUrl;
  return { webUrl, deepLinkUrl };
}

/**
 * The URL for ONE ingredient, which is what a checklist row opens. Always a real search, even for
 * the stores that cannot combine: searching a single term is the thing they do well.
 */
export function buildItemSearchUrl(
  retailer: RetailerConfig,
  item: Pick<GroceryListItem, "name" | "nameZh">,
): { webUrl: string; deepLinkUrl: string } {
  return buildSearchUrl(retailer, [item]);
}

/**
 * Where tapping the store row itself should land.
 *
 * For a store that can search the whole list at once, that is the combined results page: one tap,
 * every missing ingredient, nothing left to do. For a store that cannot, it is the plain storefront
 * rather than a search for whichever ingredient happens to sort first, because singling one out is
 * arbitrary and leaves the shopper thinking that is all we sent. Those stores are shopped through
 * the checklist instead, one deliberate tap per ingredient.
 */
export function buildStoreEntryUrl(
  retailer: RetailerConfig,
  items: Array<Pick<GroceryListItem, "name" | "nameZh">>,
): { webUrl: string; deepLinkUrl: string } {
  if (retailer.supportsMultiTermSearch && items.length > 0) return buildSearchUrl(retailer, items);
  return { webUrl: retailer.homeUrl, deepLinkUrl: retailer.homeUrl };
}
