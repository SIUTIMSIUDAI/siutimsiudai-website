import {
  buildItemSearchUrl,
  buildSearchUrl,
  buildStoreEntryUrl,
  formatClipboardList,
  humanizeAmount,
  matchAvailabilityFor,
  missingItemsFromRecipe,
  searchQueryFor,
  searchTermFor,
} from "@/utils/cartExport";
import { cartExportService } from "@/services/cartExportService";
import { RETAILERS } from "@/constants/retailers";
import { canonicalizeIngredient } from "@/constants/ingredientDictionary";
import { CanonicalUnit, GroceryListItem, PantryItem, Recipe, RecipeIngredient } from "@/types";

// The 1-Click Cart Export logic (Max perk), proven without rendering. The three guarantees that
// matter: (1) the language rule — HKTVmall searches in English, Wellcome and ParknShop in Chinese;
// (2) availability numbers are deterministic per store so the comparison modal is stable and the
// mock is swap-ready; (3) "missing" reuses the same pantry-aware grocery merge as the rest of the
// app. No clipboard/Linking here: those are side effects wired at the UI call site.

function gli(
  over: Partial<GroceryListItem> & Pick<GroceryListItem, "name" | "nameZh">,
): GroceryListItem {
  const unit = over.unit ?? "piece";
  return {
    id: over.id ?? `gli-${over.name}`,
    groceryListId: "test",
    name: over.name,
    nameZh: over.nameZh,
    quantity: over.quantity ?? 1,
    unit,
    displayUnit: over.displayUnit ?? unit,
    checked: over.checked ?? false,
    sourceRecipeIds: over.sourceRecipeIds ?? ["r1"],
    mergedFrom: over.mergedFrom ?? [over.name],
    inPantry: over.inPantry ?? false,
  };
}

// The "Soy Sauce Braised Chicken" missing set: four items, each a canonical dictionary key.
const MISSING: GroceryListItem[] = [
  gli({ name: "Chicken", nameZh: "雞肉", quantity: 400, unit: "g" }),
  gli({ name: "Dark soy sauce", nameZh: "老抽", quantity: 15, unit: "ml" }),
  gli({ name: "Ginger", nameZh: "薑", quantity: 2, unit: "piece" }),
  gli({ name: "Shaoxing wine", nameZh: "紹興酒", quantity: 15, unit: "ml" }),
];

describe("searchTermFor — the language rule", () => {
  it("hands HKTVmall (en) the English name", () => {
    expect(searchTermFor(MISSING[0], "en")).toBe("Chicken");
  });

  it("hands Wellcome / ParknShop (zh) the Traditional Chinese name", () => {
    expect(searchTermFor(MISSING[0], "zh")).toBe("雞肉");
  });

  it("falls back to the other field when the preferred one is blank", () => {
    expect(searchTermFor({ name: "Egg", nameZh: "" }, "zh")).toBe("Egg");
    expect(searchTermFor({ name: "", nameZh: "蛋" }, "en")).toBe("蛋");
  });
});

describe("humanizeAmount", () => {
  it("reads piece counts as x-notation and masses/volumes with their unit", () => {
    expect(humanizeAmount(3, "piece")).toBe("x3");
    expect(humanizeAmount(400, "g")).toBe("400g");
    expect(humanizeAmount(15, "ml")).toBe("15ml");
  });

  it("rounds a catty conversion to whole grams instead of showing 786.23g", () => {
    // 1.3 catty at the exact HK rate of 604.79g. The precision is right and worth keeping in the
    // maths, but on a checklist it reads as a spreadsheet rather than a shopping list.
    expect(humanizeAmount(786.227, "g")).toBe("786g");
    expect(humanizeAmount(604.79, "g")).toBe("605g");
    expect(humanizeAmount(100.4, "g")).toBe("100g");
  });

  it("keeps one decimal below 100, where the decimal IS the quantity", () => {
    // Rounding 0.5 to 1 doubles it and to 0 loses the ingredient. Small amounts are also the potent
    // ones, so this is the wrong end of the scale to be vague about.
    expect(humanizeAmount(12.55, "g")).toBe("12.6g");
    expect(humanizeAmount(0.5, "tsp")).toBe("0.5tsp");
    expect(humanizeAmount(2.25, "tbsp")).toBe("2.3tbsp");
  });

  it("never leaves a trailing zero on a round number", () => {
    // A quantity that needs no decimal must not grow one, or every clean amount on the list starts
    // reading as a measurement taken to one decimal place.
    expect(humanizeAmount(15, "ml")).toBe("15ml");
    expect(humanizeAmount(2.0, "tbsp")).toBe("2tbsp");
    expect(humanizeAmount(99.96, "g")).toBe("100g");
  });

  it("keeps piece counts whole, because half an egg cannot go in a basket", () => {
    expect(humanizeAmount(2.4, "piece")).toBe("x2");
    expect(humanizeAmount(2.5, "piece")).toBe("x3");
  });

  it("degrades to zero rather than printing NaN at the shopper", () => {
    expect(humanizeAmount(Number.NaN, "g")).toBe("0g");
    expect(humanizeAmount(Number.POSITIVE_INFINITY, "g")).toBe("0g");
  });
});

describe("formatClipboardList — full list, one language throughout", () => {
  it("uses English names end to end for HKTVmall", () => {
    expect(formatClipboardList(MISSING, "en")).toBe(
      "Chicken 400g\nDark soy sauce 15ml\nGinger x2\nShaoxing wine 15ml",
    );
  });

  it("uses Traditional Chinese names end to end for the supermarkets", () => {
    expect(formatClipboardList(MISSING, "zh")).toBe("雞肉 400g\n老抽 15ml\n薑 x2\n紹興酒 15ml");
  });
});

describe("searchQueryFor — how many ingredients one URL may carry", () => {
  it("gives a store that ORs terms the WHOLE missing list, not just the first line", () => {
    // This is the bug the shopping run exists to fix: four missing ingredients used to produce a
    // search for one of them, and the other three were silently dropped.
    expect(searchQueryFor(RETAILERS.hktvmall, MISSING)).toBe(
      "Chicken Dark soy sauce Ginger Shaoxing wine",
    );
  });

  it("gives a store that cannot combine exactly one term", () => {
    // Wellcome matches a joined string as a single phrase and answers 很抱歉，沒有找到 with a page
    // of unrelated recommendations. A two-term query there is worse than a one-term query.
    expect(searchQueryFor(RETAILERS.wellcome, MISSING)).toBe("雞肉");
    expect(searchQueryFor(RETAILERS.parknshop, MISSING)).toBe("雞肉");
  });

  it("is empty when nothing is missing, for every store", () => {
    expect(searchQueryFor(RETAILERS.hktvmall, [])).toBe("");
    expect(searchQueryFor(RETAILERS.wellcome, [])).toBe("");
  });
});

describe("buildSearchUrl — encoded, per-store language, per-store term count", () => {
  it("builds HKTVmall's real search URL: search_a/ + keyword=, never search?q=", () => {
    const { webUrl, deepLinkUrl } = buildSearchUrl(RETAILERS.hktvmall, MISSING);
    // Path and parameter both come from HKTVmall's own header form. `search?q=` is what shipped
    // before and it silently redirected to an unrelated category page instead of searching.
    expect(webUrl).toBe(
      `https://www.hktvmall.com/hktv/en/search_a/?keyword=${encodeURIComponent(
        "Chicken Dark soy sauce Ginger Shaoxing wine",
      )}`,
    );
    expect(webUrl).not.toContain("?q=");
    // Their app claims { "/": "*" } in apple-app-site-association, so this https URL IS the deep
    // link and iOS opens it in the app. Mirroring it makes the launcher skip the canOpenURL probe,
    // which is what the old `hktvmall://` scheme needed and what used to throw on iOS.
    expect(deepLinkUrl).toBe(webUrl);
  });

  it("builds PARKnSHOP's search URL with its own third spelling, text=", () => {
    const { webUrl } = buildSearchUrl(RETAILERS.parknshop, MISSING);
    expect(webUrl).toBe(
      `https://www.parknshop.com/zh-hk/search?text=${encodeURIComponent("雞肉")}`,
    );
  });

  it("uses a different query parameter for all three stores, because they all differ", () => {
    // Guards the single most repeated bug in this file: assuming `?q=` because it looks standard.
    const param = (r: keyof typeof RETAILERS) =>
      new URL(buildSearchUrl(RETAILERS[r], MISSING).webUrl).searchParams.keys().next().value;
    expect(param("hktvmall")).toBe("keyword");
    expect(param("wellcome")).toBe("keyword");
    expect(param("parknshop")).toBe("text");
  });

  it("builds a Chinese web URL for Wellcome and mirrors it as the deep link (no app scheme)", () => {
    const { webUrl, deepLinkUrl } = buildSearchUrl(RETAILERS.wellcome, MISSING);
    // `/zh-hant/` + `keyword=`, both verified against the live site. The previous `/zh-hk/search?q=`
    // 404'd, which is what the shopper actually saw.
    expect(webUrl).toBe(
      `https://www.wellcome.com.hk/zh-hant/wellcome/search?keyword=${encodeURIComponent("雞肉")}`,
    );
    expect(deepLinkUrl).toBe(webUrl);
  });

  it("degrades to an empty query when there is nothing missing", () => {
    expect(buildSearchUrl(RETAILERS.wellcome, []).webUrl).toBe(
      "https://www.wellcome.com.hk/zh-hant/wellcome/search?keyword=",
    );
  });
});

describe("buildItemSearchUrl — one checklist row, one search", () => {
  it("searches a single ingredient even at a store that cannot combine terms", () => {
    // Searching ONE term is the thing Wellcome does well, so the checklist row is a real search
    // rather than the storefront the store row falls back to.
    const { webUrl } = buildItemSearchUrl(RETAILERS.wellcome, MISSING[1]);
    expect(webUrl).toBe(
      `https://www.wellcome.com.hk/zh-hant/wellcome/search?keyword=${encodeURIComponent("老抽")}`,
    );
  });

  it("keeps the store's language for its own row, not the app's", () => {
    expect(buildItemSearchUrl(RETAILERS.hktvmall, MISSING[3]).webUrl).toContain(
      encodeURIComponent("Shaoxing wine"),
    );
    expect(buildItemSearchUrl(RETAILERS.parknshop, MISSING[3]).webUrl).toContain(
      encodeURIComponent("紹興酒"),
    );
  });

  it("never leaks a second ingredient into a single-item search", () => {
    const { webUrl } = buildItemSearchUrl(RETAILERS.hktvmall, MISSING[2]);
    expect(webUrl).toBe("https://www.hktvmall.com/hktv/en/search_a/?keyword=Ginger");
  });
});

describe("buildStoreEntryUrl — where tapping the store row itself lands", () => {
  it("sends a combining store straight to results for the entire list", () => {
    expect(buildStoreEntryUrl(RETAILERS.hktvmall, MISSING).webUrl).toBe(
      buildSearchUrl(RETAILERS.hktvmall, MISSING).webUrl,
    );
  });

  it("sends a non-combining store to its storefront, not a search for one arbitrary item", () => {
    // Singling out whichever ingredient sorts first is arbitrary and reads as "that is all we
    // sent". Those stores are shopped through the checklist instead.
    expect(buildStoreEntryUrl(RETAILERS.wellcome, MISSING).webUrl).toBe(
      "https://www.wellcome.com.hk/",
    );
    expect(buildStoreEntryUrl(RETAILERS.parknshop, MISSING).webUrl).toBe(
      "https://www.parknshop.com/zh-hk",
    );
  });

  it("keeps PARKnSHOP's storefront path free of a trailing slash", () => {
    // Their apple-app-site-association lists the literal path `/zh-hk`. `/zh-hk/` does not match
    // it, and the difference is the whole difference between opening their app and opening Safari.
    expect(buildStoreEntryUrl(RETAILERS.parknshop, MISSING).webUrl.endsWith("/")).toBe(false);
  });

  it("falls back to the storefront for a combining store when nothing is missing", () => {
    expect(buildStoreEntryUrl(RETAILERS.hktvmall, []).webUrl).toBe("https://www.hktvmall.com/");
  });

  it("mirrors the web URL as the deep link, so the launcher skips the canOpenURL probe", () => {
    for (const r of ["hktvmall", "wellcome", "parknshop"] as const) {
      const { webUrl, deepLinkUrl } = buildStoreEntryUrl(RETAILERS[r], MISSING);
      expect(deepLinkUrl).toBe(webUrl);
    }
  });
});

describe("matchAvailabilityFor — canonical carry-status, language-correct term", () => {
  it("marks everything available for a store with no catalogue gaps", () => {
    const matches = matchAvailabilityFor(MISSING, RETAILERS.hktvmall, []);
    expect(matches.every((m) => m.available)).toBe(true);
    expect(matches[0].term).toBe("Chicken"); // en term surfaced
  });

  it("marks a gapped item unavailable while still surfacing its Chinese term", () => {
    const matches = matchAvailabilityFor(MISSING, RETAILERS.wellcome, ["shaoxing wine"]);
    const wine = matches.find((m) => m.itemId === MISSING[3].id)!;
    expect(wine.available).toBe(false);
    expect(wine.term).toBe("紹興酒");
    expect(matches.filter((m) => m.available).length).toBe(3);
  });
});

describe("cartExportService.checkAvailability — deterministic three-store comparison", () => {
  it("orders widest-catalogue first with the expected found counts", async () => {
    const res = await cartExportService.checkAvailability(MISSING);
    expect(res.map((r) => r.retailer)).toEqual(["hktvmall", "wellcome", "parknshop"]);
    expect(res[0]).toMatchObject({ retailer: "hktvmall", foundCount: 4, totalCount: 4 });
    expect(res[1]).toMatchObject({ retailer: "wellcome", foundCount: 3, totalCount: 4 });
    expect(res[2]).toMatchObject({ retailer: "parknshop", foundCount: 3, totalCount: 4 });
  });

  it("returns identical results across calls (stable, not random)", async () => {
    const a = await cartExportService.checkAvailability(MISSING);
    const b = await cartExportService.checkAvailability(MISSING);
    expect(a).toEqual(b);
  });
});

describe("cartExportService.buildExport — language-correct clipboard + URLs", () => {
  it("gives HKTVmall an English clipboard list and a search for the whole list", () => {
    const p = cartExportService.buildExport("hktvmall", MISSING);
    expect(p.clipboardText.split("\n")[0]).toBe("Chicken 400g");
    expect(p.webUrl).toContain("search_a");
    expect(p.webUrl).toContain(encodeURIComponent("Shaoxing wine")); // the LAST item, not just the first
    expect(p.retailer).toBe("hktvmall");
  });

  it("gives Wellcome a Chinese clipboard list and its storefront", () => {
    const p = cartExportService.buildExport("wellcome", MISSING);
    expect(p.clipboardText.split("\n")[0]).toBe("雞肉 400g");
    expect(p.webUrl).toBe("https://www.wellcome.com.hk/");
  });

  it("always copies EVERY missing ingredient, whatever one URL can carry", () => {
    // The clipboard is the safety net: a store that can only be searched one term at a time still
    // hands the shopper the complete list to paste or read off.
    for (const r of ["hktvmall", "wellcome", "parknshop"] as const) {
      expect(cartExportService.buildExport(r, MISSING).clipboardText.split("\n")).toHaveLength(
        MISSING.length,
      );
    }
  });
});

describe("missingItemsFromRecipe — pantry-aware, reuses the grocery merge", () => {
  const ing = (
    name: string,
    nameZh: string,
    quantity: number,
    unit: CanonicalUnit,
  ): RecipeIngredient => ({
    id: `i-${name}`,
    recipeId: "r1",
    name,
    nameZh,
    quantity,
    unit,
    displayUnit: unit,
    rawText: name,
    substitutedFrom: null,
  });

  const recipe: Recipe = {
    id: "r1",
    userId: "guest",
    title: "Test dish",
    titleZh: "測試",
    servings: 2,
    sourceType: "manual",
    sourceUrl: null,
    imageUri: null,
    totalMinutes: 20,
    ingredients: [ing("Chicken", "雞肉", 400, "g"), ing("Egg", "雞蛋", 3, "piece")],
    steps: [],
    createdAt: new Date("2026-01-01").toISOString(),
  };

  const pantry: PantryItem[] = [
    {
      id: "p-egg",
      userId: "guest",
      name: "Egg",
      nameZh: "雞蛋",
      quantity: 10,
      unit: "piece",
      inStock: true,
      updatedAt: new Date("2026-01-01").toISOString(),
    },
  ];

  it("keeps only what the pantry cannot cover", () => {
    const missing = missingItemsFromRecipe(recipe, pantry);
    const keys = missing.map((m) => canonicalizeIngredient(m.name));
    expect(keys).toContain("chicken"); // not stocked -> still needed
    expect(keys).not.toContain("egg"); // 10 in the pantry covers the 3 required
    expect(missing.every((m) => m.quantity > 0)).toBe(true);
  });
});
