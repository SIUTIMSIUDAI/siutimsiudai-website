import { INGREDIENT_DICTIONARY } from "@/constants/ingredientDictionary";
import { Locale } from "@/types";
import { classifyInvokeError, type InvokeFailure } from "./functionError";
import { isSupabaseConfigured, supabase } from "./supabase";

// Cross-language engine for scraped recipe URLs (English -> Traditional Chinese). Two layers:
//
//   1. Live: a Supabase Edge Function proxy holds the Google Cloud Translation key SERVER-SIDE
//      and calls Google on our behalf. The billable key never ships in the client bundle, so it
//      cannot be extracted from a device the way an EXPO_PUBLIC_ key could. See
//      supabase/functions/translate/index.ts.
//   2. Demo stand-in: an on-device dictionary mock (translateText) reachable ONLY when Supabase is
//      unconfigured (Expo Go without env, web preview, tests). It substitutes the ingredient
//      tokens the bilingual dictionary knows (老抽, 蒜頭, 豉油) so the feature stays demonstrable
//      and fully testable offline.
//
// THE MOCK IS NOT A FAILURE FALLBACK, and that distinction is why translateBatch returns an
// outcome union instead of a bare array. The mock renders "Add soy sauce and garlic" as
// "Add 豉油 and 蒜頭" — English grammar with a few Chinese nouns dropped in. Fine as an offline
// demo; unacceptable as a translation. Served on a real failure it is near-English text presented
// to the user AS Traditional Chinese, with nothing anywhere admitting the translation never ran.
//
// It was worse than one bad render. recipeStore cached that output and set zhTranslated, and
// useRecipeAutoTranslate skips every recipe already marked translated — so a single failed call
// poisoned the recipe permanently, with no retry ever. A failure now returns ok:false and the
// store writes nothing, which leaves the English text in place (honest: it IS English) and lets a
// later attempt succeed.
//
// Swapping translation providers is a server-only change (edit the Edge Function); the client
// interface below never moves.

export interface TranslationSuccess {
  ok: true;
  /** Same length and order as the input: translations[i] is the translation of texts[i]. */
  translations: string[];
}

export interface TranslationFailure {
  ok: false;
  /** "rate_limited" is the daily cap, where retrying before midnight cannot help. */
  error: InvokeFailure;
}

export type TranslationOutcome = TranslationSuccess | TranslationFailure;

export interface TranslationService {
  // Translate a batch in one call so a real provider can amortise a single network round-trip
  // across a whole recipe. Order-preserving: translations[i] is the translation of texts[i].
  translateBatch(texts: string[], target: Locale): Promise<TranslationOutcome>;
}

// Any CJK char. Used to keep Chinese aliases out of the English->Chinese phrase table and to
// leave already-Chinese text alone.
function hasCjk(s: string): boolean {
  return /[一-鿿]/.test(s);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface Phrase {
  pattern: RegExp;
  zh: string;
}

// Build the English-phrase -> Traditional-Chinese table once. Every English label the dictionary
// knows (canonical key, display name, and English-only aliases) points at the entry's Chinese
// term. Chinese aliases are skipped because they are already the target language.
function buildPhrases(): Phrase[] {
  const seen = new Set<string>();
  const rows: { en: string; zh: string }[] = [];
  for (const entry of INGREDIENT_DICTIONARY) {
    for (const raw of [entry.canonical, entry.en, ...entry.aliases]) {
      const en = raw.trim();
      if (!en || hasCjk(en)) continue; // English source phrases only
      const key = en.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ en, zh: entry.zh });
    }
  }
  // Longest phrase first so "dark soy sauce" beats "soy sauce" and "garlic clove" beats
  // "garlic". Ties fall back to alphabetical for stable, testable output.
  rows.sort((a, b) => b.en.length - a.en.length || a.en.localeCompare(b.en));
  return rows.map(({ en, zh }) => ({
    pattern: new RegExp(`\\b${escapeRegExp(en)}\\b`, "gi"),
    zh,
  }));
}

const EN_TO_ZH: Phrase[] = buildPhrases();

/**
 * Pure, synchronous mock translator. Substitutes every known English ingredient token with its
 * Traditional Chinese term, honouring longest-match-first so multi-word names beat their
 * sub-phrases. Unknown words pass through untouched. Non-Chinese targets (and empty input)
 * return the text unchanged.
 */
export function translateText(text: string, target: Locale): string {
  if (target !== "zh-Hant" || !text) return text;
  let out = text;
  for (const { pattern, zh } of EN_TO_ZH) {
    pattern.lastIndex = 0; // defensive: global regex reused across calls
    out = out.replace(pattern, zh);
  }
  return out;
}

// Hong Kong vernacular normaliser for the LIVE path. Google returns standard/Mandarin Chinese
// (醬油, 大蒜, 馬鈴薯); the cha-chaan-teng voice prefers the HK term (豉油, 蒜頭, 薯仔). Each
// value below is a dictionary entry's `zh`; each key is the standard name for the SAME item.
//
// This is a hand-curated allow-list, NOT auto-derived from the dictionary's `aliases`, on purpose.
// Those aliases also hold preparation-specific variants (蒜蓉 minced garlic, 五花腩 pork belly,
// 低筋麵粉 cake flour, 料酒 cooking wine). Auto-mapping every alias would flatten a real distinction
// when Google emits one — "minced garlic" -> 蒜蓉 must NOT be rewritten to plain 蒜頭. Fail closed:
// anything not listed here passes through untouched.
const STANDARD_TO_HK: Record<string, string> = {
  醬油: "豉油", // soy sauce
  大蒜: "蒜頭", // garlic
  蔥: "葱", // spring onion (orthographic variant)
  馬鈴薯: "薯仔", // potato
  紅蘿蔔: "甘筍", // carrot
  芝麻油: "麻油", // sesame oil
};

/**
 * Map a single standard-Chinese ingredient term to its Hong Kong preferred form (醬油 -> 豉油).
 * Whole-string exact match only: anything not verbatim in the allow-list — full recipe-step
 * sentences (蒸10分鐘至熟透), preparation-specific terms (蒜蓉), already-HK terms, English — passes
 * through untouched. Applied per translated cell, so it never rewrites inside a sentence.
 */
export function localizeHkTerm(text: string): string {
  return STANDARD_TO_HK[text.trim()] ?? text;
}

// The deployed Edge Function's URL slug; matches the repo folder supabase/functions/translate/.
const TRANSLATE_FN = "translate";

// Call the server-side proxy. Every failure path — no client, offline, non-2xx, a short array, a
// non-string cell — comes back as ok:false, so no caller can quietly read "it broke" as "here is
// your translation".
async function translateViaProxy(texts: string[], target: Locale): Promise<TranslationOutcome> {
  if (!supabase) return { ok: false, error: "unavailable" };

  const { data, error } = await supabase.functions.invoke<{ translations?: unknown }>(
    TRANSLATE_FN,
    { body: { texts, target } },
  );
  // Separates the 429 daily cap from a plain outage; anything not positively identifiable as the
  // cap stays "unavailable". See ./functionError.
  if (error) return { ok: false, error: await classifyInvokeError(error) };

  // Never trust the wire. A short array would shift every later field by one — the store slices
  // this batch positionally into title / ingredients / steps — and a non-string cell would render
  // as "[object Object]" inside a recipe step.
  const rows: unknown = data?.translations;
  if (!Array.isArray(rows) || rows.length !== texts.length) {
    return { ok: false, error: "unavailable" };
  }
  const cells = rows as unknown[];
  if (!cells.every((cell) => typeof cell === "string")) {
    return { ok: false, error: "unavailable" };
  }

  // Google returns standard/Mandarin Chinese; localizeHkTerm nudges known ingredient terms into
  // the app's cha-chaan-teng voice.
  return { ok: true, translations: (cells as string[]).map(localizeHkTerm) };
}

export const translationService: TranslationService = {
  async translateBatch(texts, target) {
    if (texts.length === 0) return { ok: true, translations: [] };

    // Strictly Traditional Chinese is the only target that hits the network; English (and any
    // other locale) is a local no-op, so we never spend a Google quota unit on a round-trip that
    // would just hand the input back unchanged.
    if (target !== "zh-Hant") {
      return { ok: true, translations: texts.map((text) => translateText(text, target)) };
    }

    // The one place the mock is allowed. With no backend configured there is no call to fail, so
    // this is a demo stand-in rather than a cover-up. Once a backend IS configured, a failure is
    // reported as a failure and the mock is unreachable.
    if (!isSupabaseConfigured) {
      return { ok: true, translations: texts.map((text) => translateText(text, "zh-Hant")) };
    }

    try {
      return await translateViaProxy(texts, target);
    } catch {
      return { ok: false, error: "unavailable" };
    }
  },
};
