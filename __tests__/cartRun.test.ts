import { useCartRunStore } from "@/stores/cartRunStore";

// A shopping run is interrupted by definition: you tap HKTVmall, leave the app, buy three things,
// and come back. These tests cover what has to survive that round trip, and one trap that would
// have made the whole feature look haunted in the field while passing any UI smoke test.
//
// The trap: missingItemsFromRecipe re-runs the grocery merge on every call, and the merge mints a
// fresh genId() for every row. So GroceryListItem.id changes on ANY recompute — a pantry edit, a
// re-render after returning from the store. Ticks keyed by id would look perfect in a single
// sitting and silently vanish the moment anything upstream moved. Hence canonical names as keys.

const RECIPE = "r-soy-chicken";
const OTHER = "r-congee";
const LIST = ["Chicken", "Dark soy sauce", "Ginger", "Shaoxing wine"];

const state = () => useCartRunStore.getState();

beforeEach(() => {
  useCartRunStore.setState({ runs: {} });
});

describe("starting and switching a run", () => {
  it("records the store you picked", () => {
    state().startRun(RECIPE, "hktvmall");
    expect(state().runs[RECIPE]).toEqual({ retailer: "hktvmall", checkedKeys: [] });
  });

  it("keeps your ticks when you change store, because you still bought the ginger", () => {
    state().startRun(RECIPE, "hktvmall");
    state().toggleItem(RECIPE, "Ginger");
    state().startRun(RECIPE, "wellcome");

    expect(state().runs[RECIPE].retailer).toBe("wellcome");
    expect(state().isChecked(RECIPE, "Ginger")).toBe(true);
  });

  it("keeps runs for different recipes apart", () => {
    state().startRun(RECIPE, "hktvmall");
    state().startRun(OTHER, "wellcome");
    state().toggleItem(RECIPE, "Ginger");

    expect(state().isChecked(OTHER, "Ginger")).toBe(false);
    expect(state().runs[OTHER].retailer).toBe("wellcome");
  });
});

describe("ticking items off", () => {
  beforeEach(() => state().startRun(RECIPE, "hktvmall"));

  it("ticks and unticks, because people mis-tap in a supermarket aisle", () => {
    state().toggleItem(RECIPE, "Ginger");
    expect(state().isChecked(RECIPE, "Ginger")).toBe(true);
    state().toggleItem(RECIPE, "Ginger");
    expect(state().isChecked(RECIPE, "Ginger")).toBe(false);
  });

  it("treats the English and Chinese names of one ingredient as the same tick", () => {
    // The checklist renders in the STORE's language, so the same row can be read as 薑 at Wellcome
    // and Ginger at HKTVmall. One basket, one tick.
    state().toggleItem(RECIPE, "薑");
    expect(state().isChecked(RECIPE, "Ginger")).toBe(true);
  });

  it("folds a dictionary alias onto the same tick", () => {
    state().toggleItem(RECIPE, "chicken thigh");
    expect(state().isChecked(RECIPE, "Chicken")).toBe(true);
  });

  it("ignores a tick for a recipe with no run, rather than inventing one", () => {
    state().toggleItem(OTHER, "Ginger");
    expect(state().runs[OTHER]).toBeUndefined();
  });

  it("survives the ids being regenerated underneath it", () => {
    // Simulates the real hazard: the list is recomputed and every row gets a brand new id. Nothing
    // here is keyed by id, so the tick is untouched.
    state().toggleItem(RECIPE, "Ginger");
    const recomputed = LIST.map((name, i) => ({ id: `fresh-${Date.now()}-${i}`, name }));
    expect(state().isChecked(RECIPE, recomputed[2].name)).toBe(true);
  });
});

describe("the progress counter", () => {
  beforeEach(() => state().startRun(RECIPE, "hktvmall"));

  it("counts only ticks that are on the list in front of you", () => {
    state().toggleItem(RECIPE, "Ginger");
    state().toggleItem(RECIPE, "Chicken");
    expect(state().checkedCount(RECIPE, LIST)).toBe(2);
  });

  it("counts a duplicated row once, so 2 of 4 never reads 3 of 4", () => {
    // Two labels that canonicalise to the same key must not double-count.
    state().toggleItem(RECIPE, "Ginger");
    expect(state().checkedCount(RECIPE, ["Ginger", "薑", "Chicken"])).toBe(1);
  });

  it("is zero for a recipe with no run", () => {
    expect(state().checkedCount(OTHER, LIST)).toBe(0);
  });
});

describe("reconcile — yesterday's ticks must not inflate today's list", () => {
  beforeEach(() => state().startRun(RECIPE, "hktvmall"));

  it("drops a tick for an ingredient the pantry now covers", () => {
    state().toggleItem(RECIPE, "Ginger");
    state().toggleItem(RECIPE, "Chicken");

    // The fridge gained ginger overnight, so it is no longer missing.
    state().reconcile(RECIPE, ["Chicken", "Dark soy sauce", "Shaoxing wine"]);

    expect(state().isChecked(RECIPE, "Ginger")).toBe(false);
    expect(state().isChecked(RECIPE, "Chicken")).toBe(true);
    expect(state().checkedCount(RECIPE, LIST)).toBe(1);
  });

  it("leaves state untouched when nothing went stale, so opening the sheet does not churn", () => {
    state().toggleItem(RECIPE, "Ginger");
    const before = state().runs;
    state().reconcile(RECIPE, LIST);
    // Same object identity: no write to AsyncStorage, no re-render for every subscriber.
    expect(state().runs).toBe(before);
  });

  it("does nothing for a recipe with no run", () => {
    expect(() => state().reconcile(OTHER, LIST)).not.toThrow();
    expect(state().runs[OTHER]).toBeUndefined();
  });
});

describe("finishing", () => {
  it("forgets the run so the next visit starts clean", () => {
    state().startRun(RECIPE, "hktvmall");
    state().toggleItem(RECIPE, "Ginger");
    state().clearRun(RECIPE);

    expect(state().runs[RECIPE]).toBeUndefined();
    expect(state().isChecked(RECIPE, "Ginger")).toBe(false);
  });

  it("leaves other recipes' runs alone", () => {
    state().startRun(RECIPE, "hktvmall");
    state().startRun(OTHER, "wellcome");
    state().clearRun(RECIPE);

    expect(state().runs[OTHER]).toBeDefined();
  });

  it("is a no-op for a recipe that was never started", () => {
    const before = state().runs;
    state().clearRun(OTHER);
    expect(state().runs).toBe(before);
  });
});
