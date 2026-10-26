import type { HelperDish, PlanIngredient, ShoppingSnapshot } from "@/types/familyPlan";
import { localiseDish, localiseShopping, missingTranslations, shoppingSnapshot } from "@/utils/helperPlan";
import type { WeeklyShopping } from "@/utils/weekPlan";

// Helper mode shows the family's helper what to cook and how much, in her language, with the original
// Chinese name always beside it. AI translations can be missing or come back misaligned, so these pin
// that she then gets the dependable English, never a step or ingredient in the wrong place.

const ing = (name: string, nameZh: string, quantity: number, unit: PlanIngredient["unit"]): PlanIngredient => ({
  name,
  nameZh,
  quantity,
  unit,
  category: "meat",
});

const SOY_CHICKEN: HelperDish = {
  id: "d1",
  planId: "p1",
  date: "2026-10-26",
  slot: "dinner",
  title: "Soy sauce chicken with rice",
  titleZh: "豉油雞飯",
  totalMinutes: 40,
  ingredients: [ing("Chicken", "雞肉", 200, "g"), ing("Rice", "白米", 80, "g")],
  steps: [
    { stepNumber: 1, instruction: "Cook the rice.", instructionZh: "煲飯。", durationSeconds: 1500 },
    { stepNumber: 2, instruction: "Poach the chicken in the soy sauce.", instructionZh: "用豉油浸熟雞。", durationSeconds: null },
  ],
  locked: false,
  loggedAt: null,
  translations: {
    fil: {
      title: "Manok sa toyo na may kanin",
      ingredients: ["Manok", "Bigas"],
      steps: ["Lutuin ang kanin.", "Pakuluan nang dahan-dahan ang manok sa toyo."],
    },
  },
};

describe("localiseDish", () => {
  it("gives her the dish in her language, keeping the Chinese name of the dish and of every ingredient", () => {
    expect(localiseDish(SOY_CHICKEN, "fil")).toEqual({
      title: "Manok sa toyo na may kanin",
      titleZh: "豉油雞飯",
      translated: true,
      ingredients: [
        { ...SOY_CHICKEN.ingredients[0], local: "Manok" },
        { ...SOY_CHICKEN.ingredients[1], local: "Bigas" },
      ],
      steps: [
        { stepNumber: 1, text: "Lutuin ang kanin." },
        { stepNumber: 2, text: "Pakuluan nang dahan-dahan ang manok sa toyo." },
      ],
    });
  });

  it("uses the recipe's own English for English", () => {
    const en = localiseDish(SOY_CHICKEN, "en");
    expect(en).toMatchObject({ title: "Soy sauce chicken with rice", titleZh: "豉油雞飯", translated: true });
    expect(en.ingredients.map((i) => i.local)).toEqual(["Chicken", "Rice"]);
    expect(en.steps.map((s) => s.text)).toEqual(["Cook the rice.", "Poach the chicken in the soy sauce."]);
  });

  it("falls back to English when there is no translation yet", () => {
    const id = localiseDish(SOY_CHICKEN, "id");
    expect(id).toMatchObject({ title: "Soy sauce chicken with rice", translated: false });
    expect(id.steps[1].text).toBe("Poach the chicken in the soy sauce.");
  });

  it("falls back to English rather than put a word against the wrong ingredient or step", () => {
    const short = {
      ...SOY_CHICKEN,
      translations: { fil: { title: "Manok", ingredients: ["Manok"], steps: ["Lutuin.", "Pakuluan."] } },
    };
    expect(localiseDish(short, "fil")).toMatchObject({ title: "Soy sauce chicken with rice", translated: false });
    const oneStep = {
      ...SOY_CHICKEN,
      translations: { fil: { title: "Manok", ingredients: ["Manok", "Bigas"], steps: ["Lutuin at ilaga."] } },
    };
    expect(localiseDish(oneStep, "fil")).toMatchObject({ title: "Soy sauce chicken with rice", translated: false });
  });
});

describe("missingTranslations", () => {
  it("lists the dishes still to translate into her language, and none for English", () => {
    const other = { ...SOY_CHICKEN, id: "d2", translations: {} };
    expect(missingTranslations([SOY_CHICKEN, other], "fil")).toEqual(["d2"]);
    expect(missingTranslations([SOY_CHICKEN, other], "id")).toEqual(["d1", "d2"]);
    expect(missingTranslations([SOY_CHICKEN, other], "en")).toEqual([]);
  });
});

describe("the shopping list in her language", () => {
  const weekly: WeeklyShopping = {
    coveredCount: 2,
    groups: [
      {
        category: "meat",
        lines: [{ key: "k1", name: "Chicken", nameZh: "雞肉", quantity: 780, unit: "g", category: "meat", dishIds: ["d1"] }],
      },
      {
        category: "dry_goods",
        lines: [{ key: "k2", name: "Oyster sauce", nameZh: "蠔油", quantity: 60, unit: "ml", category: "dry_goods", dishIds: ["d9"] }],
      },
    ],
  };

  it("is published from the planner's list with just what helper mode needs", () => {
    expect(shoppingSnapshot(weekly, "2026-10-26", "2026-10-26T09:30:00.000Z")).toEqual({
      updatedAt: "2026-10-26T09:30:00.000Z",
      fromDate: "2026-10-26",
      groups: [
        { category: "meat", lines: [{ name: "Chicken", nameZh: "雞肉", quantity: 780, unit: "g" }] },
        { category: "dry_goods", lines: [{ name: "Oyster sauce", nameZh: "蠔油", quantity: 60, unit: "ml" }] },
      ],
    });
  });

  it("names each line in her language where a dish's translation has it, and in English where not", () => {
    const snap: ShoppingSnapshot = shoppingSnapshot(weekly, "2026-10-26", "2026-10-26T09:30:00.000Z");
    expect(localiseShopping(snap, [SOY_CHICKEN], "fil")).toEqual([
      { category: "meat", lines: [{ name: "Chicken", nameZh: "雞肉", quantity: 780, unit: "g", local: "Manok" }] },
      { category: "dry_goods", lines: [{ name: "Oyster sauce", nameZh: "蠔油", quantity: 60, unit: "ml", local: "Oyster sauce" }] },
    ]);
  });
});
