// Translating the plan's dishes for helper mode (plan-week's translate mode). Pure on purpose: no
// Deno globals and no imports, so the app's Jest suite can test it. The model gets the English words
// only (and the Chinese names as a hint), never any nutrition, and an answer is saved only when it
// lines up word for word with the recipe.

export const LANGUAGE_NAMES = { fil: "Filipino (Tagalog)", id: "Bahasa Indonesia" } as const;
export type TranslateLanguage = keyof typeof LANGUAGE_NAMES;

/** Dishes per model call: small enough to come back whole, few enough calls to stay cheap. */
export const TRANSLATE_BATCH = 6;

export function translateLanguage(raw: unknown): TranslateLanguage | null {
  return raw === "fil" || raw === "id" ? raw : null;
}

export interface DishToTranslate {
  id: string;
  title: string;
  titleZh: string;
  ingredients: Array<{ en: string; zh: string }>;
  steps: string[];
}

const text = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** The words of one dish row to translate, in the recipe's order, or null when there are none. */
export function dishToTranslate(row: { id: string; recipe: unknown }): DishToTranslate | null {
  const r = row.recipe as Record<string, unknown> | null;
  if (!r || typeof r !== "object") return null;
  const title = text(r.title, 120);
  if (!title) return null;
  const ingredients = (Array.isArray(r.ingredients) ? r.ingredients : []).map((i: Record<string, unknown>) => ({
    en: text(i?.name, 80),
    zh: text(i?.nameZh, 80),
  }));
  const steps = (Array.isArray(r.steps) ? r.steps : []).map((s: Record<string, unknown>) => text(s?.instruction, 500));
  return { id: row.id, title, titleZh: text(r.titleZh, 120), ingredients, steps };
}

export const TRANSLATE_SYSTEM_PROMPT = [
  "You translate home recipes for a domestic helper who cooks for a family in Hong Kong. Write as a",
  "native speaker says it in the kitchen and at the market: short, plain, everyday words.",
].join("\n");

// An example of rule 3 in each language. gemini-3.5-flash-lite read the old rule 3 ("keep its English
// name" where there is no everyday one) as leave-it-in-English and translated no ingredient at all
// into Filipino (2026-11-18).
const MARKET_WORDS: Record<TranslateLanguage, string> = {
  fil: "itlog, not egg; mantika, not cooking oil",
  id: "telur, not egg; minyak goreng, not cooking oil",
};

export function translatePrompt(dishes: DishToTranslate[], language: TranslateLanguage): string {
  return [
    `Translate these recipes into ${LANGUAGE_NAMES[language]}. Rules:`,
    "1. Keep every number, unit, time and temperature exactly as written.",
    "2. Translate the title, each ingredient and each step separately, in the same order. Never merge,",
    "   split, add or drop an ingredient or a step.",
    `3. Translate every ingredient into the everyday word a cook uses at the market (${MARKET_WORDS[language]}).`,
    `   Keep English only for a brand, or a food with no name of its own in ${LANGUAGE_NAMES[language]}.`,
    "4. Do not write any Chinese. The app shows the Chinese names separately.",
    "",
    "Recipes:",
    JSON.stringify(dishes),
    "",
    "Respond with ONLY a JSON object, no prose, of the shape",
    '{"dishes": [{"id": "<the same id>", "title": "...", "ingredients": ["<one per ingredient, same order>"], "steps": ["<one per step, same order>"]}]}',
  ].join("\n");
}

const wordList = (v: unknown, length: number, max: number): string[] | null => {
  if (!Array.isArray(v) || v.length !== length) return null;
  const out = v.map((x) => text(x, max));
  return out.every((x) => x.length > 0) ? out : null;
};

/** The usable translations in a parsed answer, by dish id. Anything that doesn't line up is left out. */
export function pickTranslations(
  parsed: unknown,
  dishes: DishToTranslate[],
): Map<string, { title: string; ingredients: string[]; steps: string[] }> {
  const out = new Map<string, { title: string; ingredients: string[]; steps: string[] }>();
  const list = parsed && typeof parsed === "object" ? (parsed as { dishes?: unknown }).dishes : null;
  if (!Array.isArray(list)) return out;
  const asked = new Map(dishes.map((d) => [d.id, d]));
  for (const raw of list) {
    const d = asked.get(raw?.id);
    if (!d || out.has(d.id)) continue;
    const title = text(raw.title, 120);
    const ingredients = wordList(raw.ingredients, d.ingredients.length, 80);
    const steps = wordList(raw.steps, d.steps.length, 500);
    if (title && ingredients && steps) out.set(d.id, { title, ingredients, steps });
  }
  return out;
}

export function batches<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
