// The receipt scan: one to three photos of one receipt, read together in a single request. Same
// honesty rule as the fridge scan: with a configured backend, only what the model read comes back,
// and a failure is reported as a failure.

const mockInvoke = jest.fn();

jest.mock("@/services/supabase", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } },
  isSupabaseConfigured: true,
}));

import {
  imageTypeOf,
  pantryVisionService,
  receiptFits,
  RECEIPT_MAX_BASE64,
} from "@/services/pantryVisionService";

function httpError(status: number, body: unknown): unknown {
  return { context: new Response(JSON.stringify(body), { status }) };
}

const PHOTOS = [
  { base64: "/9j/AAA", mediaType: "image/jpeg" },
  { base64: "iVBORw0KGgoBBB", mediaType: "image/png" },
];

describe("pantryVisionService.scanReceipt", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it("sends every photo together as one receipt request", async () => {
    mockInvoke.mockResolvedValue({ data: { items: [] }, error: null });

    await pantryVisionService.scanReceipt(PHOTOS);

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const [fnName, options] = mockInvoke.mock.calls[0] as [string, { body: unknown }];
    expect(fnName).toBe("pantry-scan");
    expect(options.body).toEqual({
      mode: "receipt",
      images: [
        { data: "/9j/AAA", mediaType: "image/jpeg" },
        { data: "iVBORw0KGgoBBB", mediaType: "image/png" },
      ],
    });
  });

  it("returns what the model read, cleaned the same way as a fridge scan", async () => {
    mockInvoke.mockResolvedValue({
      data: {
        items: [
          { name: "Eggs", nameZh: "雞蛋", quantity: 2, unit: "boxes", confidence: 0.9 },
          { name: "", nameZh: "", quantity: 1, unit: "bag" },
          { name: "Pork", nameZh: "豬肉", quantity: 452, unit: "g" },
        ],
      },
      error: null,
    });

    const outcome = await pantryVisionService.scanReceipt(PHOTOS);

    expect(outcome).toEqual({
      ok: true,
      items: [
        { name: "Eggs", nameZh: "雞蛋", quantity: 2, unit: "box", confidence: 0.9 },
        { name: "Pork", nameZh: "豬肉", quantity: 452, unit: "g" },
      ],
    });
  });

  it("treats a receipt with no food or drink as an empty list, not a failure", async () => {
    mockInvoke.mockResolvedValue({ data: { items: [] }, error: null });
    expect(await pantryVisionService.scanReceipt(PHOTOS)).toEqual({ ok: true, items: [] });
  });

  it("reports failures honestly, keeping the daily cap apart from an outage", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: httpError(429, { error: "rate_limited" }) });
    expect(await pantryVisionService.scanReceipt(PHOTOS)).toEqual({ ok: false, error: "rate_limited" });

    mockInvoke.mockResolvedValue({ data: null, error: new Error("upstream_failed") });
    expect(await pantryVisionService.scanReceipt(PHOTOS)).toEqual({ ok: false, error: "unavailable" });

    mockInvoke.mockResolvedValue({ data: { oops: true }, error: null });
    expect(await pantryVisionService.scanReceipt(PHOTOS)).toEqual({ ok: false, error: "unavailable" });

    mockInvoke.mockRejectedValue(new Error("Network request failed"));
    expect(await pantryVisionService.scanReceipt(PHOTOS)).toEqual({ ok: false, error: "unavailable" });
  });
});

describe("receiptFits", () => {
  const photo = (chars: number) => ({ base64: "x".repeat(chars), mediaType: "image/jpeg" });

  it("takes one to three photos", () => {
    expect(receiptFits([])).toBe(false);
    expect(receiptFits([photo(10)])).toBe(true);
    expect(receiptFits([photo(10), photo(10), photo(10)])).toBe(true);
    expect(receiptFits([photo(10), photo(10), photo(10), photo(10)])).toBe(false);
  });

  it("refuses photos that are too big to send together", () => {
    const half = Math.floor(RECEIPT_MAX_BASE64 / 2);
    expect(receiptFits([photo(half), photo(half)])).toBe(true);
    expect(receiptFits([photo(half), photo(half), photo(1)])).toBe(false);
  });
});

describe("imageTypeOf", () => {
  it("tells a PNG screenshot from a JPEG photo by its first bytes", () => {
    expect(imageTypeOf("iVBORw0KGgoAAAANSUhEUg")).toBe("image/png");
    expect(imageTypeOf("/9j/4AAQSkZJRgABAQ")).toBe("image/jpeg");
  });

  it("falls back to JPEG for anything it doesn't recognise", () => {
    expect(imageTypeOf("")).toBe("image/jpeg");
    expect(imageTypeOf("R0lGODlh")).toBe("image/jpeg");
  });
});
