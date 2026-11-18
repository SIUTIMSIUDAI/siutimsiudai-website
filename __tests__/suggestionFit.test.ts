import { PantryItem } from "@/types";
import { suggestionFit } from "@/utils/suggestionFit";

function item(id: string, name: string, nameZh: string, inStock = true): PantryItem {
  return { id, userId: "u1", name, nameZh, quantity: 1, unit: "piece", inStock, updatedAt: "2026-10-04T00:00:00.000Z" };
}

const food = (name: string, nameZh: string) => ({ name, nameZh });

describe("suggestionFit", () => {
  it("lists the pantry items a dish uses, by the pantry's own names, once each", () => {
    const pantry = [item("egg", "Egg", "雞蛋"), item("tom", "Tomato", "番茄"), item("pork", "Pork", "豬肉")];
    const fit = suggestionFit([food("eggs", "蛋"), food("Tomatoes", "番茄"), food("Egg", "雞蛋")], pantry);
    expect(fit.uses).toEqual([food("Egg", "雞蛋"), food("Tomato", "番茄")]);
    expect(fit.alsoNeeds).toEqual([]);
  });

  it("never lists water, cooking oil, salt or black pepper as missing", () => {
    const fit = suggestionFit(
      [food("Water", "水"), food("Vegetable oil", "菜油"), food("Salt", "鹽"), food("Black pepper", "黑胡椒")],
      [],
    );
    expect(fit).toEqual({ uses: [], alsoNeeds: [] });
  });

  it("recognises a basic by its Chinese name when the English is worded differently", () => {
    const fit = suggestionFit([food("Oil for frying", "生油"), food("Water for the sauce", "清水")], []);
    expect(fit.alsoNeeds).toEqual([]);
  });

  it("flags anything else the pantry doesn't have, including oils that aren't plain cooking oil", () => {
    const fit = suggestionFit(
      [food("Egg", "雞蛋"), food("Oyster sauce", "蠔油"), food("Sesame oil", "麻油")],
      [item("egg", "Egg", "雞蛋")],
    );
    expect(fit.alsoNeeds).toEqual([food("Oyster sauce", "蠔油"), food("Sesame oil", "麻油")]);
  });

  it("counts an item marked out of stock as missing", () => {
    const fit = suggestionFit([food("Ginger", "薑")], [item("g", "Ginger", "薑", false)]);
    expect(fit).toEqual({ uses: [], alsoNeeds: [food("Ginger", "薑")] });
  });

  it("names each missing ingredient once", () => {
    const fit = suggestionFit([food("Garlic", "蒜頭"), food("garlic clove", "蒜蓉")], []);
    expect(fit.alsoNeeds).toEqual([food("Garlic", "蒜頭")]);
  });
});
