import { useNutritionStore } from "@/stores/nutritionStore";

// Adding a forgotten meal to a past day goes through the one daily-log save path, so the store must
// stamp the entry on the day it is filed under, at the meal's typical time, rather than with the
// moment it was typed in. A meal logged for today keeps the real clock time.

const MEAL = {
  name: "Cheese baked pork chop rice",
  nameZh: "芝士焗豬扒飯",
  calories: 850,
  protein: 30,
  carbs: 95,
  fat: 38,
  fiber: 3,
};

describe("addEntry timestamps", () => {
  beforeEach(() => {
    useNutritionStore.setState({ logsByDate: {} });
  });

  it("files a forgotten breakfast on its past day at breakfast time", () => {
    useNutritionStore.getState().addEntry({ ...MEAL, mealType: "breakfast" }, "2020-02-29");

    const [entry] = useNutritionStore.getState().entriesForDate("2020-02-29");
    const d = new Date(entry.loggedAt);
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()]).toEqual([
      2020, 2, 29, 8, 0,
    ]);
  });

  it("stamps a meal logged for today with the real clock time", () => {
    const before = Date.now();
    useNutritionStore.getState().addEntry({ ...MEAL, mealType: "dinner" });
    const after = Date.now();

    const [log] = Object.values(useNutritionStore.getState().logsByDate);
    const stamped = new Date(log.entries[0].loggedAt).getTime();
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(after);
  });
});
