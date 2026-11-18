// Pure rules for the pantry's real-world units, shared by the scan parser, the pantry list, the
// review screen and the Add item sheet so they can never disagree: how a unit the AI names is read,
// how an amount is shown in each language, and how the unit chips are ordered and tapped.

import type { CanonicalUnit, Locale, MeasurementSystem, PantryUnit } from "@/types";
import { PANTRY_UNIT_LABELS, PANTRY_UNITS } from "@/constants/pantryUnits";
import { displayInSystem } from "./unitConverter";
import { formatQuantity } from "./formatters";

// Everyday synonyms for listed units that the model (or a person) may use; "grams" falling back to
// piece would read as "300 pieces of pork". Only true synonyms: kg and L are left out on purpose,
// because reading them as g or ml would also need the quantity converted.
const SYNONYMS: Record<string, PantryUnit> = {
  gram: "g",
  grams: "g",
  millilitre: "ml",
  millilitres: "ml",
  milliliter: "ml",
  milliliters: "ml",
  pc: "piece",
  pcs: "piece",
  tin: "can",
  tins: "can",
  packet: "pack",
  packets: "pack",
  punnet: "box",
  punnets: "box",
};

// Every spelling a unit may arrive in, lower-cased: its key, its English plural ("Boxes", "loaves")
// or a synonym. Keys and plurals come from the catalogue, so adding a unit there is enough.
const BY_SPELLING: ReadonlyMap<string, PantryUnit> = new Map([
  ...PANTRY_UNITS.flatMap((u): [string, PantryUnit][] => [
    [u, u],
    [PANTRY_UNIT_LABELS[u].enPlural.toLowerCase(), u],
  ]),
  ...Object.entries(SYNONYMS),
]);

/** Read a unit from the AI or an old row. Case and surrounding space don't matter; null if unknown. */
export function parsePantryUnit(raw: unknown): PantryUnit | null {
  if (typeof raw !== "string") return null;
  return BY_SPELLING.get(raw.trim().toLowerCase()) ?? null;
}

/** The unit recipe maths uses for a pantry unit: g and ml stay, every count unit is a piece. */
export function canonicalOf(unit: PantryUnit): CanonicalUnit {
  return unit === "g" || unit === "ml" ? unit : "piece";
}

/**
 * A pantry amount as people read it: "3 boxes" / "3 盒". Null when there is no amount (an item
 * marked in stock with quantity 0). Grams and millilitres keep going through the measurement system,
 * so kg, L, 斤 and 兩 still show where the user chose them.
 */
export function formatPantryAmount(
  quantity: number,
  unit: PantryUnit,
  system: MeasurementSystem,
  locale: Locale,
): string | null {
  if (!(quantity > 0)) return null;
  if (unit === "g" || unit === "ml") {
    const measure = displayInSystem(quantity, unit, system);
    return `${formatQuantity(measure.quantity)} ${locale === "zh-Hant" ? measure.unitZh : measure.unit}`;
  }
  const shown = formatQuantity(quantity);
  // A unit this build doesn't know (saved by a newer release, then rolled back) reads as pieces
  // rather than crashing the whole Pantry tab on render.
  const label = PANTRY_UNIT_LABELS[unit] ?? PANTRY_UNIT_LABELS.piece;
  const word = locale === "zh-Hant" ? label.zh : shown === "1" ? label.en : label.enPlural;
  return `${shown} ${word}`;
}

export interface PantryUnitChip {
  key: string;
  label: string;
  units: readonly PantryUnit[];
}

// One chip per unit in English. In Chinese, units that share a word (box + carton 盒, bottle +
// jar 樽) share one chip, the first of the pair being what a tap on that chip sets.
function chipsFor(locale: Locale): PantryUnitChip[] {
  if (locale !== "zh-Hant") {
    return PANTRY_UNITS.map((u) => ({ key: u, label: PANTRY_UNIT_LABELS[u].en, units: [u] }));
  }
  const chips: { key: string; label: string; units: PantryUnit[] }[] = [];
  for (const u of PANTRY_UNITS) {
    const label = PANTRY_UNIT_LABELS[u].zh;
    const shared = chips.find((c) => c.label === label);
    if (shared) shared.units.push(u);
    else chips.push({ key: u, label, units: [u] });
  }
  return chips;
}

/**
 * The chips for a unit row: the chip holding `lead` (the AI's original pick, or piece for a
 * hand-added row) first, then the rest in list order. Callers pass the row's lead, not its current
 * unit, so the order stays put while the user taps around.
 */
export function unitChipOptions(lead: PantryUnit, locale: Locale): PantryUnitChip[] {
  const chips = chipsFor(locale);
  const at = chips.findIndex((c) => c.units.includes(lead));
  return at <= 0 ? chips : [chips[at], ...chips.slice(0, at), ...chips.slice(at + 1)];
}

/** What tapping a chip sets: nothing changes if it already holds the current unit (so a carton stays a carton on 盒). */
export function unitAfterTap(chip: PantryUnitChip, current: PantryUnit): PantryUnit {
  return chip.units.includes(current) ? current : chip.units[0];
}
