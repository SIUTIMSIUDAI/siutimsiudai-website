// Regression guard for the silent-fabrication bug on the MEAL LOGGING path, the sibling of
// pantryScanFallback.test.ts.
//
// Two separate defects lived here:
//
//   1. visionFoodService had no backend at all. `recognize()` took ZERO parameters, so the photo was
//      accepted and thrown away, and every capture returned the next entry from a hardcoded list of
//      HK classics. A photo of bread came back as an egg tart and har gow, with a confidence badge.
//   2. nlpMealService called the real estimator but fell through to an on-device guesser both when
//      the call FAILED and when it succeeded with an EMPTY list — so "I don't know what that was"
//      was silently rewritten into invented macros.
//
// The rule enforced here, same as the pantry scanner: if the backend is CONFIGURED, the live path is
// the only path. Failure is reported as failure, and an empty answer is honoured as a real answer.
// The mocks survive only for the no-backend demo case (Expo Go without env, web, tests).

const mockInvoke = jest.fn();

jest.mock("@/services/supabase", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } },
  isSupabaseConfigured: true,
}));

import { visionFoodService } from "@/services/visionFoodService";
import { nlpMealService } from "@/services/nlpMealService";

// The exact dishes the photo demo mock rotates through. The user's bug report was a photo of bread
// coming back as "eggs and har gow" — POOL[3] is Egg Tart and the alternate is always Har Gow.
const MOCK_DISHES = [
  "Har Gow",
  "Siu Mai",
  "Baked Pork Chop Rice",
  "Egg Tart",
  "Pineapple Bun",
];

const FAILURES = [
  { data: null, error: new Error("upstream_failed") },
  { data: { oops: true }, error: null },
  { data: undefined, error: null },
];

describe("visionFoodService.recognize with a configured backend", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it("sends the photo to the estimator instead of discarding it", async () => {
    mockInvoke.mockResolvedValue({ data: { meals: [] }, error: null });

    await visionFoodService.recognize("BASE64PHOTO");

    // The original signature was `async recognize()` with no parameters at all, so this assertion
    // is the whole bug: the bytes the user photographed must actually reach the model.
    expect(mockInvoke).toHaveBeenCalledWith(
      "estimate-meal",
      expect.objectContaining({
        body: expect.objectContaining({ imageBase64: "BASE64PHOTO" }),
      }),
    );
  });

  it("reports failure, and invents nothing, when the proxy returns an error", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error("upstream_failed") });

    const outcome = await visionFoodService.recognize("BASE64PHOTO");

    expect(outcome).toEqual({ ok: false, error: "unavailable" });
    expect(outcome).not.toHaveProperty("results");
  });

  it("reports failure when the request throws (offline, DNS, timeout)", async () => {
    mockInvoke.mockRejectedValue(new Error("Network request failed"));

    const outcome = await visionFoodService.recognize("BASE64PHOTO");

    expect(outcome).toEqual({ ok: false, error: "unavailable" });
  });

  it("honours an empty result as a real 'no food in this photo' answer", async () => {
    // The photo prompt explicitly asks for this on a picture of a cat. It must not be upgraded
    // into a guess, and it must not be reported as a failure either.
    mockInvoke.mockResolvedValue({ data: { meals: [] }, error: null });

    const outcome = await visionFoodService.recognize("BASE64PHOTO");

    expect(outcome).toEqual({ ok: true, results: [] });
  });

  it("returns what the model actually saw, mapping the photo-only fields", async () => {
    mockInvoke.mockResolvedValue({
      data: {
        meals: [
          {
            name: "French bread",
            nameZh: "法式麵包",
            calories: 280,
            protein: 9,
            carbs: 54,
            fat: 3,
            unit: "small loaf",
            unitZh: "一條小麵包",
            confidence: 0.9,
            micros: { iron: 3, calcium: 40, potassium: 120, vitaminC: 0, vitaminD: 0 },
          },
        ],
      },
      error: null,
    });

    const outcome = await visionFoodService.recognize("BASE64PHOTO");

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.results).toHaveLength(1);
    expect(outcome.results[0]).toMatchObject({
      name: "French bread",
      nameZh: "法式麵包",
      calories: 280,
      confidence: 0.9,
      portionLabel: "small loaf",
      portionLabelZh: "一條小麵包",
    });
  });

  it("clamps a nonsense confidence rather than badging a guess as certain", async () => {
    mockInvoke.mockResolvedValue({
      data: { meals: [{ name: "Egg", calories: 70, confidence: 12 }] },
      error: null,
    });

    const outcome = await visionFoodService.recognize("BASE64PHOTO");

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.results[0].confidence).toBe(1);
  });

  it("never leaks a demo dish through any failure mode", async () => {
    for (const response of FAILURES) {
      mockInvoke.mockReset();
      mockInvoke.mockResolvedValue(response);
      const outcome = await visionFoodService.recognize("BASE64PHOTO");
      expect(outcome.ok).toBe(false);
      const leaked = JSON.stringify(outcome);
      for (const dish of MOCK_DISHES) expect(leaked).not.toContain(dish);
    }
  });
});

describe("nlpMealService.parse with a configured backend", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it("reports failure instead of estimating the meal on-device", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error("upstream_failed") });

    const outcome = await nlpMealService.parse("兩隻烚蛋同多士");

    expect(outcome).toEqual({ ok: false, error: "unavailable" });
    expect(outcome).not.toHaveProperty("meals");
  });

  it("reports failure when the request throws", async () => {
    mockInvoke.mockRejectedValue(new Error("Network request failed"));

    const outcome = await nlpMealService.parse("two boiled eggs and toast");

    expect(outcome).toEqual({ ok: false, error: "unavailable" });
  });

  it("reports failure on a malformed payload rather than guessing", async () => {
    mockInvoke.mockResolvedValue({ data: { oops: true }, error: null });

    const outcome = await nlpMealService.parse("two boiled eggs and toast");

    expect(outcome).toEqual({ ok: false, error: "unavailable" });
  });

  it("keeps an empty estimate empty", async () => {
    // The specific line that used to be wrong: `if (remote && remote.length > 0)` sent a genuine
    // "I could not work out what that was" to the on-device guesser, which always answers.
    mockInvoke.mockResolvedValue({ data: { meals: [] }, error: null });

    const outcome = await nlpMealService.parse("asdfghjkl");

    expect(outcome).toEqual({ ok: true, meals: [] });
  });

  it("returns the estimate on success", async () => {
    mockInvoke.mockResolvedValue({
      data: {
        meals: [
          {
            name: "Wonton noodles",
            nameZh: "雲吞麵",
            calories: 420,
            protein: 22,
            carbs: 58,
            fat: 10,
            quantity: 1,
            unit: "1 bowl",
            mealType: "lunch",
          },
        ],
      },
      error: null,
    });

    const outcome = await nlpMealService.parse("一碗雲吞麵");

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.meals).toHaveLength(1);
    expect(outcome.meals[0]).toMatchObject({ name: "Wonton noodles", calories: 420, unit: "1 bowl" });
  });

  it("short-circuits empty input without calling the proxy", async () => {
    const outcome = await nlpMealService.parse("   ");

    expect(outcome).toEqual({ ok: true, meals: [] });
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
