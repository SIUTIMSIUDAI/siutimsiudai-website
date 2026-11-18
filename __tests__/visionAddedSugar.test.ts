import { parseRecognitionResponse } from "@/services/visionFoodService";

describe("parseRecognitionResponse: added sugar for 少甜 / 走甜", () => {
  it("carries a photo's added sugar, keeping a real zero", () => {
    const [tea, rice] = parseRecognitionResponse({
      meals: [
        { name: "Milk tea", nameZh: "奶茶", calories: 120, carbs: 18, addedSugar: 9 },
        { name: "Steamed rice", nameZh: "白飯", calories: 200, carbs: 45, addedSugar: 0 },
      ],
    })!;
    expect(tea.addedSugar).toBe(9);
    expect(rice.addedSugar).toBe(0);
  });

  it("leaves added sugar out when the reply has none", () => {
    const [dish] = parseRecognitionResponse({ meals: [{ name: "Siu mai", nameZh: "燒賣", calories: 180, carbs: 12 }] })!;
    expect(dish).not.toHaveProperty("addedSugar");
  });
});
