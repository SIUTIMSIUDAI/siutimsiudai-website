// Regression guard for the silent-fabrication bug, in its most expensive form.
//
// "Suggest a recipe" used to fall back to buildGenericRecipe whenever the live generation failed.
// That template is not a recipe the AI wrote: it slots the pantry list into four fixed wok steps and
// names the dish after the first two ingredients. Three things made shipping it on failure worse
// than an error message:
//
//   1. It is a paid Pro/Max perk, so the fallback billed a promise of AI output no model produced.
//   2. The pantry screen SAVES the result into the recipe box, so the fake outlived the moment and
//      sat there afterwards looking like a genuine suggestion.
//   3. Nothing on screen admitted the generation had failed, so there was nothing to retry.
//
// The rule this file enforces: if the backend is CONFIGURED, the live path is the only path, and a
// failure is reported as a failure. The template survives only for the no-backend demo case, which
// pantryScan.test.ts covers.

const mockInvoke = jest.fn();

jest.mock("@/services/supabase", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } },
  isSupabaseConfigured: true,
}));

import { recipeGenerationService } from "@/services/recipeGenerationService";
import type { RecipeSeedIngredient } from "@/services/recipeGenerationService";

/** A FunctionsHttpError as supabase-js builds it: the raw Response hangs off `context`. */
function httpError(status: number, body: unknown): unknown {
  return { context: new Response(JSON.stringify(body), { status }) };
}

const PANTRY: RecipeSeedIngredient[] = [
  { name: "Pork belly", nameZh: "五花腩", quantity: 300, unit: "g" },
  { name: "Choy sum", nameZh: "菜心", quantity: 1, unit: "piece" },
  { name: "Soy sauce", nameZh: "豉油", quantity: 30, unit: "ml" },
];

// Phrases only the local template produces. If any of these reach a caller from a failed live
// generation, the bug is back.
const TEMPLATE_TELLS = [
  "Stir-Fry",
  "小炒",
  "Heat a little oil in a wok",
  "兜炒",
  "Rinse and prep",
  "Pantry Stir-Fry",
];

/** A well-formed answer, so the success assertions test the parser and not a typo. */
const LIVE_RECIPE = {
  recipe: {
    title: "Steamed pork with choy sum",
    titleZh: "菜心蒸肉餅",
    servings: 2,
    totalMinutes: 25,
    ingredients: [
      { name: "Pork belly", nameZh: "五花腩", quantity: 300, unit: "g" },
      { name: "Choy sum", nameZh: "菜心", quantity: 1, unit: "piece" },
    ],
    steps: [
      { instruction: "Mince the pork and season it.", instructionZh: "剁碎豬肉調味。" },
      { instruction: "Steam for 12 minutes.", instructionZh: "蒸 12 分鐘。", durationSeconds: 720 },
    ],
  },
};

describe("recipeGenerationService.generate with a configured backend", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it("reports failure, and writes no recipe, when the proxy returns an error", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error("upstream_failed") });

    const outcome = await recipeGenerationService.generate(PANTRY);

    expect(outcome).toEqual({ ok: false, error: "unavailable" });
    // The bug in one assertion: no invented recipe rides along with the failure, so the pantry
    // screen has nothing it could save.
    expect(outcome).not.toHaveProperty("recipe");
  });

  it("reports failure when the request throws (offline, DNS, timeout)", async () => {
    mockInvoke.mockRejectedValue(new Error("Network request failed"));

    const outcome = await recipeGenerationService.generate(PANTRY);

    expect(outcome).toEqual({ ok: false, error: "unavailable" });
  });

  it("reports failure when the payload is not a recipe, rather than inventing one", async () => {
    mockInvoke.mockResolvedValue({ data: { oops: true }, error: null });

    const outcome = await recipeGenerationService.generate(PANTRY);

    expect(outcome).toEqual({ ok: false, error: "unavailable" });
  });

  it("reports failure when the model answers with a recipe that has no steps", async () => {
    // Half a recipe is not a recipe. Saving it would put an uncookable entry in the recipe box.
    mockInvoke.mockResolvedValue({
      data: { recipe: { ...LIVE_RECIPE.recipe, steps: [] } },
      error: null,
    });

    const outcome = await recipeGenerationService.generate(PANTRY);

    expect(outcome).toEqual({ ok: false, error: "unavailable" });
  });

  it("distinguishes the daily cap from an outage, so the banner can say which", async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: httpError(429, { error: "rate_limited", used: 51, limit: 50, retryAfter: 3600 }),
    });

    const outcome = await recipeGenerationService.generate(PANTRY);

    // "You've used today's suggestions" is a different sentence, and a different user action, from
    // "check your connection and try again".
    expect(outcome).toEqual({ ok: false, error: "rate_limited" });
  });

  it("reports a 503 from the failing quota counter as an outage, not the cap", async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: httpError(503, { error: "quota_unavailable" }),
    });

    const outcome = await recipeGenerationService.generate(PANTRY);

    expect(outcome).toEqual({ ok: false, error: "unavailable" });
  });

  it("returns exactly what the model wrote on success, with no template mixed in", async () => {
    mockInvoke.mockResolvedValue({ data: LIVE_RECIPE, error: null });

    const outcome = await recipeGenerationService.generate(PANTRY);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.recipe.title).toBe("Steamed pork with choy sum");
    expect(outcome.recipe.titleZh).toBe("菜心蒸肉餅");
    expect(outcome.recipe.steps).toHaveLength(2);
    expect(outcome.recipe.steps[1].durationSeconds).toBe(720);
    // The pantry had three items and the model chose two. The old fallback would have cooked all
    // three, in its own steps.
    expect(outcome.recipe.ingredients).toHaveLength(2);
  });

  it("sends the pantry and nothing else — no nutrition targets, no profile", async () => {
    // The product constraint: this dish is "use up what you have", never tailored to the user's
    // calorie or macro goals, so those must not leave the device on this call.
    mockInvoke.mockResolvedValue({ data: LIVE_RECIPE, error: null });

    await recipeGenerationService.generate(PANTRY);

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const [fnName, options] = mockInvoke.mock.calls[0] as [string, { body: unknown }];
    expect(fnName).toBe("generate-recipe");
    expect(options.body).toEqual({
      ingredients: [
        { name: "Pork belly", nameZh: "五花腩", quantity: 300, unit: "g" },
        { name: "Choy sum", nameZh: "菜心", quantity: 1, unit: "piece" },
        { name: "Soy sauce", nameZh: "豉油", quantity: 30, unit: "ml" },
      ],
    });
  });

  it("never leaks the local template through any failure mode", async () => {
    const failures = [
      { data: null, error: new Error("boom") },
      { data: { oops: true }, error: null },
      { data: undefined, error: null },
      { data: null, error: httpError(429, { error: "rate_limited" }) },
      { data: { recipe: { title: "", titleZh: "", ingredients: [], steps: [] } }, error: null },
    ];

    for (const response of failures) {
      mockInvoke.mockResolvedValue(response);
      const outcome = await recipeGenerationService.generate(PANTRY);
      expect(outcome.ok).toBe(false);
      const leaked = JSON.stringify(outcome);
      for (const tell of TEMPLATE_TELLS) expect(leaked).not.toContain(tell);
    }
  });
});
