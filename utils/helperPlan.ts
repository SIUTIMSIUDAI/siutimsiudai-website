import type {
  HelperDish,
  HelperLanguage,
  PlanIngredient,
  ShoppingSnapshot,
} from "@/types/familyPlan";
import { strictCanonical } from "@/utils/groceryMerge";
import type { WeeklyShopping } from "@/utils/weekPlan";

// Helper mode's wording, pure so it is tested. The family's helper reads what to cook and how much in
// her language (en / fil / id), always with the original Chinese name of the dish and of every
// ingredient beside it, so she can match a recipe to what the family calls it and to the market's
// labels. An AI translation that is missing or doesn't line up with the recipe falls back to the
// recipe's own English: a word against the wrong ingredient or step is worse than English.

export interface LocalDish {
  title: string;
  titleZh: string;
  /** False when she is reading English because her language isn't ready yet. */
  translated: boolean;
  ingredients: Array<PlanIngredient & { local: string }>;
  steps: Array<{ stepNumber: number; text: string }>;
}

/** The translation helper mode can use for a dish, or null when there is none that lines up. */
function usableTranslation(dish: HelperDish, lang: HelperLanguage) {
  if (lang === "en") return null;
  const t = dish.translations[lang];
  if (!t || t.ingredients.length !== dish.ingredients.length || t.steps.length !== dish.steps.length) return null;
  return t;
}

/** A dish in her language, with English wherever her language isn't available. */
export function localiseDish(dish: HelperDish, lang: HelperLanguage): LocalDish {
  const t = usableTranslation(dish, lang);
  return {
    title: t?.title ?? dish.title,
    titleZh: dish.titleZh,
    translated: lang === "en" || t !== null,
    ingredients: dish.ingredients.map((i, n) => ({ ...i, local: t?.ingredients[n] ?? i.name })),
    steps: dish.steps.map((s, n) => ({ stepNumber: s.stepNumber, text: t?.steps[n] ?? s.instruction })),
  };
}

/** The dishes still to translate into her language (none for English). */
export function missingTranslations(dishes: HelperDish[], lang: HelperLanguage): string[] {
  if (lang === "en") return [];
  return dishes.filter((d) => usableTranslation(d, lang) === null).map((d) => d.id);
}

/** The planner's weekly list as helper mode receives it: names, amounts and groups, nothing else. */
export function shoppingSnapshot(weekly: WeeklyShopping, fromDate: string, now: string): ShoppingSnapshot {
  return {
    updatedAt: now,
    fromDate,
    groups: weekly.groups.map((g) => ({
      category: g.category,
      lines: g.lines.map((l) => ({ name: l.name, nameZh: l.nameZh, quantity: l.quantity, unit: l.unit })),
    })),
  };
}

/** What changed in a list, ignoring when it was worked out: publishing again only when this differs. */
export function shoppingFingerprint(s: Pick<ShoppingSnapshot, "fromDate" | "groups">): string {
  return JSON.stringify({ fromDate: s.fromDate, groups: s.groups });
}

/**
 * The published list in her language. Each line takes the name a translated dish used for the same
 * ingredient (matched the way the list was combined, so 雞肉 and 雞髀 are one), else its English.
 */
export function localiseShopping(
  snapshot: ShoppingSnapshot,
  dishes: HelperDish[],
  lang: HelperLanguage,
): Array<{ category: ShoppingSnapshot["groups"][number]["category"]; lines: Array<ShoppingSnapshot["groups"][number]["lines"][number] & { local: string }> }> {
  const words = new Map<string, string>();
  for (const dish of dishes) {
    const t = usableTranslation(dish, lang);
    if (!t) continue;
    dish.ingredients.forEach((i, n) => {
      const key = strictCanonical(i.name, i.nameZh);
      if (!words.has(key)) words.set(key, t.ingredients[n]);
    });
  }
  return snapshot.groups.map((g) => ({
    category: g.category,
    lines: g.lines.map((l) => ({ ...l, local: words.get(strictCanonical(l.name, l.nameZh)) ?? l.name })),
  }));
}
