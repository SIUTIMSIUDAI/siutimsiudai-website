// Regression guard for the silent-fabrication bug.
//
// The pantry scanner used to fall back to its demo mock whenever the live vision call failed. A
// user who photographed a carton of eggs got back six eggs, three tomatoes, spring onion, choy sum
// and 300g of pork, each wearing an "AI guess 94%" badge, with nothing on screen to say the scan
// had failed. In an app people use to track what they eat, a wrong answer that looks confident is
// worse than an error message.
//
// The rule this file enforces: if the backend is CONFIGURED, the live path is the only path.
// Failure is reported as failure. The mock survives only for the no-backend demo case, which is
// covered by pantryScan.test.ts.

const mockInvoke = jest.fn();

jest.mock("@/services/supabase", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } },
  isSupabaseConfigured: true,
}));

import { pantryVisionService } from "@/services/pantryVisionService";

// Every ingredient the demo mock can produce. If any of these surface from a failed live scan,
// we have shipped the bug again.
const MOCK_NAMES = [
  "Egg",
  "Tomato",
  "Spring onion",
  "Choy sum",
  "Pork",
  "Tofu",
  "Garlic",
  "Ginger",
  "Carrot",
  "Shiitake mushroom",
];

describe("pantryVisionService.scan with a configured backend", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it("reports failure, and invents nothing, when the proxy returns an error", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error("upstream_failed") });

    const outcome = await pantryVisionService.scan("BASE64");

    expect(outcome).toEqual({ ok: false, error: "unavailable" });
    // The bug in one assertion: no fabricated pantry rides along with the failure.
    expect(outcome).not.toHaveProperty("items");
  });

  it("reports failure when the request throws (offline, DNS, timeout)", async () => {
    mockInvoke.mockRejectedValue(new Error("Network request failed"));

    const outcome = await pantryVisionService.scan("BASE64");

    expect(outcome).toEqual({ ok: false, error: "unavailable" });
  });

  it("reports failure when the payload is malformed rather than guessing", async () => {
    mockInvoke.mockResolvedValue({ data: { oops: true }, error: null });

    const outcome = await pantryVisionService.scan("BASE64");

    expect(outcome).toEqual({ ok: false, error: "unavailable" });
  });

  it("treats a well-formed empty scan as a real answer, not a failure", async () => {
    // "I looked and saw no ingredients" is information. The review screen has copy for it.
    mockInvoke.mockResolvedValue({ data: { items: [] }, error: null });

    const outcome = await pantryVisionService.scan("BASE64");

    expect(outcome).toEqual({ ok: true, items: [] });
  });

  it("returns exactly what the model saw on success, with no mock padding", async () => {
    mockInvoke.mockResolvedValue({
      data: { items: [{ name: "Egg", nameZh: "雞蛋", quantity: 12, unit: "piece", confidence: 0.9 }] },
      error: null,
    });

    const outcome = await pantryVisionService.scan("BASE64");

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // One item in, one item out. The old fallback padded every scan to five.
    expect(outcome.items).toHaveLength(1);
    expect(outcome.items[0]).toMatchObject({ name: "Egg", quantity: 12, unit: "piece" });
  });

  it("never leaks a demo ingredient through any failure mode", async () => {
    const failures = [
      { data: null, error: new Error("boom") },
      { data: { oops: true }, error: null },
      { data: undefined, error: null },
    ];

    for (const response of failures) {
      mockInvoke.mockResolvedValue(response);
      const outcome = await pantryVisionService.scan("BASE64");
      expect(outcome.ok).toBe(false);
      const leaked = JSON.stringify(outcome);
      for (const name of MOCK_NAMES) expect(leaked).not.toContain(name);
    }
  });
});
