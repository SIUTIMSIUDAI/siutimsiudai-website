import type { PantryItem } from "@/types";
import type { IngredientCategory, PlanDish, PlanIngredient, PlanMember } from "@/types/familyPlan";
import { PORTION_FACTOR } from "@/constants/portionSizes";
import { weekStartOf } from "@/utils/dateRange";
import {
  canEditPortion,
  canLogDish,
  choiceFor,
  daysToPlan,
  eatersOf,
  formatPlanAmount,
  inboxEntryFrom,
  mealLogLines,
  normaliseSlots,
  personKcal,
  planWeekDates,
  scaledIngredients,
  servingsFor,
  slotKey,
  weeklyShoppingList,
} from "@/utils/weekPlan";

// The weekly family plan turns one standard serving per dish into what each person eats, what the
// cook makes, what to buy and what 食咗 writes into everyone's diary. These tests pin those numbers.

const ing = (
  name: string,
  nameZh: string,
  quantity: number,
  unit: PlanIngredient["unit"],
  category: IngredientCategory,
): PlanIngredient => ({ name, nameZh, quantity, unit, category });

const dish = (
  id: string,
  date: string,
  slot: PlanDish["slot"],
  ingredients: PlanIngredient[],
  title = `Dish ${id}`,
  titleZh = `菜式${id}`,
): PlanDish => ({
  id,
  planId: "p1",
  date,
  slot,
  title,
  titleZh,
  ingredients,
  steps: [],
  totalMinutes: 30,
  perServing: { calories: 520, protein: 32, carbs: 62, fat: 14, fiber: 1 },
  locked: false,
  loggedAt: null,
});

// Three members on three different sizes: 中 + 大 + 細 = 3 standard servings.
const MEMBERS: PlanMember[] = [
  { userId: "me", role: "manager", displayName: "Ka Yan", defaultSize: "medium" },
  { userId: "dad", role: "dependent", displayName: "Chi Keung", defaultSize: "large" },
  { userId: "teen", role: "dependent", displayName: "Hoi Ching", defaultSize: "small" },
];

const SOY_CHICKEN = dish(
  "d1",
  "2026-10-26",
  "dinner",
  [
    ing("Chicken", "雞肉", 200, "g", "meat"),
    ing("Soy sauce", "豉油", 10, "ml", "dry_goods"),
    ing("Ginger", "薑", 1, "piece", "produce"),
    ing("Rice", "白米", 80, "g", "dry_goods"),
  ],
  "Soy sauce chicken with rice",
  "豉油雞飯",
);
const TOMATO_EGG = dish("d2", "2026-10-27", "lunch", [
  ing("Eggs", "雞蛋", 2, "piece", "eggs_dairy_soy"),
  ing("Tomato", "番茄", 150, "g", "produce"),
  ing("Rice", "白米", 80, "g", "dry_goods"),
]);
const CHICKEN_CONGEE = dish("d3", "2026-10-28", "breakfast", [
  ing("Chicken thigh", "雞髀", 60, "g", "meat"),
  ing("Rice", "米", 40, "g", "dry_goods"),
]);
const WEEK = [SOY_CHICKEN, TOMATO_EGG, CHICKEN_CONGEE];
const MON_DINNER = "2026-10-26|dinner";
const TUE_LUNCH = "2026-10-27|lunch";
const ALL_SLOTS: PlanDish["slot"][] = ["breakfast", "lunch", "dinner"];

const pantryItem = (name: string, nameZh: string, quantity: number, unit: PantryItem["unit"]): PantryItem => ({
  id: `p-${name}`,
  userId: "me",
  name,
  nameZh,
  quantity,
  unit,
  inStock: true,
  updatedAt: "2026-10-25T00:00:00.000Z",
});

describe("portion sizes", () => {
  it("are 細 0.75, 中 1 and 大 1.25 of a standard serving", () => {
    expect(PORTION_FACTOR).toEqual({ small: 0.75, medium: 1, large: 1.25 });
  });
});

describe("plan weeks run Sunday to Saturday, like every week in the app", () => {
  it("finds the Sunday a day's week starts on", () => {
    expect(weekStartOf("2026-10-25")).toBe("2026-10-25"); // a Sunday
    expect(weekStartOf("2026-10-26")).toBe("2026-10-25");
    expect(weekStartOf("2026-10-31")).toBe("2026-10-25"); // a Saturday
  });

  it("lists the seven days from that Sunday", () => {
    expect(planWeekDates("2026-10-25")).toEqual([
      "2026-10-25",
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
    ]);
  });

  it("plans only the days still ahead: today on for this week, all of next week, none of a past one", () => {
    expect(daysToPlan("2026-10-25", "2026-10-29")).toEqual(["2026-10-29", "2026-10-30", "2026-10-31"]);
    expect(daysToPlan("2026-11-01", "2026-10-29")).toHaveLength(7);
    expect(daysToPlan("2026-10-18", "2026-10-29")).toEqual([]);
  });
});

describe("normaliseSlots: the slots a family has switched on", () => {
  it("keeps known slots once each, in the order a day is shown", () => {
    expect(normaliseSlots(["dinner", "breakfast", "dinner", "brunch"])).toEqual(["breakfast", "dinner"]);
  });

  it("is empty for anything that isn't a list", () => {
    expect(normaliseSlots("dinner")).toEqual([]);
    expect(normaliseSlots(null)).toEqual([]);
  });
});

describe("who eats a dish, and how much", () => {
  it("keeps choices per slot, so they outlive a swapped dish", () => {
    expect(slotKey(SOY_CHICKEN)).toBe("2026-10-26|dinner");
  });

  it("uses each member's usual size unless they chose differently for this slot", () => {
    expect(choiceFor(MON_DINNER, MEMBERS[1], {})).toBe("large");
    expect(choiceFor(MON_DINNER, MEMBERS[1], { [MON_DINNER]: { dad: "small" } })).toBe("small");
    expect(choiceFor(TUE_LUNCH, MEMBERS[1], { [MON_DINNER]: { dad: "skip" } })).toBe("large");
  });

  it("leaves out anyone who chose 唔食呢餐", () => {
    const eaters = eatersOf(MON_DINNER, MEMBERS, { [MON_DINNER]: { teen: "skip" } });
    expect(eaters).toEqual([
      { userId: "me", size: "medium", factor: 1 },
      { userId: "dad", size: "large", factor: 1.25 },
    ]);
    expect(servingsFor(eaters)).toBe(2.25);
  });

  it("cooks 細 + 中 + 大 as three standard servings", () => {
    expect(servingsFor(eatersOf(MON_DINNER, MEMBERS, {}))).toBe(3);
  });

  it("scales the cooking amounts by those servings", () => {
    expect(scaledIngredients(SOY_CHICKEN, 3).map((i) => [i.name, i.quantity])).toEqual([
      ["Chicken", 600],
      ["Soy sauce", 30],
      ["Ginger", 3],
      ["Rice", 240],
    ]);
  });

  it("gives each person their share of the estimated calories", () => {
    expect(personKcal(520, PORTION_FACTOR.large)).toBe(650);
    expect(personKcal(520, PORTION_FACTOR.small)).toBe(390);
  });
});

describe("who can change a portion", () => {
  it("lets the planner set anyone's, and everyone else only their own", () => {
    expect(canEditPortion("me", "manager", "dad")).toBe(true);
    expect(canEditPortion("dad", "dependent", "dad")).toBe(true);
    expect(canEditPortion("dad", "dependent", "teen")).toBe(false);
    expect(canEditPortion("solo", null, "solo")).toBe(true);
  });
});

describe("食咗: one tap logs each eater's portion to their own diary", () => {
  it("writes everyone who ate their own share, and skips 唔食", () => {
    const lines = mealLogLines(SOY_CHICKEN, MEMBERS, { [MON_DINNER]: { teen: "skip" } });
    expect(lines).toEqual([
      {
        userId: "me",
        size: "medium",
        entry: {
          name: "Soy sauce chicken with rice",
          nameZh: "豉油雞飯",
          mealType: "dinner",
          calories: 520,
          protein: 32,
          carbs: 62,
          fat: 14,
          fiber: 1,
          quantity: 1,
          unit: "serving",
        },
      },
      {
        userId: "dad",
        size: "large",
        entry: {
          name: "Soy sauce chicken with rice",
          nameZh: "豉油雞飯",
          mealType: "dinner",
          calories: 650,
          protein: 40,
          carbs: 77.5,
          fat: 17.5,
          fiber: 1.3,
          quantity: 1.25,
          unit: "serving",
        },
      },
    ]);
  });

  it("writes nothing when nobody ate it", () => {
    const allSkip = { [MON_DINNER]: { me: "skip" as const, dad: "skip" as const, teen: "skip" as const } };
    expect(mealLogLines(SOY_CHICKEN, MEMBERS, allSkip)).toEqual([]);
  });

  it("only for a meal that's due and not logged yet", () => {
    expect(canLogDish(SOY_CHICKEN, "2026-10-26")).toBe(true);
    expect(canLogDish(SOY_CHICKEN, "2026-10-28")).toBe(true);
    expect(canLogDish(SOY_CHICKEN, "2026-10-25")).toBe(false); // still ahead
    expect(canLogDish({ ...SOY_CHICKEN, loggedAt: "2026-10-26T12:00:00.000Z" }, "2026-10-26")).toBe(false);
  });
});

describe("weeklyShoppingList: what's missing for the week, combined and grouped", () => {
  const base = { dishes: WEEK, members: MEMBERS, portions: {}, slots: ALL_SLOTS, fromDate: "2026-10-26" };
  const pantry = [
    pantryItem("Rice", "白米", 1000, "g"),
    // Marked in stock without an amount, which the grocery merge treats as covered.
    pantryItem("Soy sauce", "豉油", 0, "piece"),
  ];

  it("adds the same ingredient across dishes, in English or Chinese, and leaves out what the pantry covers", () => {
    const list = weeklyShoppingList(base, pantry);
    expect(list.groups.map((g) => [g.category, g.lines.map((l) => [l.name, l.quantity, l.unit])])).toEqual([
      ["meat", [["Chicken", 780, "g"]]],
      [
        "produce",
        [
          ["Ginger", 3, "piece"],
          ["Tomato", 450, "g"],
        ],
      ],
      ["eggs_dairy_soy", [["Egg", 6, "piece"]]],
    ]);
    expect(list.coveredCount).toBe(2); // rice and soy sauce
  });

  it("buys less when someone skips a meal", () => {
    const list = weeklyShoppingList({ ...base, portions: { [TUE_LUNCH]: { dad: "skip" } } }, []);
    const produce = list.groups.find((g) => g.category === "produce")!;
    expect(produce.lines.find((l) => l.name === "Tomato")?.quantity).toBe(262.5);
  });

  it("skips meals already past, slots switched off, and dishes nobody eats", () => {
    const fromWednesday = weeklyShoppingList({ ...base, fromDate: "2026-10-27" }, []);
    expect(fromWednesday.groups[0].lines).toEqual([expect.objectContaining({ name: "Chicken", quantity: 180 })]);

    const noBreakfast = weeklyShoppingList({ ...base, slots: ["lunch", "dinner"] }, []);
    expect(noBreakfast.groups[0].lines).toEqual([expect.objectContaining({ name: "Chicken", quantity: 600 })]);

    const nobodyHome = { [MON_DINNER]: { me: "skip" as const, dad: "skip" as const, teen: "skip" as const } };
    const list = weeklyShoppingList({ ...base, portions: nobodyHome }, []);
    expect(list.groups[0].lines).toEqual([expect.objectContaining({ name: "Chicken", quantity: 180, dishIds: ["d3"] })]);
    expect(list.coveredCount).toBe(0);
  });

  it("only combines true matches: stock isn't chicken, and breast isn't any chicken", () => {
    const soupAndBreast = [
      SOY_CHICKEN,
      dish("d5", "2026-10-29", "dinner", [
        ing("Chicken stock", "雞湯", 300, "ml", "dry_goods"),
        ing("Chicken breast", "雞胸肉", 120, "g", "meat"),
      ]),
    ];
    const list = weeklyShoppingList({ ...base, dishes: soupAndBreast }, [pantryItem("Chicken", "雞肉", 2000, "g")]);
    const all = list.groups.flatMap((g) => g.lines.map((l) => [l.name, l.nameZh, l.quantity, l.unit]));
    expect(all).toContainEqual(["Chicken stock", "雞湯", 900, "ml"]);
    expect(all).toContainEqual(["Chicken breast", "雞胸肉", 360, "g"]);
    expect(all.find((l) => l[0] === "Chicken")).toBeUndefined(); // the pantry's 2kg covers the 600g of chicken
  });

  it("keeps an ingredient in one group even if two dishes tagged it differently", () => {
    const retagged = [
      SOY_CHICKEN,
      dish("d4", "2026-10-29", "dinner", [ing("Chicken", "雞肉", 100, "g", "other")]),
    ];
    const list = weeklyShoppingList({ ...base, dishes: retagged }, []);
    expect(list.groups.find((g) => g.category === "other")).toBeUndefined();
    expect(list.groups[0]).toEqual({
      category: "meat",
      lines: [expect.objectContaining({ name: "Chicken", quantity: 900, dishIds: ["d1", "d4"] })],
    });
  });
});

describe("formatPlanAmount: grams plus 斤／兩, the way a wet market sells it", () => {
  it("adds catties and taels to a weight", () => {
    expect(formatPlanAmount(780, "g", "shop")).toEqual({ metric: "780g", market: "1斤5兩" });
    expect(formatPlanAmount(450, "g", "shop")).toEqual({ metric: "450g", market: "12兩" });
    expect(formatPlanAmount(604.79, "g", "shop")).toEqual({ metric: "605g", market: "1斤" });
    expect(formatPlanAmount(1209.58, "g", "shop")).toEqual({ metric: "1.2kg", market: "2斤" });
    expect(formatPlanAmount(37.8, "g", "cook")).toEqual({ metric: "38g", market: "1兩" });
  });

  it("leaves amounts under a tael in grams only, keeping a decimal below 10", () => {
    expect(formatPlanAmount(30, "g", "shop")).toEqual({ metric: "30g", market: null });
    expect(formatPlanAmount(7.5, "g", "cook")).toEqual({ metric: "7.5g", market: null });
    expect(formatPlanAmount(8, "g", "cook")).toEqual({ metric: "8g", market: null });
  });

  it("shows volumes in ml or L", () => {
    expect(formatPlanAmount(30, "ml", "shop")).toEqual({ metric: "30ml", market: null });
    expect(formatPlanAmount(1500, "ml", "shop")).toEqual({ metric: "1.5L", market: null });
  });

  it("rounds pieces up to whole ones to buy, and to the nearest half to cook", () => {
    expect(formatPlanAmount(3.5, "piece", "shop")).toEqual({ metric: "x4", market: null });
    expect(formatPlanAmount(3.2, "piece", "shop")).toEqual({ metric: "x4", market: null });
    expect(formatPlanAmount(3.5, "piece", "cook")).toEqual({ metric: "x3.5", market: null });
    expect(formatPlanAmount(2.2, "piece", "cook")).toEqual({ metric: "x2", market: null });
    expect(formatPlanAmount(0.2, "piece", "cook")).toEqual({ metric: "x0.5", market: null });
  });
});

describe("inboxEntryFrom: a waiting 食咗 entry, checked before it reaches the diary", () => {
  const good = {
    id: "inbox-1",
    date: "2026-10-26",
    entry: {
      name: "Soy sauce chicken with rice",
      nameZh: "豉油雞飯",
      mealType: "dinner",
      calories: 650,
      protein: 40,
      carbs: 77.5,
      fat: 17.5,
      fiber: 1.3,
      quantity: 1.25,
      unit: "serving",
    },
  };

  it("passes a well-formed entry through", () => {
    expect(inboxEntryFrom(good)).toEqual(good);
  });

  it("rejects anything malformed rather than writing a wrong number into someone's diary", () => {
    expect(inboxEntryFrom(null)).toBeNull();
    expect(inboxEntryFrom({ ...good, id: "" })).toBeNull();
    expect(inboxEntryFrom({ ...good, date: "26/10/2026" })).toBeNull();
    expect(inboxEntryFrom({ ...good, entry: { ...good.entry, name: " " } })).toBeNull();
    expect(inboxEntryFrom({ ...good, entry: { ...good.entry, mealType: "brunch" } })).toBeNull();
    expect(inboxEntryFrom({ ...good, entry: { ...good.entry, calories: -5 } })).toBeNull();
    expect(inboxEntryFrom({ ...good, entry: { ...good.entry, protein: "lots" } })).toBeNull();
    expect(inboxEntryFrom({ ...good, entry: { ...good.entry, quantity: 0 } })).toBeNull();
  });
});
