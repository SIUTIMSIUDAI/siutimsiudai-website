import { BarcodeProduct } from "@/types";

export interface BarcodeService {
  // Looks a barcode up in Open Food Facts, the open crowd-sourced food database
  // (https://world.openfoodfacts.org, ODbL). Returns null whenever we cannot answer honestly:
  // unknown barcode, no nutrition on the record, network failure, or timeout. The caller turns a
  // null into the "not found, log it manually" path.
  //
  // This used to be a hardcoded catalogue of two named HK supermarket products, with nutrition
  // figures nobody had sourced, plus a generic "packaged food, 180 kcal" for any unrecognised 489
  // code. It was wrong on every count. One of the two barcodes was labelled as a soya milk at
  // 130 kcal; look it up for real and it is a sugar-free jasmine tea at 0 kcal, from a different
  // product line. Putting a real company's trademark on numbers we invented is a legal problem,
  // and inventing a calorie count is a problem for whoever is tracking what they eat. Never
  // hardcode nutrition for a named product: either a real source knows it, or we say we do not.
  lookup(code: string): Promise<BarcodeProduct | null>;
}

const OFF_BASE = "https://world.openfoodfacts.org/api/v2/product";
const LOOKUP_TIMEOUT_MS = 8000;

// Open Food Facts asks every client to identify itself so they can contact us about traffic.
const USER_AGENT = "SiuTimSiuDai/1.0 (https://siutimsiudai.app)";

// Only the fields we map. Asking for the whole record wastes the user's mobile data on a
// document that can run to hundreds of kilobytes.
const FIELDS = [
  "product_name",
  "product_name_zh",
  "brands",
  "serving_size",
  "nutrition_data_per",
  "nutriments",
].join(",");

interface OffNutriments {
  [key: string]: number | string | undefined;
}

interface OffProduct {
  product_name?: string;
  product_name_zh?: string;
  brands?: string;
  serving_size?: string;
  nutrition_data_per?: string;
  nutriments?: OffNutriments;
}

// A barcode is 8 to 14 digits (EAN-8 through GTIN-14). Anything else is a mis-scan or a typo,
// and there is no point spending a network round trip on it.
function isPlausibleBarcode(code: string): boolean {
  return /^\d{8,14}$/.test(code);
}

// Read a nutriment, preferring the per-serving figure when the record has one. Returns undefined
// when the key is absent entirely, which is how "not stated" stays distinct from a real zero. A
// sugar-free tea genuinely is 0 kcal, and rounding that up to "unknown" would be its own lie.
function nutriment(n: OffNutriments, key: string, perServing: boolean): number | undefined {
  const order = perServing ? [`${key}_serving`, `${key}_100g`] : [`${key}_100g`, `${key}_serving`];
  for (const field of order) {
    const raw = n[field];
    const value = typeof raw === "string" ? Number(raw) : raw;
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// OFF stores brands as a comma-separated list. We show the first one, as printed on the packet.
function firstBrand(brands: string | undefined): string | null {
  const first = (brands ?? "").split(",")[0]?.trim();
  return first ? first : null;
}

function toProduct(code: string, p: OffProduct): BarcodeProduct | null {
  const nutriments = p.nutriments ?? {};

  // A record with no name is not worth showing: the user would be logging a blank row.
  const name = (p.product_name ?? "").trim();
  const nameZh = (p.product_name_zh ?? "").trim();
  if (!name && !nameZh) return null;

  const servingSize = (p.serving_size ?? "").trim();
  const perServing = Boolean(servingSize) && nutriments["energy-kcal_serving"] !== undefined;

  // Energy is the one field we refuse to guess. Without it there is nothing to track, so this
  // is a miss and the manual path takes over.
  const calories = nutriment(nutriments, "energy-kcal", perServing);
  if (calories === undefined) return null;

  // Macros are allowed to be absent on an otherwise-good record (drinks often list only energy
  // and sugar). Zero is the conventional reading of a macro a label does not state.
  const protein = nutriment(nutriments, "proteins", perServing) ?? 0;
  const carbs = nutriment(nutriments, "carbohydrates", perServing) ?? 0;
  const fat = nutriment(nutriments, "fat", perServing) ?? 0;
  // OFF states dietary fibre under the `fiber` nutriment (fiber_100g / fiber_serving). Absent on
  // many drinks, so a missing value reads as the conventional 0 g, same as the other macros.
  const fiber = nutriment(nutriments, "fiber", perServing) ?? 0;

  return {
    barcode: code,
    // Whichever name is missing falls back to the other. We never machine-translate here: a
    // guessed Chinese product name is exactly the kind of invention this file exists to avoid.
    name: name || nameZh,
    nameZh: nameZh || name,
    brand: firstBrand(p.brands),
    // When the figures are per 100 g/ml rather than per serving, say so, so the number on screen
    // is never read as "one packet".
    servingSize: perServing ? servingSize : (p.nutrition_data_per ?? "100 g"),
    isHongKong: code.startsWith("489"), // GS1 prefix 489 is Hong Kong
    calories: Math.round(calories),
    protein: round1(protein),
    carbs: round1(carbs),
    fat: round1(fat),
    fiber: round1(fiber),
  };
}

export const barcodeService: BarcodeService = {
  async lookup(code) {
    const trimmed = code.trim();
    if (!isPlausibleBarcode(trimmed)) return null;

    // A scan should not leave the user staring at a spinner because a third-party service is
    // slow. Abort at 8 seconds and let the manual path take over.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);

    try {
      const res = await fetch(`${OFF_BASE}/${trimmed}.json?fields=${FIELDS}`, {
        signal: controller.signal,
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      });
      // OFF answers 404 for an unknown barcode, and 200 with status 0 for some. Both are misses.
      if (!res.ok) return null;

      const body = (await res.json()) as { status?: number; product?: OffProduct };
      if (body.status !== 1 || !body.product) return null;

      return toProduct(trimmed, body.product);
    } catch {
      // Offline, DNS failure, abort, malformed JSON: all of it is "we do not know", which is a
      // miss, not an error the user has to interpret.
      return null;
    } finally {
      clearTimeout(timer);
    }
  },
};
