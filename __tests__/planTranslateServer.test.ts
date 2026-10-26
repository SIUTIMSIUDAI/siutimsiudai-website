import {
  batches,
  dishToTranslate,
  pickTranslations,
  translateLanguage,
  translatePrompt,
} from "../supabase/functions/plan-week/translate";

// plan-week's translate mode puts the week's dishes into the helper's language once, cached on each
// dish. These pin what the model is told and which answers are trusted: a translation that doesn't
// line up word for word with the recipe is not saved, so helper mode shows English instead.

const row = {
  id: "d1",
  recipe: {
    title: "Soy sauce chicken with rice",
    titleZh: "豉油雞飯",
    ingredients: [
      { name: "Chicken", nameZh: "雞肉", quantity: 200, unit: "g" },
      { name: "Rice", nameZh: "白米", quantity: 80, unit: "g" },
    ],
    steps: [
      { stepNumber: 1, instruction: "Cook the rice.", instructionZh: "煲飯。" },
      { stepNumber: 2, instruction: "Poach the chicken for 25 minutes.", instructionZh: "浸雞25分鐘。" },
    ],
    perServing: { calories: 590, protein: 36, carbs: 71, fat: 16, fiber: 1 },
  },
};

describe("translateLanguage", () => {
  it("accepts Filipino and Indonesian only", () => {
    expect(translateLanguage("fil")).toBe("fil");
    expect(translateLanguage("id")).toBe("id");
    expect(translateLanguage("en")).toBeNull();
    expect(translateLanguage("tl")).toBeNull();
    expect(translateLanguage(undefined)).toBeNull();
  });
});

describe("dishToTranslate", () => {
  it("takes the English words to translate, in the recipe's order, and nothing about nutrition", () => {
    expect(dishToTranslate(row)).toEqual({
      id: "d1",
      title: "Soy sauce chicken with rice",
      titleZh: "豉油雞飯",
      ingredients: [
        { en: "Chicken", zh: "雞肉" },
        { en: "Rice", zh: "白米" },
      ],
      steps: ["Cook the rice.", "Poach the chicken for 25 minutes."],
    });
  });

  it("skips a dish with nothing to translate", () => {
    expect(dishToTranslate({ id: "d2", recipe: null })).toBeNull();
    expect(dishToTranslate({ id: "d3", recipe: { title: "" } })).toBeNull();
  });
});

describe("translatePrompt", () => {
  it("names the language, keeps amounts as written, and asks for one word per ingredient and step in order", () => {
    const prompt = translatePrompt([dishToTranslate(row)!], "fil");
    expect(prompt).toContain("into Filipino (Tagalog)");
    expect(prompt).toContain("Keep every number, unit, time and temperature exactly as written.");
    expect(prompt).toContain("in the same order");
    expect(prompt).toContain('"id":"d1"');
    expect(prompt).toContain('"steps":["Cook the rice.","Poach the chicken for 25 minutes."]');
    expect(prompt).not.toContain("590");
  });
});

describe("pickTranslations", () => {
  const dishes = [dishToTranslate(row)!];
  const good = { id: "d1", title: " Manok sa toyo na may kanin ", ingredients: ["Manok", "Bigas"], steps: ["Lutuin ang kanin.", "Pakuluan ang manok nang 25 minuto."] };

  it("keeps a translation that lines up with the recipe, trimmed", () => {
    expect(Array.from(pickTranslations({ dishes: [good] }, dishes).entries())).toEqual([
      ["d1", { title: "Manok sa toyo na may kanin", ingredients: ["Manok", "Bigas"], steps: ["Lutuin ang kanin.", "Pakuluan ang manok nang 25 minuto."] }],
    ]);
  });

  it("drops anything that doesn't line up or wasn't asked for", () => {
    const pick = (d: unknown) => pickTranslations({ dishes: [d] }, dishes).size;
    expect(pick({ ...good, ingredients: ["Manok"] })).toBe(0);
    expect(pick({ ...good, steps: ["Lutuin."] })).toBe(0);
    expect(pick({ ...good, title: "" })).toBe(0);
    expect(pick({ ...good, steps: ["Lutuin ang kanin.", "  "] })).toBe(0);
    expect(pick({ ...good, id: "d9" })).toBe(0);
    expect(pickTranslations({ recipes: [good] }, dishes).size).toBe(0);
    expect(pickTranslations(null, dishes).size).toBe(0);
  });

  it("keeps the first answer for a dish the model answered twice", () => {
    const second = { ...good, title: "Iba pang pamagat" };
    expect(pickTranslations({ dishes: [good, second] }, dishes).get("d1")?.title).toBe("Manok sa toyo na may kanin");
  });
});

describe("batches", () => {
  it("splits the week into calls of a few dishes each", () => {
    expect(batches([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
    expect(batches([], 3)).toEqual([]);
  });
});
