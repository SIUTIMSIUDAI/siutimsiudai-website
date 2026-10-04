// "Suggest recipes" asks for up to three dishes in one call. Same honesty rule as
// recipeGenerationFallback.test.ts: with a configured backend, only what the model wrote comes back,
// and a failure is reported as a failure, never papered over with the local template.

const mockInvoke = jest.fn();

jest.mock("@/services/supabase", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } },
  isSupabaseConfigured: true,
}));

import { buildSuggestedRecipes, recipeGenerationService } from "@/services/recipeGenerationService";
import type { RecipeSeedIngredient } from "@/services/recipeGenerationService";

function httpError(status: number, body: unknown): unknown {
  return { context: new Response(JSON.stringify(body), { status }) };
}

const PANTRY: RecipeSeedIngredient[] = [
  { name: "Egg", nameZh: "雞蛋", quantity: 6, unit: "piece" },
  { name: "Tomato", nameZh: "番茄", quantity: 3, unit: "piece" },
];

function dish(title: string, titleZh: string) {
  return {
    title,
    titleZh,
    servings: 2,
    totalMinutes: 15,
    ingredients: [{ name: "Egg", nameZh: "雞蛋", quantity: 2, unit: "piece" }],
    steps: [{ instruction: "Cook it.", instructionZh: "煮熟佢。" }],
  };
}

describe("recipeGenerationService.suggest with a configured backend", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it("asks for three dishes from the pantry and sends nothing else", async () => {
    mockInvoke.mockResolvedValue({ data: { recipes: [] }, error: null });

    await recipeGenerationService.suggest(PANTRY);

    const [fnName, options] = mockInvoke.mock.calls[0] as [string, { body: unknown }];
    expect(fnName).toBe("generate-recipe");
    expect(options.body).toEqual({
      ingredients: [
        { name: "Egg", nameZh: "雞蛋", quantity: 6, unit: "piece" },
        { name: "Tomato", nameZh: "番茄", quantity: 3, unit: "piece" },
      ],
      count: 3,
    });
  });

  it("passes the dishes already shown when asking for more ideas", async () => {
    mockInvoke.mockResolvedValue({ data: { recipes: [] }, error: null });

    await recipeGenerationService.suggest(PANTRY, ["Tomato egg stir-fry", "Steamed egg"]);

    const [, options] = mockInvoke.mock.calls[0] as [string, { body: { avoid?: unknown } }];
    expect(options.body.avoid).toEqual(["Tomato egg stir-fry", "Steamed egg"]);
  });

  it("returns every dish the model wrote, at most three", async () => {
    mockInvoke.mockResolvedValue({
      data: {
        recipes: [
          dish("Tomato egg stir-fry", "番茄炒蛋"),
          dish("Steamed egg", "蒸水蛋"),
          dish("Tomato egg drop soup", "番茄蛋花湯"),
          dish("Fried egg", "煎蛋"),
        ],
      },
      error: null,
    });

    const outcome = await recipeGenerationService.suggest(PANTRY);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.recipes.map((r) => r.titleZh)).toEqual(["番茄炒蛋", "蒸水蛋", "番茄蛋花湯"]);
  });

  it("drops a dish that isn't a usable recipe and keeps the rest", async () => {
    mockInvoke.mockResolvedValue({
      data: { recipes: [dish("Steamed egg", "蒸水蛋"), { ...dish("Half a recipe", "半個食譜"), steps: [] }] },
      error: null,
    });

    const outcome = await recipeGenerationService.suggest(PANTRY);

    expect(outcome).toEqual({ ok: true, recipes: [expect.objectContaining({ title: "Steamed egg" })] });
  });

  it("reports that nothing can be cooked when the model returns no dishes", async () => {
    mockInvoke.mockResolvedValue({ data: { recipes: [] }, error: null });

    expect(await recipeGenerationService.suggest(PANTRY)).toEqual({ ok: true, recipes: [] });
  });

  it("still works against a server that only knows the one-recipe answer", async () => {
    mockInvoke.mockResolvedValue({ data: { recipe: dish("Steamed egg", "蒸水蛋") }, error: null });

    const outcome = await recipeGenerationService.suggest(PANTRY);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.recipes.map((r) => r.title)).toEqual(["Steamed egg"]);
  });

  it("reports failure when every dish is unusable or the answer isn't a list", async () => {
    for (const data of [
      { recipes: [{ ...dish("Broken", "壞咗"), ingredients: [] }] },
      { recipes: "three dishes" },
      { oops: true },
      null,
    ]) {
      mockInvoke.mockResolvedValue({ data, error: null });
      expect(await recipeGenerationService.suggest(PANTRY)).toEqual({ ok: false, error: "unavailable" });
    }
  });

  it("tells the daily cap apart from an outage", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: httpError(429, { error: "rate_limited" }) });
    expect(await recipeGenerationService.suggest(PANTRY)).toEqual({ ok: false, error: "rate_limited" });

    mockInvoke.mockRejectedValue(new Error("Network request failed"));
    expect(await recipeGenerationService.suggest(PANTRY)).toEqual({ ok: false, error: "unavailable" });
  });
});

// The no-backend demo stand-in (web preview, Expo Go without env). Reachable only when Supabase is
// unconfigured; the tests above prove it never answers for a configured backend.
describe("buildSuggestedRecipes", () => {
  const seed: RecipeSeedIngredient[] = [
    { name: "Egg", nameZh: "雞蛋", quantity: 10, unit: "piece" },
    { name: "Soy sauce", nameZh: "豉油", quantity: 0, unit: "ml" },
    { name: "Spring onion", nameZh: "葱", quantity: 3, unit: "piece" },
    { name: "Tomato", nameZh: "番茄", quantity: 4, unit: "piece" },
    { name: "Pork", nameZh: "豬肉", quantity: 300, unit: "g" },
  ];

  it("offers up to three different dishes, each named after real ingredients", () => {
    const recipes = buildSuggestedRecipes(seed);
    expect(recipes.map((r) => r.title)).toEqual([
      "Egg & Pork Stir-Fry",
      "Spring onion Stir-Fry",
      "Tomato Stir-Fry",
    ]);
  });

  it("only uses what the pantry has, seasoning every dish with it", () => {
    const names = new Set(seed.map((i) => i.name));
    for (const recipe of buildSuggestedRecipes(seed)) {
      for (const ing of recipe.ingredients) expect(names.has(ing.name)).toBe(true);
      expect(recipe.ingredients.map((ing) => ing.name)).toContain("Soy sauce");
    }
  });

  it("offers nothing for an empty pantry", () => {
    expect(buildSuggestedRecipes([])).toEqual([]);
  });
});
