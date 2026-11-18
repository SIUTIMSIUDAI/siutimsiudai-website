// Pure helpers for the manual log's free-text "Amount" box (e.g. "1 bowl", "200 g", "2 pieces").
// Kept dependency-free so the parsing is trivially unit-testable (see __tests__/manualAmount.test.ts)
// and safe to import from the log sheet and the diary row alike.
//
// Two jobs:
//  - parseAmount: split what the user typed into a count MULTIPLIER (for scaling a known dish's
//    fixed per-serving macros) and a display LABEL. A novel dish never uses the multiplier: its
//    portion is handled by the estimator AI, which reads the raw amount text directly.
//  - formatAmountLabel: decide what a logged entry shows next to its name, hiding the boring
//    default ("1 serving") so pre-existing entries look unchanged.

export interface ParsedAmount {
  // How many times to scale a KNOWN dish's per-serving macros. Always safe to multiply by: a
  // measurement ("200 g") yields 1, never 200, because you cannot rescale a fixed serving by weight.
  multiplier: number;
  // What to store and show as the entry's unit, or null when the user typed nothing meaningful
  // (blank, or a bare count that needs no words).
  label: string | null;
}

// Units that state a measurement, where the leading number is the measurement itself and must NOT
// scale the macros. Everything else that follows a number ("bowls", "pieces", "件") is a count.
const MEASURE_UNITS: ReadonlySet<string> = new Set([
  "g", "gram", "grams", "克",
  "kg", "公斤", "千克",
  "mg", "毫克",
  "ml", "milliliter", "millilitre", "毫升",
  "l", "litre", "liter", "公升", "升",
  "oz", "ounce", "ounces",
  "cup", "cups", "杯",
  "tbsp", "tablespoon", "tablespoons",
  "tsp", "teaspoon", "teaspoons",
]);

const MAX_MULTIPLIER = 99;

// The first word of what follows the number, lowercased and stripped of trailing punctuation, so
// "200g", "200 g", "200 grams." and "200克" all resolve to a comparable token.
function leadingUnitToken(rest: string): string {
  const token = rest.trim().toLowerCase().split(/\s+/)[0] ?? "";
  return token.replace(/[.,]+$/, "");
}

export function parseAmount(raw: string): ParsedAmount {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { multiplier: 1, label: null };

  // A leading number (integer or decimal), then whatever unit words follow.
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (!match) {
    // Unit-only, or something that doesn't start with a digit ("bowl", "半碗"): a label, no scaling.
    return { multiplier: 1, label: trimmed };
  }

  const n = parseFloat(match[1]);
  const rest = match[2].trim();
  const count = Number.isFinite(n) && n > 0 ? Math.min(n, MAX_MULTIPLIER) : 1;

  if (!rest) {
    // Bare number ("2"): a plain count multiplier, shown later as "x2" rather than a spelled unit.
    return { multiplier: count, label: null };
  }
  if (MEASURE_UNITS.has(leadingUnitToken(rest))) {
    // A measurement ("200 g"): keep it as a label, but never scale fixed macros by the measurement.
    return { multiplier: 1, label: trimmed };
  }
  // A counted unit ("2 bowls"): scale by the count and keep the whole phrase as the label.
  return { multiplier: count, label: trimmed };
}

// The stored defaults that mean "one ordinary serving" and should show nothing in the diary row.
const DEFAULT_UNITS: ReadonlySet<string> = new Set(["", "serving", "servings", "1 serving"]);

/**
 * What the diary row shows beside an entry's meal type / time, or null to show nothing. A real unit
 * label ("2 bowls", "200 g", the AI's "1 bowl") shows verbatim; a bare multiple of the default
 * serving shows as a language-neutral "x2"; a single default serving shows nothing.
 */
export function formatAmountLabel(quantity: number, unit: string): string | null {
  const u = (unit ?? "").trim();
  if (!DEFAULT_UNITS.has(u.toLowerCase())) return u;
  if (Number.isFinite(quantity) && quantity !== 1) return `x${quantity}`;
  return null;
}
