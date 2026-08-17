// The barcode scanner must never state a nutrition figure it cannot source.
//
// It used to answer from a hardcoded catalogue of two named Hong Kong supermarket products, with
// macros nobody had checked, plus a generic "HK packaged food, 180 kcal" for ANY unrecognised 489
// code. Both halves were wrong. One barcode shipped labelled as a soya milk at 130 kcal; looked up
// for real it is a sugar-free jasmine tea at 0 kcal. And the 489 fallback meant a scan of something
// we had never heard of still produced a confident number.
//
// It now asks Open Food Facts and returns null whenever it cannot answer honestly. These tests pin
// that down: nothing is invented, a real zero survives, and every failure is a quiet miss rather
// than a thrown error or a made-up row.

import { barcodeService } from "@/services/barcodeService";

const realFetch = global.fetch;

function offResponse(product: unknown, status = 1) {
  return {
    ok: true,
    json: async () => (product === null ? { status: 0 } : { status, product }),
  } as unknown as Response;
}

// Typed as the real fetch signature so assertions on the requested URL typecheck.
function mockFetch(impl: () => Promise<Response>) {
  const fn = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>(() => impl());
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

afterEach(() => {
  global.fetch = realFetch;
  jest.restoreAllMocks();
});

describe("barcodeService.lookup — reading a real record", () => {
  it("prefers the per-serving figures when the record states a serving size", async () => {
    mockFetch(async () =>
      offResponse({
        product_name: "鈣思寶無糖原味豆奶",
        product_name_zh: "鈣思寶無糖原味豆奶",
        brands: "Vitasoy Calci-Plus Hi-Calcium, Vitasoy",
        serving_size: "250 mL",
        nutriments: {
          "energy-kcal_serving": 55,
          "energy-kcal_100g": 22,
          proteins_serving: 4.5,
          carbohydrates_serving: 2.75,
          fat_serving: 3,
        },
      }),
    );

    const p = await barcodeService.lookup("4891028717614");

    expect(p).not.toBeNull();
    expect(p!.calories).toBe(55); // the serving, not the 100 ml figure
    expect(p!.protein).toBe(4.5);
    expect(p!.servingSize).toBe("250 mL");
    expect(p!.brand).toBe("Vitasoy Calci-Plus Hi-Calcium"); // first brand only
    expect(p!.isHongKong).toBe(true);
  });

  it("falls back to per-100g and says so, when there is no serving size", async () => {
    mockFetch(async () =>
      offResponse({
        product_name: "熱浪蕃茄味薯片",
        product_name_zh: "熱浪蕃茄味薯片",
        brands: "Calbee",
        serving_size: "",
        nutrition_data_per: "100g",
        nutriments: { "energy-kcal_100g": 542, proteins_100g: 5.3, carbohydrates_100g: 51.5, fat_100g: 36 },
      }),
    );

    const p = await barcodeService.lookup("4892294418038");

    expect(p!.calories).toBe(542);
    // The user must be able to tell "per packet" from "per 100 g", or the number is misleading.
    expect(p!.servingSize).toBe("100g");
  });

  it("keeps a genuine zero instead of treating it as missing", async () => {
    // A sugar-free tea really is 0 kcal. Rejecting it as "unknown" would be its own inaccuracy.
    mockFetch(async () =>
      offResponse({
        product_name: "香片冷泡茶無糖",
        brands: "維他",
        serving_size: "100 ml",
        nutriments: { "energy-kcal_serving": 0, "energy-kcal_100g": 0, proteins_serving: 0 },
      }),
    );

    const p = await barcodeService.lookup("4891028714842");

    expect(p).not.toBeNull();
    expect(p!.calories).toBe(0);
    expect(p!.name).toBe("香片冷泡茶無糖");
  });

  it("mirrors a single-language name into both fields rather than inventing a translation", async () => {
    mockFetch(async () =>
      offResponse({
        product_name: "Whole rolled oats",
        brands: "Quaker",
        serving_size: "40 g",
        nutriments: { "energy-kcal_serving": 152, proteins_serving: 4.9 },
      }),
    );

    const p = await barcodeService.lookup("4892347004386");

    expect(p!.name).toBe("Whole rolled oats");
    expect(p!.nameZh).toBe("Whole rolled oats");
  });

  it("reads absent macros as zero but never an absent energy value", async () => {
    mockFetch(async () =>
      offResponse({
        product_name: "Sparkling water",
        serving_size: "330 ml",
        nutriments: { "energy-kcal_serving": 0 },
      }),
    );

    const p = await barcodeService.lookup("4890008100309");

    expect(p!.protein).toBe(0);
    expect(p!.carbs).toBe(0);
    expect(p!.fat).toBe(0);
    expect(p!.brand).toBeNull();
  });
});

describe("barcodeService.lookup — everything it refuses to guess", () => {
  it("returns null for a barcode the database does not have", async () => {
    mockFetch(async () => offResponse(null));

    await expect(barcodeService.lookup("4899999999995")).resolves.toBeNull();
  });

  it("returns null for a 489 code it does not know, instead of a generic HK product", async () => {
    // The exact regression: a locally-issued prefix used to be enough to manufacture a row.
    mockFetch(async () => offResponse(null));

    const p = await barcodeService.lookup("4891234567890");

    expect(p).toBeNull();
  });

  it("returns null when the record has a name but no energy", async () => {
    mockFetch(async () =>
      offResponse({ product_name: "Mystery snack", serving_size: "1 bag", nutriments: {} }),
    );

    await expect(barcodeService.lookup("4891028111111")).resolves.toBeNull();
  });

  it("returns null when the record has energy but no name to show", async () => {
    mockFetch(async () => offResponse({ nutriments: { "energy-kcal_100g": 200 } }));

    await expect(barcodeService.lookup("4891028222222")).resolves.toBeNull();
  });

  it("returns null, and does not throw, when the network fails", async () => {
    mockFetch(async () => {
      throw new Error("offline");
    });

    await expect(barcodeService.lookup("4891028717614")).resolves.toBeNull();
  });

  it("returns null on a non-200 response", async () => {
    mockFetch(async () => ({ ok: false, status: 404, json: async () => ({}) }) as unknown as Response);

    await expect(barcodeService.lookup("4891028717614")).resolves.toBeNull();
  });

  it("returns null on malformed JSON", async () => {
    mockFetch(async () =>
      ({
        ok: true,
        json: async () => {
          throw new Error("not json");
        },
      }) as unknown as Response,
    );

    await expect(barcodeService.lookup("4891028717614")).resolves.toBeNull();
  });
});

describe("barcodeService.lookup — input handling", () => {
  it("does not spend a network call on something that is not a barcode", async () => {
    const fetchMock = mockFetch(async () => offResponse(null));

    for (const bad of ["", "   ", "12345", "abcdefgh", "489102871461234567", "4891-0287"]) {
      await expect(barcodeService.lookup(bad)).resolves.toBeNull();
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("trims surrounding whitespace off a scanned code", async () => {
    const fetchMock = mockFetch(async () =>
      offResponse({
        product_name: "Oats",
        serving_size: "40 g",
        nutriments: { "energy-kcal_serving": 152 },
      }),
    );

    const p = await barcodeService.lookup("  4892347004386 ");

    expect(p!.barcode).toBe("4892347004386");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/4892347004386.json");
  });

  it("flags only the 489 GS1 prefix as Hong Kong", async () => {
    mockFetch(async () =>
      offResponse({
        product_name: "Imported biscuit",
        serving_size: "30 g",
        nutriments: { "energy-kcal_serving": 140 },
      }),
    );

    const p = await barcodeService.lookup("5000000000005");

    expect(p!.isHongKong).toBe(false);
  });
});
