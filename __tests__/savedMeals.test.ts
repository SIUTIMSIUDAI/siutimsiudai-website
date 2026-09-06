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
