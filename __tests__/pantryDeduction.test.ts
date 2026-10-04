import { PantryItem } from "@/types";
import {
  defaultDecision,
  pantryUpdateFor,
  planPantryDeduction,
  PantryUseLine,
} from "@/utils/pantryDeduction";

function item(
  partial: Partial<PantryItem> & Pick<PantryItem, "id" | "name" | "nameZh">,
): PantryItem {
  return {
    userId: "u1",
    quantity: 0,
    unit: "piece",
    inStock: true,
    updatedAt: "2026-10-04T00:00:00.000Z",
    ...partial,
  };
}

function line(
  name: string,
  nameZh: string,
  quantity: number,
  unit: PantryUseLine["unit"],
): PantryUseLine {
  return { name, nameZh, quantity, unit };
}

const eggs = item({ id: "egg", name: "Egg", nameZh: "雞蛋", quantity: 10, unit: "piece" });
const pork = item({ id: "pork", name: "Pork", nameZh: "豬肉", quantity: 300, unit: "g" });
const tofu = item({ id: "tofu", name: "Tofu", nameZh: "豆腐", quantity: 3, unit: "box" });

describe("planPantryDeduction", () => {
  it("works out the amount when the recipe and the pantry share a unit", () => {
    const plan = planPantryDeduction([line("Egg", "雞蛋", 2, "piece")], [eggs]);
    expect(plan.rows).toEqual([{ kind: "amount", item: eggs, used: 2 }]);
    expect(plan.notInPantry).toBe(0);
  });

  it("matches a pantry item saved under its Chinese name only", () => {
    const zhOnly = item({ id: "egg-zh", name: "雞蛋", nameZh: "雞蛋", quantity: 6 });
    const plan = planPantryDeduction([line("eggs", "", 2, "piece")], [zhOnly]);
    expect(plan.rows).toEqual([{ kind: "amount", item: zhOnly, used: 2 }]);
  });

  it("skips pantry items that are out of stock", () => {
    const ginger = item({ id: "ginger", name: "Ginger", nameZh: "薑", inStock: false });
    const plan = planPantryDeduction([line("Ginger", "薑", 10, "g")], [ginger]);
    expect(plan.rows).toEqual([]);
    expect(plan.notInPantry).toBe(1);
  });

  it("adds up several recipe lines that use the same pantry item", () => {
    const plan = planPantryDeduction(
      [line("Egg", "雞蛋", 2, "piece"), line("Tomato", "番茄", 2, "piece"), line("egg", "蛋", 1, "piece")],
      [eggs],
    );
    expect(plan.rows).toEqual([{ kind: "amount", item: eggs, used: 3 }]);
    expect(plan.notInPantry).toBe(1);
  });

  it("asks instead of guessing when the pantry counts in packages", () => {
    const milk = item({ id: "milk", name: "Milk", nameZh: "牛奶", quantity: 1, unit: "carton" });
    const plan = planPantryDeduction(
      [line("Milk", "牛奶", 200, "ml"), line("Tofu", "豆腐", 300, "g")],
      [milk, tofu],
    );
    expect(plan.rows).toEqual([
      { kind: "choice", item: milk, canUseOne: false },
      { kind: "choice", item: tofu, canUseOne: true },
    ]);
  });

  it("asks when the pantry has no amount recorded", () => {
    const soy = item({ id: "soy", name: "Soy sauce", nameZh: "豉油", quantity: 0, unit: "ml" });
    const plan = planPantryDeduction([line("Light soy sauce", "生抽", 15, "ml")], [soy]);
    expect(plan.rows).toEqual([{ kind: "choice", item: soy, canUseOne: false }]);
  });

  it("asks when the recipe measures in a different unit from the pantry", () => {
    const onion = item({ id: "so", name: "Spring onion", nameZh: "葱", quantity: 3, unit: "piece" });
    const plan = planPantryDeduction([line("Scallion", "蔥", 10, "g")], [onion]);
    expect(plan.rows).toEqual([{ kind: "choice", item: onion, canUseOne: true }]);
  });

  it("asks, without a 'used 1 g' option, when a weighed item's line has no amount", () => {
    const salt = item({ id: "salt", name: "Salt", nameZh: "鹽", quantity: 500, unit: "g" });
    const plan = planPantryDeduction([line("Salt", "鹽", 0, "g")], [salt]);
    expect(plan.rows).toEqual([{ kind: "choice", item: salt, canUseOne: false }]);
  });

  it("asks when one food appears in two different units", () => {
    const plan = planPantryDeduction(
      [line("Egg", "雞蛋", 2, "piece"), line("Egg", "雞蛋", 50, "g")],
      [eggs],
    );
    expect(plan.rows).toEqual([{ kind: "choice", item: eggs, canUseOne: true }]);
  });

  it("counts each missing ingredient once, however many lines it has", () => {
    const plan = planPantryDeduction(
      [line("Garlic", "蒜頭", 2, "piece"), line("garlic clove", "蒜蓉", 5, "g"), line("Chilli", "辣椒", 1, "piece")],
      [eggs],
    );
    expect(plan.rows).toEqual([]);
    expect(plan.notInPantry).toBe(2);
  });

  it("uses the first in-stock entry when the pantry lists the same food twice", () => {
    const gone = item({ id: "egg-gone", name: "Egg", nameZh: "雞蛋", quantity: 4, inStock: false });
    const newer = item({ id: "egg-new", name: "Eggs", nameZh: "雞蛋", quantity: 6 });
    const older = item({ id: "egg-old", name: "Egg", nameZh: "蛋", quantity: 2 });
    const plan = planPantryDeduction([line("Egg", "雞蛋", 2, "piece")], [gone, newer, older]);
    expect(plan.rows).toEqual([{ kind: "amount", item: newer, used: 2 }]);
  });

  it("rounds part of an egg up to a whole one and keeps grams to one decimal", () => {
    const plan = planPantryDeduction(
      [line("Egg", "雞蛋", 1.25, "piece"), line("Pork belly", "五花腩", 133.333, "g")],
      [eggs, pork],
    );
    expect(plan.rows).toEqual([
      { kind: "amount", item: eggs, used: 2 },
      { kind: "amount", item: pork, used: 133.3 },
    ]);
  });
});

describe("pantryUpdateFor", () => {
  const eggRow = { kind: "amount" as const, item: eggs, used: 2 };

  it("takes the used amount off what is left", () => {
    expect(pantryUpdateFor(eggRow, { kind: "amount", include: true, used: 2 })).toEqual({
      id: "egg",
      quantity: 8,
      inStock: true,
    });
  });

  it("keeps grams tidy after subtracting", () => {
    const row = { kind: "amount" as const, item: pork, used: 133.3 };
    expect(pantryUpdateFor(row, { kind: "amount", include: true, used: 133.3 })).toEqual({
      id: "pork",
      quantity: 166.7,
      inStock: true,
    });
  });

  it("marks the item out of stock when the cook uses all of it, or more", () => {
    expect(pantryUpdateFor(eggRow, { kind: "amount", include: true, used: 10 })).toEqual({
      id: "egg",
      quantity: 0,
      inStock: false,
    });
    expect(pantryUpdateFor(eggRow, { kind: "amount", include: true, used: 12 })).toEqual({
      id: "egg",
      quantity: 0,
      inStock: false,
    });
  });

  it("leaves the item alone when the row is unticked or the amount is empty", () => {
    expect(pantryUpdateFor(eggRow, { kind: "amount", include: false, used: 2 })).toBeNull();
    expect(pantryUpdateFor(eggRow, { kind: "amount", include: true, used: 0 })).toBeNull();
    expect(pantryUpdateFor(eggRow, { kind: "amount", include: true, used: Number.NaN })).toBeNull();
  });

  it("applies the cook's answer for a package", () => {
    const row = { kind: "choice" as const, item: tofu, canUseOne: true };
    expect(pantryUpdateFor(row, { kind: "choice", answer: "keep" })).toBeNull();
    expect(pantryUpdateFor(row, { kind: "choice", answer: "useOne" })).toEqual({
      id: "tofu",
      quantity: 2,
      inStock: true,
    });
    expect(pantryUpdateFor(row, { kind: "choice", answer: "useUp" })).toEqual({
      id: "tofu",
      quantity: 0,
      inStock: false,
    });
  });

  it("marks the item out of stock when the last package is used", () => {
    const last = item({ id: "tofu-1", name: "Tofu", nameZh: "豆腐", quantity: 1, unit: "box" });
    const row = { kind: "choice" as const, item: last, canUseOne: false };
    expect(pantryUpdateFor(row, { kind: "choice", answer: "useOne" })).toEqual({
      id: "tofu-1",
      quantity: 0,
      inStock: false,
    });
  });
});

describe("defaultDecision", () => {
  it("deducts worked-out amounts and leaves packages alone until the cook says otherwise", () => {
    const plan = planPantryDeduction(
      [line("Egg", "雞蛋", 2, "piece"), line("Tofu", "豆腐", 300, "g")],
      [eggs, tofu],
    );
    const updates = plan.rows.map((row) => pantryUpdateFor(row, defaultDecision(row)));
    expect(updates).toEqual([{ id: "egg", quantity: 8, inStock: true }, null]);
  });
});
