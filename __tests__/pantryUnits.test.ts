import {
  canonicalOf,
  formatPantryAmount,
  parsePantryUnit,
  unitAfterTap,
  unitChipOptions,
} from "@/utils/pantryUnits";
import type { PantryUnit } from "@/types";

// The pantry's real-world units (box, bottle, bunch ...) and the rules every screen shares: how an
// AI answer is read, how an amount is shown in each language, and how the unit chips are ordered and
// tapped. Pure, so no store or screen is needed.

describe("parsePantryUnit", () => {
  it.each([["box", "box"], ["Boxes", "box"], [" bottles ", "bottle"], ["Loaves", "loaf"], ["pieces", "piece"], ["ml", "ml"]])(
    "reads %p as %p",
    (raw, want) => expect(parsePantryUnit(raw)).toBe(want),
  );
  it.each(["bucket", "", null, 3])("rejects %p", (raw) => expect(parsePantryUnit(raw)).toBeNull());

  // Everyday synonyms the model or a person may use. "grams" falling back to piece would read as
  // "300 pieces of pork". kg and L are deliberately absent: they would need the quantity converted.
  it.each([
    ["grams", "g"], ["Gram", "g"], ["millilitres", "ml"], ["milliliters", "ml"], ["pcs", "piece"], ["pc", "piece"],
    ["tin", "can"], ["Tins", "can"], ["packet", "pack"], ["packets", "pack"], ["punnet", "box"], ["punnets", "box"],
  ])("reads the synonym %p as %p", (raw, want) => expect(parsePantryUnit(raw)).toBe(want));
  it.each(["kg", "L", "litres"])("does not guess a converted unit %p", (raw) => expect(parsePantryUnit(raw)).toBeNull());
});

it("canonicalOf keeps g and ml and counts everything else as pieces", () => {
  expect((["g", "ml", "piece", "box", "loaf"] as PantryUnit[]).map(canonicalOf)).toEqual([
    "g",
    "ml",
    "piece",
    "piece",
    "piece",
  ]);
});

describe("formatPantryAmount", () => {
  it.each([
    [3, "box", "en", "3 boxes"],
    [1, "box", "en", "1 box"],
    [2, "loaf", "en", "2 loaves"],
    [1.5, "bottle", "en", "1.5 bottles"],
    [5, "piece", "en", "5 pieces"],
    [3, "box", "zh-Hant", "3 盒"],
    [5, "bottle", "zh-Hant", "5 樽"],
    [2, "piece", "zh-Hant", "2 個"],
  ] as const)("%p %p in %p reads %p", (q, unit, locale, want) =>
    expect(formatPantryAmount(q, unit, "metric", locale)).toBe(want),
  );
  it("shows no amount for an in-stock item with quantity 0", () =>
    expect(formatPantryAmount(0, "box", "metric", "en")).toBeNull());
  it("still converts grams for the wet-market system", () =>
    expect(formatPantryAmount(1209.58, "g", "hk_market", "zh-Hant")).toBe("2 斤"));
  it("still shows a pre-update gram item in metric", () =>
    expect(formatPantryAmount(300, "g", "metric", "en")).toBe("300 g"));
  // A unit this build doesn't know (saved by a newer release, then rolled back) must not crash the
  // Pantry tab: it reads as pieces.
  it("reads an unknown unit as pieces instead of crashing", () => {
    expect(formatPantryAmount(2, "crate" as PantryUnit, "metric", "en")).toBe("2 pieces");
    expect(formatPantryAmount(2, "crate" as PantryUnit, "metric", "zh-Hant")).toBe("2 個");
  });
});

describe("unitChipOptions", () => {
  it("offers all 12 in English, the AI's pick first, then list order", () =>
    expect(unitChipOptions("can", "en").map((c) => c.label)).toEqual([
      "can", "piece", "box", "carton", "bottle", "jar", "pack", "bag", "bunch", "loaf", "g", "ml",
    ]));
  it("offers 10 in Chinese, box/carton sharing 盒 and bottle/jar sharing 樽", () => {
    const chips = unitChipOptions("piece", "zh-Hant");
    expect(chips.map((c) => c.label)).toEqual(["個", "盒", "樽", "罐", "包", "袋", "紮", "條", "克", "毫升"]);
    expect(chips[1].units).toEqual(["box", "carton"]);
    expect(chips[2].units).toEqual(["bottle", "jar"]);
  });
  it("leads with the shared chip when the AI picked carton", () =>
    expect(unitChipOptions("carton", "zh-Hant")[0].units).toEqual(["box", "carton"]));
});

describe("unitAfterTap", () => {
  const shared = unitChipOptions("piece", "zh-Hant")[1]; // 盒
  it("keeps carton when the already-selected 盒 chip is tapped", () =>
    expect(unitAfterTap(shared, "carton")).toBe("carton"));
  it("sets box when 盒 is tapped from another unit", () => expect(unitAfterTap(shared, "can")).toBe("box"));
});
