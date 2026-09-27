import type { PantryUnit } from "@/types";

// The pantry's units: the three canonical ones plus the count units a fridge actually holds. The
// list is fixed and bilingual on purpose, so every unit has a proper Cantonese counting word and an
// English plural. Order matters: it is the order the unit chips follow after the row's lead unit.
//
// MUST stay in lockstep with the check list in database/0009_pantry_item_units.sql. A unit the
// database does not accept makes the pantry's cloud backup fail, and that backup fails silently.

export interface PantryUnitLabel {
  en: string;
  enPlural: string;
  zh: string;
}

export const PANTRY_UNITS: readonly PantryUnit[] = [
  "piece",
  "box",
  "carton",
  "bottle",
  "jar",
  "can",
  "pack",
  "bag",
  "bunch",
  "loaf",
  "g",
  "ml",
];

// Box and carton are both 盒, bottle and jar are both 樽: natural Cantonese, so the Chinese chip row
// gives each pair one shared chip (see unitChipOptions in utils/pantryUnits.ts).
export const PANTRY_UNIT_LABELS: Record<PantryUnit, PantryUnitLabel> = {
  piece: { en: "piece", enPlural: "pieces", zh: "個" },
  box: { en: "box", enPlural: "boxes", zh: "盒" },
  carton: { en: "carton", enPlural: "cartons", zh: "盒" },
  bottle: { en: "bottle", enPlural: "bottles", zh: "樽" },
  jar: { en: "jar", enPlural: "jars", zh: "樽" },
  can: { en: "can", enPlural: "cans", zh: "罐" },
  pack: { en: "pack", enPlural: "packs", zh: "包" },
  bag: { en: "bag", enPlural: "bags", zh: "袋" },
  bunch: { en: "bunch", enPlural: "bunches", zh: "紮" },
  loaf: { en: "loaf", enPlural: "loaves", zh: "條" },
  g: { en: "g", enPlural: "g", zh: "克" },
  ml: { en: "ml", enPlural: "ml", zh: "毫升" },
};
