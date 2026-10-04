// Request and response handling for generate-recipe's suggestion mode ({ ingredients, count }), which
// asks for up to three different dishes in one call. Pure on purpose: no Deno globals and no imports,
// so the app's Jest suite can test it (index.ts calls Deno.serve at module scope and cannot be imported).

export const MAX_SUGGESTIONS = 3;
const MAX_AVOID = 12;
const MAX_AVOID_LENGTH = 80;

/** How many dishes a request asks for, or null when it doesn't ask (the one-recipe path older apps use). */
export function suggestCount(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  return Math.min(MAX_SUGGESTIONS, Math.max(1, Math.round(raw)));
}

/** Dishes the cook has already been shown ("More ideas"), kept short so they can't crowd out the prompt. */
export function avoidTitles(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim().slice(0, MAX_AVOID_LENGTH))
    .filter((t) => t.length > 0)
    .slice(0, MAX_AVOID);
}

function titleKey(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, " ") : "";
}

/**
 * The dishes from a parsed model answer of the shape { recipes: [...] }: recipe objects only, no dish
 * twice (by English or Chinese title), at most `count`. An empty list is a real answer (nothing in the
 * pantry makes a dish); anything that isn't a list of dishes is null, a failed generation.
 */
export function pickRecipes(parsed: unknown, count: number): unknown[] | null {
  if (!parsed || typeof parsed !== "object") return null;
  const list = (parsed as { recipes?: unknown }).recipes;
  if (!Array.isArray(list)) return null;

  const seen = new Set<string>();
  const picked: unknown[] = [];
  for (const entry of list) {
    if (picked.length >= count) break;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const r = entry as { title?: unknown; titleZh?: unknown };
    const keys = [titleKey(r.title), titleKey(r.titleZh)].filter((k) => k.length > 0);
    if (keys.some((k) => seen.has(k))) continue;
    keys.forEach((k) => seen.add(k));
    picked.push(entry);
  }
  return picked;
}
