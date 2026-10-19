import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { Recipe, RecipeNutrition } from "@/types";
import { useRecipeStore } from "@/stores/recipeStore";
import { nutritionBasis } from "@/utils/recipeNutrition";

// The hook decides when the estimator is called, which costs real money per call (Gemini) and counts
// against each person's 50-a-day AI allowance. So: once per dish and ingredient list, shared between
// screens, never again after a failure unless asked, and never saving numbers for a list that
// changed while the estimator was thinking. Only the estimator is faked; the store is real.
jest.mock("@/services/recipeNutritionService", () => ({ estimateRecipeNutrition: jest.fn() }));

import { estimateRecipeNutrition } from "@/services/recipeNutritionService";
import { useRecipeNutrition } from "@/hooks/useRecipeNutrition";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const estimate = estimateRecipeNutrition as jest.Mock;
type Outcome = { ok: true; nutrition: RecipeNutrition } | { ok: false };

// Every call hands back a promise the test settles by hand, in order.
let pending: Array<(o: Outcome) => void> = [];
beforeEach(() => {
  pending = [];
  estimate.mockReset();
  estimate.mockImplementation(() => new Promise<Outcome>((resolve) => pending.push(resolve)));
});

const recipe = (id: string, chicken = 786): Recipe => ({
  id,
  userId: "u",
  title: "Soy Sauce Braised Chicken",
  titleZh: "豉油雞",
  servings: 4,
  sourceType: "manual",
  sourceUrl: null,
  imageUri: null,
  totalMinutes: 45,
  ingredients: [
    { id: "i1", recipeId: id, name: "Chicken", nameZh: "雞肉", quantity: chicken, unit: "g", displayUnit: "g", rawText: "雞", substitutedFrom: null },
  ],
  steps: [],
  createdAt: "2026-10-01T00:00:00.000Z",
});

const nutritionFor = (r: Recipe): RecipeNutrition => ({
  perServing: { calories: 420, protein: 38, carbs: 9, fat: 25, fiber: 0.5 },
  micros: null,
  basis: nutritionBasis(r),
  estimatedAt: "2026-10-19T08:00:00.000Z",
});

type Result = ReturnType<typeof useRecipeNutrition>;

// Reads the recipe from the store, as the recipe screen does, so a saved estimate re-renders it.
function Probe({ id, out }: { id: string; out: { current: Result | null } }) {
  const r = useRecipeStore((s) => s.recipes.find((x) => x.id === id))!;
  out.current = useRecipeNutrition(r);
  return null;
}

// Every screen a test opens is closed after it, so one test's store changes never re-render the last.
let mounted: ReactTestRenderer[] = [];
afterEach(async () => {
  await act(async () => mounted.forEach((t) => t.unmount()));
  mounted = [];
});

async function mount(id: string) {
  const out: { current: Result | null } = { current: null };
  await act(async () => {
    mounted.push(create(React.createElement(Probe, { id, out })));
  });
  return { out };
}

async function settle(i: number, o: Outcome) {
  await act(async () => {
    pending[i](o);
    await Promise.resolve();
  });
}

const stored = (id: string) => useRecipeStore.getState().recipes.find((r) => r.id === id)!;

describe("useRecipeNutrition", () => {
  it("shows a saved estimate for the same ingredients straight away, with no call", async () => {
    const r = { ...recipe("r-ready"), nutrition: nutritionFor(recipe("r-ready")) };
    useRecipeStore.setState({ recipes: [r], seeded: true });
    const { out } = await mount("r-ready");
    expect(out.current?.status).toBe("ready");
    expect(out.current?.nutrition).toEqual(r.nutrition);
    expect(estimate).not.toHaveBeenCalled();
  });

  it("estimates a dish once, saves it on the recipe, then shows it", async () => {
    useRecipeStore.setState({ recipes: [recipe("r-new")], seeded: true });
    const { out } = await mount("r-new");
    expect(out.current?.status).toBe("estimating");
    expect(estimate).toHaveBeenCalledTimes(1);

    await settle(0, { ok: true, nutrition: nutritionFor(recipe("r-new")) });

    expect(out.current?.status).toBe("ready");
    expect(stored("r-new").nutrition).toEqual(nutritionFor(recipe("r-new")));
    expect(estimate).toHaveBeenCalledTimes(1);
  });

  it("says it failed, and only asks again when the cook taps retry", async () => {
    useRecipeStore.setState({ recipes: [recipe("r-fail")], seeded: true });
    const { out } = await mount("r-fail");
    await settle(0, { ok: false });
    expect(out.current?.status).toBe("failed");
    expect(out.current?.nutrition).toBeNull();
    expect(estimate).toHaveBeenCalledTimes(1);

    await act(async () => out.current?.retry());
    expect(out.current?.status).toBe("estimating");
    expect(estimate).toHaveBeenCalledTimes(2);

    await settle(1, { ok: true, nutrition: nutritionFor(recipe("r-fail")) });
    expect(out.current?.status).toBe("ready");
  });

  it("shares one estimate between two screens showing the same dish", async () => {
    useRecipeStore.setState({ recipes: [recipe("r-twice")], seeded: true });
    const a = await mount("r-twice");
    const b = await mount("r-twice");
    expect(estimate).toHaveBeenCalledTimes(1);

    await settle(0, { ok: false });
    // A failure reaches every screen that was waiting on it, so none spins forever.
    expect(a.out.current?.status).toBe("failed");
    expect(b.out.current?.status).toBe("failed");
  });

  it("drops an answer for an ingredient list that changed while it ran, and estimates the new one", async () => {
    useRecipeStore.setState({ recipes: [recipe("r-swap")], seeded: true });
    const { out } = await mount("r-swap");
    await act(async () => {
      useRecipeStore.setState({ recipes: [recipe("r-swap", 500)], seeded: true });
    });
    expect(estimate).toHaveBeenCalledTimes(2);

    await settle(0, { ok: true, nutrition: nutritionFor(recipe("r-swap")) });
    expect(stored("r-swap").nutrition).toBeUndefined();
    expect(out.current?.status).toBe("estimating");

    await settle(1, { ok: true, nutrition: nutritionFor(recipe("r-swap", 500)) });
    expect(out.current?.status).toBe("ready");
    expect(stored("r-swap").nutrition?.basis).toBe(nutritionBasis(recipe("r-swap", 500)));
  });
});
