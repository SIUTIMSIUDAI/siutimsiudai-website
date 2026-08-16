// Guard for the bug where a failed translation was cached as though it had succeeded.
//
// A URL-imported recipe is scraped in English and its Chinese fields are filled in lazily, once,
// by translateRecipeToZh. The old code marked the recipe zhTranslated whatever came back — and
// what came back on a failure was the on-device mock, which returns English sentences with a few
// Chinese ingredient nouns swapped in ("Add 豉油 and 蒜頭"). Because useRecipeAutoTranslate only
// revisits recipes NOT marked translated, that half-English text became the recipe's permanent
// Traditional Chinese, with no retry and nothing on screen admitting the translation never ran.
//
// The rule enforced here: WRITE NOTHING UNLESS IT SUCCEEDED. A recipe left untouched still shows
// its English text, which is at least true, and stays in the pending set so a later attempt works.

import type { Recipe } from "@/types";
import { useRecipeStore } from "@/stores/recipeStore";
import { translationService } from "@/services/translationService";

jest.mock("@/services/translationService", () => ({
  translationService: { translateBatch: jest.fn() },
}));

const translateBatch = translationService.translateBatch as jest.Mock;

/** A scraped recipe as urlScrapeService leaves it: Chinese fields seeded with the English text. */
function urlRecipe(id: string): Recipe {
  return {
    id,
    userId: "guest",
    title: "Soy sauce chicken",
    titleZh: "Soy sauce chicken",
    servings: 2,
    sourceType: "url",
    sourceUrl: "https://example.com/recipe",
    imageUri: null,
    totalMinutes: 30,
    createdAt: new Date().toISOString(),
    ingredients: [
      {
        id: "ri_1",
        recipeId: id,
        name: "Soy sauce",
        nameZh: "Soy sauce",
        quantity: 30,
        unit: "ml",
        displayUnit: "ml",
        rawText: "30ml soy sauce",
        substitutedFrom: null,
      },
    ],
    steps: [
      {
        id: "rs_1",
        recipeId: id,
        stepNumber: 1,
        instruction: "Add soy sauce and garlic",
        instructionZh: "Add soy sauce and garlic",
        imageUri: null,
        durationSeconds: null,
      },
    ],
  };
}

beforeEach(() => {
  translateBatch.mockReset();
});

describe("translateRecipeToZh — a failure must not be cached", () => {
  it("writes nothing and leaves the recipe retryable when the service is unavailable", async () => {
    const recipe = urlRecipe("r_unavailable");
    useRecipeStore.setState({ recipes: [recipe], seeded: true });
    translateBatch.mockResolvedValue({ ok: false, error: "unavailable" });

    await useRecipeStore.getState().translateRecipeToZh(recipe.id);

    const after = useRecipeStore.getState().recipes[0];
    // Not marked done, so useRecipeAutoTranslate will pick it up again.
    expect(after.zhTranslated).toBeFalsy();
    // And no invented Chinese anywhere: every Chinese field still holds the English it was
    // scraped with, rather than the mock's "Add 豉油 and 蒜頭".
    expect(after.titleZh).toBe("Soy sauce chicken");
    expect(after.ingredients[0].nameZh).toBe("Soy sauce");
    expect(after.steps[0].instructionZh).toBe("Add soy sauce and garlic");
  });

  it("stops retrying a recipe once the daily cap refuses it", async () => {
    const recipe = urlRecipe("r_capped");
    useRecipeStore.setState({ recipes: [recipe], seeded: true });
    translateBatch.mockResolvedValue({ ok: false, error: "rate_limited" });

    await useRecipeStore.getState().translateRecipeToZh(recipe.id);
    await useRecipeStore.getState().translateRecipeToZh(recipe.id);
    await useRecipeStore.getState().translateRecipeToZh(recipe.id);

    // Retrying before midnight cannot succeed, and each attempt would spend another unit of the
    // very allowance that is already exhausted.
    expect(translateBatch).toHaveBeenCalledTimes(1);
    expect(useRecipeStore.getState().recipes[0].zhTranslated).toBeFalsy();
  });

  it("keeps retrying after a plain outage, which may well be transient", async () => {
    const recipe = urlRecipe("r_transient");
    useRecipeStore.setState({ recipes: [recipe], seeded: true });
    translateBatch.mockResolvedValue({ ok: false, error: "unavailable" });

    await useRecipeStore.getState().translateRecipeToZh(recipe.id);
    await useRecipeStore.getState().translateRecipeToZh(recipe.id);

    expect(translateBatch).toHaveBeenCalledTimes(2);
  });
});

describe("translateRecipeToZh — a success is still cached exactly once", () => {
  it("applies the batch positionally and marks the recipe translated", async () => {
    const recipe = urlRecipe("r_ok");
    useRecipeStore.setState({ recipes: [recipe], seeded: true });
    // Order is title -> ingredients -> steps, and the store slices it back in that same order.
    translateBatch.mockResolvedValue({
      ok: true,
      translations: ["豉油雞", "豉油", "加入豉油同蒜頭"],
    });

    await useRecipeStore.getState().translateRecipeToZh(recipe.id);

    const after = useRecipeStore.getState().recipes[0];
    expect(after.titleZh).toBe("豉油雞");
    expect(after.ingredients[0].nameZh).toBe("豉油");
    expect(after.steps[0].instructionZh).toBe("加入豉油同蒜頭");
    expect(after.zhTranslated).toBe(true);
  });

  it("does not translate the same recipe twice", async () => {
    const recipe = urlRecipe("r_once");
    useRecipeStore.setState({ recipes: [recipe], seeded: true });
    translateBatch.mockResolvedValue({ ok: true, translations: ["標題", "材料", "步驟"] });

    await useRecipeStore.getState().translateRecipeToZh(recipe.id);
    await useRecipeStore.getState().translateRecipeToZh(recipe.id);

    expect(translateBatch).toHaveBeenCalledTimes(1);
  });

  it("leaves a non-URL recipe alone, since those are authored bilingually at capture", async () => {
    const recipe = { ...urlRecipe("r_manual"), sourceType: "manual" as const };
    useRecipeStore.setState({ recipes: [recipe], seeded: true });

    await useRecipeStore.getState().translateRecipeToZh(recipe.id);

    expect(translateBatch).not.toHaveBeenCalled();
  });
});
