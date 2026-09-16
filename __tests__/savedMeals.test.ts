import { useSavedMealsStore, type NewSavedMealInput } from "@/stores/savedMealsStore";

// A logged meal being pinned into "The usual". Fibre and macros ride along; micros are not part
// of a saved usual (the quick-add row logs macros only, matching QuickAddRow).
const BASE: NewSavedMealInput = {
  name: "Congee",
  nameZh: "粥",
  calories: 270,
  protein: 16,
  carbs: 40,
  fat: 5,
  fiber: 3,
};

describe("savedMealsStore.saveMeal dedupe", () => {
  beforeEach(() => {
    // seeded:true stops onRehydrate re-seeding; meals:[] gives each test a clean row.
    useSavedMealsStore.setState({ meals: [], seeded: true });
  });

  it("adds a new meal and reports 'added'", () => {
    const result = useSavedMealsStore.getState().saveMeal(BASE);
    expect(result).toBe("added");
    const meals = useSavedMealsStore.getState().meals;
    expect(meals).toHaveLength(1);
    expect(meals[0].name).toBe("Congee");
    expect(meals[0].defaultMealType).toBe("snack"); // default when none supplied
  });

  it("carries the supplied defaultMealType onto the saved meal", () => {
    useSavedMealsStore.getState().saveMeal({ ...BASE, defaultMealType: "lunch" });
    expect(useSavedMealsStore.getState().meals[0].defaultMealType).toBe("lunch");
  });

  it("does not add a second meal with the same name and reports 'duplicate'", () => {
    useSavedMealsStore.getState().saveMeal(BASE);
    const result = useSavedMealsStore.getState().saveMeal({ ...BASE, calories: 999 });
    expect(result).toBe("duplicate");
    const meals = useSavedMealsStore.getState().meals;
    expect(meals).toHaveLength(1);
    expect(meals[0].calories).toBe(270); // original preserved, never overwritten
  });

  it("treats names as duplicates case-insensitively and ignoring surrounding space", () => {
    useSavedMealsStore.getState().saveMeal(BASE);
    const result = useSavedMealsStore.getState().saveMeal({ ...BASE, name: "  congee  " });
    expect(result).toBe("duplicate");
    expect(useSavedMealsStore.getState().meals).toHaveLength(1);
  });

  it("lets a genuinely different meal through", () => {
    useSavedMealsStore.getState().saveMeal(BASE);
    const result = useSavedMealsStore
      .getState()
      .saveMeal({ ...BASE, name: "Wonton Noodles", nameZh: "雲吞麵" });
    expect(result).toBe("added");
    expect(useSavedMealsStore.getState().meals).toHaveLength(2);
  });
});

describe("savedMealsStore.isSaved", () => {
  beforeEach(() => {
    useSavedMealsStore.setState({ meals: [], seeded: true });
  });

  it("is false when nothing matches", () => {
    expect(useSavedMealsStore.getState().isSaved("Congee")).toBe(false);
  });

  it("is true after the meal is saved, case-insensitively and ignoring space", () => {
    useSavedMealsStore.getState().saveMeal(BASE);
    expect(useSavedMealsStore.getState().isSaved("  CONGEE ")).toBe(true);
  });
});

describe("savedMealsStore.updateMeal", () => {
  beforeEach(() => {
    useSavedMealsStore.setState({ meals: [], seeded: true });
  });

  it("edits the macros of an existing meal and reports 'updated'", () => {
    useSavedMealsStore.getState().saveMeal(BASE);
    const id = useSavedMealsStore.getState().meals[0].id;
    const result = useSavedMealsStore.getState().updateMeal(id, { calories: 300, protein: 20 });
    expect(result).toBe("updated");
    const meal = useSavedMealsStore.getState().meals[0];
    expect(meal.calories).toBe(300);
    expect(meal.protein).toBe(20);
    expect(meal.carbs).toBe(40); // untouched fields preserved
  });

  it("renames a meal when the new name does not collide", () => {
    useSavedMealsStore.getState().saveMeal(BASE);
    const id = useSavedMealsStore.getState().meals[0].id;
    const result = useSavedMealsStore
      .getState()
      .updateMeal(id, { name: "Fish Congee", nameZh: "魚片粥" });
    expect(result).toBe("updated");
    expect(useSavedMealsStore.getState().meals[0].name).toBe("Fish Congee");
  });

  it("rejects a rename that collides with another usual and reports 'duplicate'", () => {
    useSavedMealsStore.getState().saveMeal(BASE); // Congee
    useSavedMealsStore
      .getState()
      .saveMeal({ ...BASE, name: "Wonton Noodles", nameZh: "雲吞麵" });
    const wonton = useSavedMealsStore.getState().meals.find((m) => m.name === "Wonton Noodles")!;
    // Rename Wonton Noodles -> "  congee " should clash with the existing Congee, case/space-insensitively.
    const result = useSavedMealsStore.getState().updateMeal(wonton.id, { name: "  congee " });
    expect(result).toBe("duplicate");
    expect(useSavedMealsStore.getState().meals.find((m) => m.id === wonton.id)!.name).toBe(
      "Wonton Noodles",
    ); // original preserved, never overwritten
  });

  it("lets a meal keep its own name while editing macros (self is not a collision)", () => {
    useSavedMealsStore.getState().saveMeal(BASE);
    const id = useSavedMealsStore.getState().meals[0].id;
    const result = useSavedMealsStore.getState().updateMeal(id, { name: "Congee", fat: 9 });
    expect(result).toBe("updated");
    expect(useSavedMealsStore.getState().meals[0].fat).toBe(9);
  });

  it("preserves useCount and lastUsedAt across an edit", () => {
    useSavedMealsStore.getState().saveMeal(BASE);
    const id = useSavedMealsStore.getState().meals[0].id;
    useSavedMealsStore.getState().markUsed(id); // useCount -> 1, lastUsedAt set
    const before = useSavedMealsStore.getState().meals[0];
    useSavedMealsStore.getState().updateMeal(id, { calories: 250 });
    const after = useSavedMealsStore.getState().meals[0];
    expect(after.useCount).toBe(before.useCount);
    expect(after.lastUsedAt).toBe(before.lastUsedAt);
  });
});
