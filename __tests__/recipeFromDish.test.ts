const mockInvoke = jest.fn();

jest.mock("@/services/supabase", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } },
  isSupabaseConfigured: true,
}));

import { recipeGenerationService } from "@/services/recipeGenerationService";

function httpError(status: number, body: unknown): unknown {
  return { context: new Response(JSON.stringify(body), { status }) };
}

const DISH = { name: "Tomato scrambled eggs", nameZh: "蕃茄炒蛋" };

const LIVE = {
  recipe: {
    title: "Tomato scrambled eggs",
    titleZh: "蕃茄炒蛋",
    servings: 2,
    totalMinutes: 15,
    ingredients: [
      { name: "Egg", nameZh: "雞蛋", quantity: 3, unit: "piece" },
      { name: "Tomato", nameZh: "蕃茄", quantity: 2, unit: "piece" },
    ],
    steps: [
      { instruction: "Beat the eggs.", instructionZh: "打蛋。" },
      { instruction: "Stir-fry tomato then add egg.", instructionZh: "先炒蕃茄後加蛋。" },
    ],
  },
};

describe("recipeGenerationService.generateFromDish (configured backend)", () => {
  beforeEach(() => mockInvoke.mockReset());

  it("sends only { dish: { name, nameZh } } to generate-recipe", async () => {
    mockInvoke.mockResolvedValue({ data: LIVE, error: null });
    await recipeGenerationService.generateFromDish(DISH);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const [fnName, options] = mockInvoke.mock.calls[0] as [string, { body: unknown }];
    expect(fnName).toBe("generate-recipe");
    expect(options.body).toEqual({ dish: { name: "Tomato scrambled eggs", nameZh: "蕃茄炒蛋" } });
  });

  it("returns the parsed recipe on success", async () => {
    mockInvoke.mockResolvedValue({ data: LIVE, error: null });
    const outcome = await recipeGenerationService.generateFromDish(DISH);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.recipe.title).toBe("Tomato scrambled eggs");
    expect(outcome.recipe.steps).toHaveLength(2);
  });

  it("reports an outage as a failure, with no recipe attached", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error("boom") });
    const outcome = await recipeGenerationService.generateFromDish(DISH);
    expect(outcome).toEqual({ ok: false, error: "unavailable" });
    expect(outcome).not.toHaveProperty("recipe");
  });

  it("distinguishes the daily cap from an outage", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: httpError(429, { error: "rate_limited" }) });
    const outcome = await recipeGenerationService.generateFromDish(DISH);
    expect(outcome).toEqual({ ok: false, error: "rate_limited" });
  });

  it("reports failure when the payload is not a recipe, rather than inventing one", async () => {
    mockInvoke.mockResolvedValue({ data: { oops: true }, error: null });
    const outcome = await recipeGenerationService.generateFromDish(DISH);
    expect(outcome).toEqual({ ok: false, error: "unavailable" });
  });
});

describe("buildDishRecipe (pure demo stand-in)", () => {
  it("names the recipe after the dish and returns a valid shape", () => {
    // Imported lazily so the module mock above does not matter here.
    const { buildDishRecipe } = require("@/services/recipeGenerationService");
    const r = buildDishRecipe(DISH);
    expect(r.title).toContain("Tomato scrambled eggs");
    expect(r.titleZh).toContain("蕃茄炒蛋");
    expect(r.ingredients.length).toBeGreaterThan(0);
    expect(r.steps.length).toBeGreaterThan(0);
  });
});
