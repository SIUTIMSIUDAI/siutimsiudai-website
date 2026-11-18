import { useNutritionStore } from "@/stores/nutritionStore";

const DAY = "2026-10-10";
const TEA = {
  name: "Iced lemon tea",
  nameZh: "凍檸茶",
  mealType: "snack" as const,
  calories: 160,
  protein: 0,
  carbs: 38,
  fat: 0,
  fiber: 0,
};

describe("nutritionStore with sugar tweaks", () => {
  beforeEach(() => {
    useNutritionStore.setState({ logsByDate: {} });
  });

  it("keeps the AI's added-sugar estimate on the logged item", () => {
    useNutritionStore.getState().addEntry({ ...TEA, addedSugar: 22 }, DAY);
    expect(useNutritionStore.getState().entriesForDate(DAY)[0].addedSugar).toBe(22);
  });

  it("logs an item without an estimate with no added-sugar figure at all", () => {
    useNutritionStore.getState().addEntry(TEA, DAY);
    expect(useNutritionStore.getState().entriesForDate(DAY)[0]).not.toHaveProperty("addedSugar");
  });

  it("swaps 少甜 for 走甜 on the item instead of stacking them", () => {
    useNutritionStore.getState().addEntry({ ...TEA, addedSugar: 22 }, DAY);
    const id = useNutritionStore.getState().entriesForDate(DAY)[0].id;
    useNutritionStore.getState().toggleCustomization(DAY, id, "less_sugar");
    useNutritionStore.getState().toggleCustomization(DAY, id, "no_sugar");
    expect(useNutritionStore.getState().entriesForDate(DAY)[0].customizations).toEqual(["no_sugar"]);
    // The day's total takes off all 22 g of the tea's added sugar: 88 kcal.
    expect(useNutritionStore.getState().totalsForDate(DAY).calories).toBe(72);
  });
});
