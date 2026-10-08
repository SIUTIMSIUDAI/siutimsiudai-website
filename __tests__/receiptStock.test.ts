import { PantryItem } from "@/types";
import { planRestock, ReceiptRow, restockUpdates } from "@/utils/receiptStock";

function item(
  partial: Partial<PantryItem> & Pick<PantryItem, "id" | "name" | "nameZh">,
): PantryItem {
  return {
    userId: "u1",
    quantity: 0,
    unit: "piece",
    inStock: true,
    updatedAt: "2026-10-08T00:00:00.000Z",
    ...partial,
  };
}

function row(name: string, nameZh: string, quantity: number, unit: ReceiptRow["unit"]): ReceiptRow {
  return { name, nameZh, quantity, unit };
}

const eggs = item({ id: "egg", name: "Egg", nameZh: "雞蛋", quantity: 4 });

describe("planRestock", () => {
  it("tops up an item already in stock in the same unit", () => {
    expect(planRestock([row("Eggs", "雞蛋", 10, "piece")], [eggs])).toEqual([
      { kind: "topUp", item: eggs, from: 4, to: 14, wasOut: false },
    ]);
  });

  it("brings an out-of-stock item back with the amount bought", () => {
    const milk = item({ id: "milk", name: "Milk", nameZh: "牛奶", quantity: 1, unit: "carton", inStock: false });
    expect(planRestock([row("Milk", "牛奶", 2, "carton")], [milk])).toEqual([
      { kind: "topUp", item: milk, from: 0, to: 2, wasOut: true },
    ]);
  });

  it("adds a new row when the units differ or nothing matches", () => {
    const rice = item({ id: "rice", name: "Rice", nameZh: "白米", quantity: 2000, unit: "g" });
    expect(
      planRestock([row("Rice", "白米", 1, "bag"), row("Chilli", "辣椒", 3, "piece")], [rice]),
    ).toEqual([{ kind: "new" }, { kind: "new" }]);
  });

  it("matches a pantry item saved under its Chinese name", () => {
    const zhOnly = item({ id: "egg-zh", name: "雞蛋", nameZh: "雞蛋", quantity: 6 });
    expect(planRestock([row("eggs", "", 10, "piece")], [zhOnly])).toEqual([
      { kind: "topUp", item: zhOnly, from: 6, to: 16, wasOut: false },
    ]);
  });

  it("adds up two receipt lines for the same item", () => {
    expect(planRestock([row("Egg", "雞蛋", 10, "piece"), row("egg", "蛋", 6, "piece")], [eggs])).toEqual([
      { kind: "topUp", item: eggs, from: 4, to: 14, wasOut: false },
      { kind: "topUp", item: eggs, from: 14, to: 20, wasOut: false },
    ]);
  });

  it("prefers the in-stock entry when the pantry lists a food twice", () => {
    const gone = item({ id: "egg-gone", name: "Egg", nameZh: "雞蛋", quantity: 0, inStock: false });
    const have = item({ id: "egg-have", name: "Egg", nameZh: "雞蛋", quantity: 3 });
    expect(planRestock([row("Egg", "雞蛋", 10, "piece")], [gone, have])).toEqual([
      { kind: "topUp", item: have, from: 3, to: 13, wasOut: false },
    ]);
  });

  it("never matches a row with no name", () => {
    expect(planRestock([row("", "", 2, "piece")], [eggs])).toEqual([{ kind: "new" }]);
  });
});

describe("restockUpdates", () => {
  it("sets each topped-up item once, to its final amount and in stock", () => {
    const lines = planRestock([row("Egg", "雞蛋", 10, "piece"), row("egg", "蛋", 6, "piece")], [eggs]);
    expect(restockUpdates(lines)).toEqual([{ id: "egg", quantity: 20, inStock: true }]);
  });

  it("leaves an item alone when the receipt adds nothing to it, but still restocks one that ran out", () => {
    const soy = item({ id: "soy", name: "Soy sauce", nameZh: "豉油", quantity: 0, unit: "bottle", inStock: false });
    const lines = planRestock(
      [row("Egg", "雞蛋", 0, "piece"), row("Soy sauce", "豉油", 0, "bottle")],
      [eggs, soy],
    );
    expect(restockUpdates(lines)).toEqual([{ id: "soy", quantity: 0, inStock: true }]);
  });
});
