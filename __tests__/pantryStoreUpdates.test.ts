import { usePantryStore } from "@/stores/pantryStore";
import { PantryItem } from "@/types";

const STAMP = "2026-01-01T00:00:00.000Z";

function item(id: string, quantity: number, unit: PantryItem["unit"]): PantryItem {
  return { id, userId: "guest", name: id, nameZh: id, quantity, unit, inStock: true, updatedAt: STAMP };
}

beforeEach(() => {
  usePantryStore.setState({
    items: [item("egg", 10, "piece"), item("tofu", 2, "box"), item("rice", 2000, "g")],
    seeded: true,
  });
});

describe("pantryStore.applyUpdates", () => {
  it("sets the amount and stock together, and stamps only the items it changes", () => {
    usePantryStore.getState().applyUpdates([
      { id: "egg", quantity: 8, inStock: true },
      { id: "tofu", quantity: 0, inStock: false },
    ]);
    const items = usePantryStore.getState().items;
    expect(items.map((it) => [it.id, it.quantity, it.inStock])).toEqual([
      ["egg", 8, true],
      ["tofu", 0, false],
      ["rice", 2000, true],
    ]);
    expect(items[0].updatedAt).not.toBe(STAMP);
    expect(items[1].updatedAt).not.toBe(STAMP);
    expect(items[2].updatedAt).toBe(STAMP);
  });

  it("never stores a negative amount", () => {
    usePantryStore.getState().applyUpdates([{ id: "egg", quantity: -3, inStock: false }]);
    expect(usePantryStore.getState().items[0].quantity).toBe(0);
  });

  it("ignores updates for items that are no longer in the pantry", () => {
    usePantryStore.getState().applyUpdates([{ id: "gone", quantity: 1, inStock: true }]);
    expect(usePantryStore.getState().items.map((it) => it.updatedAt)).toEqual([STAMP, STAMP, STAMP]);
  });
});
