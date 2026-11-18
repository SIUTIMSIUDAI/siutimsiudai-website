// The generate-recipe function runs in Deno and calls Deno.serve at module scope, so it cannot be
// imported here. The suggestion mode's request and response handling lives in a pure module beside it,
// which can.
import { avoidTitles, pickRecipes, suggestCount } from "../supabase/functions/generate-recipe/suggest";

const dish = (title: string, titleZh: string) => ({ title, titleZh, ingredients: [], steps: [] });

describe("suggestCount", () => {
  it("leaves a request without a count on the one-recipe path older apps use", () => {
    expect(suggestCount(undefined)).toBeNull();
    expect(suggestCount("3")).toBeNull();
    expect(suggestCount(Number.NaN)).toBeNull();
  });

  it("asks for at most three dishes and at least one", () => {
    expect(suggestCount(3)).toBe(3);
    expect(suggestCount(2)).toBe(2);
    expect(suggestCount(10)).toBe(3);
    expect(suggestCount(0)).toBe(1);
  });
});

describe("avoidTitles", () => {
  it("keeps the dishes already shown, trimmed, skipping anything that isn't a name", () => {
    expect(avoidTitles(["  Tomato egg stir-fry ", "", 42, null, "番茄炒蛋"])).toEqual([
      "Tomato egg stir-fry",
      "番茄炒蛋",
    ]);
  });

  it("caps how much of the prompt the list can take", () => {
    const many = Array.from({ length: 20 }, (_, i) => `Dish ${i + 1}`);
    expect(avoidTitles(many)).toHaveLength(12);
    expect(avoidTitles(["x".repeat(200)])).toEqual(["x".repeat(80)]);
  });

  it("treats anything other than a list as nothing to avoid", () => {
    expect(avoidTitles(undefined)).toEqual([]);
    expect(avoidTitles("Tomato egg stir-fry")).toEqual([]);
  });
});

describe("pickRecipes", () => {
  it("returns the model's dishes, at most the number asked for", () => {
    const parsed = {
      recipes: [dish("A", "甲"), dish("B", "乙"), dish("C", "丙"), dish("D", "丁")],
    };
    expect(pickRecipes(parsed, 3)).toEqual([dish("A", "甲"), dish("B", "乙"), dish("C", "丙")]);
  });

  it("drops a repeat of a dish already in the list, by either title", () => {
    const parsed = {
      recipes: [
        dish("Tomato egg stir-fry", "番茄炒蛋"),
        dish("tomato egg stir-fry ", "番茄炒滑蛋"),
        dish("Scrambled eggs with tomato", "番茄炒蛋"),
        dish("Steamed egg", "蒸水蛋"),
      ],
    };
    expect(pickRecipes(parsed, 3)).toEqual([
      dish("Tomato egg stir-fry", "番茄炒蛋"),
      dish("Steamed egg", "蒸水蛋"),
    ]);
  });

  it("skips entries that aren't recipe objects", () => {
    expect(pickRecipes({ recipes: [null, "soup", dish("A", "甲")] }, 3)).toEqual([dish("A", "甲")]);
  });

  it("passes on an empty list, which means the pantry can't make a dish", () => {
    expect(pickRecipes({ recipes: [] }, 3)).toEqual([]);
  });

  it("rejects an answer that isn't a list of dishes at all", () => {
    expect(pickRecipes({ recipe: dish("A", "甲") }, 3)).toBeNull();
    expect(pickRecipes(null, 3)).toBeNull();
    expect(pickRecipes([dish("A", "甲")], 3)).toBeNull();
  });
});
