import {
  breaksExclusions,
  checkDish,
  dayPrompt,
  daysToPlan,
  exclusionList,
  hkToday,
  outlinePrompt,
  pantryLines,
  pickDayDishes,
  pickOutline,
  PLAN_SYSTEM_PROMPT,
  planSlots,
  targetWeek,
  weekStartOf,
} from "../supabase/functions/plan-week/plan";

// plan-week's pure half: which weeks can be planned, what the model is told (above all, what never to
// use), and which of its dishes are good enough to cook from and to log into people's diaries.

const goodDish = (over: Record<string, unknown> = {}) => ({
  slot: "dinner",
  title: "Steamed fish with ginger and spring onion",
  titleZh: "薑葱蒸魚",
  totalMinutes: 25,
  ingredients: [
    { name: "Grass carp", nameZh: "鯇魚", quantity: 180.04, unit: "g", category: "seafood" },
    { name: "Ginger", nameZh: "薑", quantity: 2, unit: "piece", category: "produce" },
    { name: "Rice", nameZh: "白米", quantity: 80, unit: "g", category: "dry_goods" },
  ],
  steps: [
    { stepNumber: 1, instruction: "Steam the fish for 8 minutes.", instructionZh: "魚蒸8分鐘。", durationSeconds: 480 },
    { stepNumber: 2, instruction: "Pour over hot oil and soy sauce.", instructionZh: "淋上熱油同豉油。", durationSeconds: null },
  ],
  perServing: { calories: 455.4, protein: 34.26, carbs: 63, fat: 7.5, fiber: 1 },
  ...over,
});

describe("which weeks can be planned", () => {
  it("reads today on Hong Kong's calendar, which turns at 16:00 UTC", () => {
    expect(hkToday(Date.UTC(2026, 9, 25, 15, 59))).toBe("2026-10-25");
    expect(hkToday(Date.UTC(2026, 9, 25, 16, 0))).toBe("2026-10-26");
  });

  it("finds the Sunday a week starts on", () => {
    expect(weekStartOf("2026-10-25")).toBe("2026-10-25"); // Sunday
    expect(weekStartOf("2026-10-28")).toBe("2026-10-25");
    expect(weekStartOf("2026-10-31")).toBe("2026-10-25"); // Saturday
  });

  it("allows this week and next week only, named by their Sunday", () => {
    expect(targetWeek("2026-10-25", "2026-10-28")).toBe("2026-10-25");
    expect(targetWeek("2026-11-01", "2026-10-28")).toBe("2026-11-01");
    expect(targetWeek("2026-11-08", "2026-10-28")).toBeNull();
    expect(targetWeek("2026-10-18", "2026-10-28")).toBeNull();
    expect(targetWeek("2026-10-26", "2026-10-28")).toBeNull(); // a Monday
    expect(targetWeek(20261025, "2026-10-28")).toBeNull();
    // On a Saturday, "next week" starts tomorrow.
    expect(targetWeek("2026-11-01", "2026-10-31")).toBe("2026-11-01");
  });

  it("cooks for the days still ahead", () => {
    expect(daysToPlan("2026-10-25", "2026-10-29")).toEqual(["2026-10-29", "2026-10-30", "2026-10-31"]);
    expect(daysToPlan("2026-11-01", "2026-10-29")).toHaveLength(7);
  });
});

describe("the family's inputs", () => {
  it("plans the slots switched on, in day order, or breakfast, lunch and dinner by default", () => {
    expect(planSlots(["dinner", "snack", "lunch"])).toEqual(["lunch", "dinner", "snack"]);
    expect(planSlots([])).toEqual(["breakfast", "lunch", "dinner"]);
    expect(planSlots(null)).toEqual(["breakfast", "lunch", "dinner"]);
  });

  it("merges everyone's exclusions into one list, once each whatever the case, and keeps each short", () => {
    expect(exclusionList([["peanuts", " pork "], ["PEANUTS", "蝦"], null, ["x".repeat(60)]])).toEqual([
      "peanuts",
      "pork",
      "蝦",
      "x".repeat(40),
    ]);
  });

  it("lists the pantry with amounts where it has them", () => {
    expect(pantryLines([{ name: "Rice", nameZh: "白米", quantity: 1000, unit: "g" }, { name: "" }, { nameZh: "豉油" }])).toBe(
      "- Rice / 白米 (~1000 g)\n- 豉油",
    );
    expect(pantryLines("rice")).toBe("");
  });
});

describe("what the model is asked", () => {
  it("names every day with its weekday, and what never to use", () => {
    const prompt = outlinePrompt({
      days: ["2026-10-31", "2026-11-01"],
      slots: ["lunch", "dinner"],
      pantry: [],
      exclusions: ["peanuts", "蝦"],
    });
    expect(prompt).toContain("Plan these meal slots: lunch, dinner, for each of these days:");
    expect(prompt).toContain("- Saturday 2026-10-31\n- Sunday 2026-11-01");
    expect(prompt).toContain("Never use:\n- peanuts (also: satay, kung pao, 沙嗲, 宮保)\n- 蝦 (also: XO sauce,");
    expect(prompt).toContain("Pantry:\n- (empty)");
  });

  it("asks the outline for dish names only, so a full week fits in one answer", () => {
    const prompt = outlinePrompt({ days: ["2026-10-31"], slots: ["dinner"], pantry: [], exclusions: [] });
    expect(prompt).toContain("Names only: no ingredients, steps or nutrition");
  });

  it("spells out that an exclusion covers the foods made from it", () => {
    expect(PLAN_SYSTEM_PROMPT).toContain("pork includes ham, bacon, char siu, spare ribs, sausages and luncheon meat");
    const prompt = outlinePrompt({ days: ["2026-10-31"], slots: ["dinner"], pantry: [], exclusions: ["pork", "芫茜"] });
    expect(prompt).toMatch(/\n- pork \(also: ham, bacon, [^\n]*叉燒[^\n]*\)\n- 芫茜\n/);
  });

  it("says so when nothing is excluded", () => {
    expect(outlinePrompt({ days: ["2026-10-31"], slots: ["dinner"], pantry: [], exclusions: [] })).toContain(
      "Never use:\n- (nothing)",
    );
  });

  it("writes out the planned dishes for a day, or asks afresh with the week's other dishes to avoid", () => {
    const planned = dayPrompt({
      date: "2026-10-26",
      slots: ["dinner"],
      outline: [{ slot: "dinner", title: "Steamed fish", titleZh: "蒸魚" }],
      pantry: [],
      exclusions: [],
      avoid: [],
    });
    expect(planned).toContain("Monday 2026-10-26.\nWrite the full recipe for each of these planned dishes:\n- dinner: Steamed fish / 蒸魚");
    expect(planned).not.toContain("Already on this week's plan");

    const fresh = dayPrompt({
      date: "2026-10-27",
      slots: ["lunch", "dinner"],
      outline: null,
      pantry: [],
      exclusions: [],
      avoid: ["Steamed fish / 蒸魚"],
    });
    expect(fresh).toContain("Plan one dish for each of these slots: lunch, dinner.");
    expect(fresh).toContain("Already on this week's plan, so choose different dishes:\n- Steamed fish / 蒸魚");
  });
});

describe("checkDish: good enough to cook from and to log", () => {
  it("keeps a sound dish, rounded", () => {
    expect(checkDish(goodDish(), ["lunch", "dinner"])).toEqual({
      slot: "dinner",
      title: "Steamed fish with ginger and spring onion",
      titleZh: "薑葱蒸魚",
      totalMinutes: 25,
      ingredients: [
        { name: "Grass carp", nameZh: "鯇魚", quantity: 180, unit: "g", category: "seafood" },
        { name: "Ginger", nameZh: "薑", quantity: 2, unit: "piece", category: "produce" },
        { name: "Rice", nameZh: "白米", quantity: 80, unit: "g", category: "dry_goods" },
      ],
      steps: [
        { stepNumber: 1, instruction: "Steam the fish for 8 minutes.", instructionZh: "魚蒸8分鐘。", durationSeconds: 480 },
        { stepNumber: 2, instruction: "Pour over hot oil and soy sauce.", instructionZh: "淋上熱油同豉油。", durationSeconds: null },
      ],
      perServing: { calories: 455, protein: 34.3, carbs: 63, fat: 7.5, fiber: 1 },
    });
  });

  it("drops a bad ingredient line, files an unknown category under other, and renumbers steps", () => {
    const dish = checkDish(
      goodDish({
        ingredients: [
          { name: "Grass carp", nameZh: "鯇魚", quantity: 180, unit: "g", category: "fish" },
          { name: "Water", nameZh: "水", quantity: 1, unit: "cup", category: "other" },
          { name: "Salt", nameZh: "鹽", quantity: 0, unit: "g", category: "dry_goods" },
        ],
        steps: [{ stepNumber: 4, instruction: "Steam.", instructionZh: "蒸。", durationSeconds: -3 }],
        totalMinutes: "soon",
      }),
      ["dinner"],
    );
    expect(dish?.ingredients).toEqual([{ name: "Grass carp", nameZh: "鯇魚", quantity: 180, unit: "g", category: "other" }]);
    expect(dish?.steps).toEqual([{ stepNumber: 1, instruction: "Steam.", instructionZh: "蒸。", durationSeconds: null }]);
    expect(dish?.totalMinutes).toBe(30);
  });

  it("rejects a dish for a slot nobody asked for, or with no name, ingredients or steps", () => {
    expect(checkDish(goodDish(), ["lunch"])).toBeNull();
    expect(checkDish(goodDish({ titleZh: "" }), ["dinner"])).toBeNull();
    expect(checkDish(goodDish({ ingredients: [{ name: "Water", nameZh: "水", quantity: 1, unit: "cup" }] }), ["dinner"])).toBeNull();
    expect(checkDish(goodDish({ steps: [] }), ["dinner"])).toBeNull();
    expect(checkDish("fish", ["dinner"])).toBeNull();
  });

  it("rejects missing or impossible nutrition, because 食咗 writes it into diaries", () => {
    expect(checkDish(goodDish({ perServing: { protein: 30, carbs: 60, fat: 7, fiber: 1 } }), ["dinner"])).toBeNull();
    expect(checkDish(goodDish({ perServing: { calories: 9000, protein: 30, carbs: 60, fat: 7, fiber: 1 } }), ["dinner"])).toBeNull();
    expect(checkDish(goodDish({ perServing: { calories: 450, protein: -1, carbs: 60, fat: 7, fiber: 1 } }), ["dinner"])).toBeNull();
    expect(checkDish(goodDish({ perServing: { calories: 450, protein: 30, carbs: 60, fat: 7 } }), ["dinner"])).toBeNull();
  });
});

describe("breaksExclusions: the check behind the prompt's first rule", () => {
  const dish = checkDish(goodDish(), ["dinner"])!;

  it("catches a listed food in the title or any ingredient, in English or Chinese", () => {
    expect(breaksExclusions(dish, ["CARP"])).toBe(true);
    expect(breaksExclusions(dish, ["蒸魚"])).toBe(true);
    expect(breaksExclusions({ ...dish, ingredients: [...dish.ingredients, { name: "Peanut oil", nameZh: "花生油", quantity: 5, unit: "ml", category: "dry_goods" }] }, ["花生"])).toBe(true);
  });

  it("catches what a common exclusion covers: ham and 火腿 for pork", () => {
    const ham = checkDish(goodDish({ title: "Ham and egg sandwich", titleZh: "火腿蛋治" }), ["dinner"])!;
    expect(breaksExclusions(ham, ["pork"])).toBe(true);
    expect(breaksExclusions(ham, ["唔食豬肉"])).toBe(true);
    expect(breaksExclusions(dish, ["蔥"])).toBe(true);
  });

  it("lets everything else through", () => {
    expect(breaksExclusions(dish, ["pork", "peanuts"])).toBe(false);
    expect(breaksExclusions(dish, [])).toBe(false);
    expect(breaksExclusions(dish, ["  "])).toBe(false);
  });
});

describe("pickDayDishes and pickOutline: reading the model's answers", () => {
  it("keeps one sound dish per slot, in day order, and drops any that break an exclusion", () => {
    const lunch = goodDish({ slot: "lunch", title: "Tomato and egg on rice", titleZh: "番茄炒蛋飯" });
    const porkDinner = goodDish({ title: "Pork chop rice", titleZh: "豬扒飯" });
    const picked = pickDayDishes(
      { dishes: [porkDinner, lunch, goodDish({ slot: "lunch", title: "Second lunch", titleZh: "第二個午餐" })] },
      ["lunch", "dinner"],
      ["pork"],
    );
    expect(picked.map((d) => [d.slot, d.title])).toEqual([["lunch", "Tomato and egg on rice"]]);
    expect(pickDayDishes({ recipes: [] }, ["dinner"], [])).toEqual([]);
    expect(pickDayDishes(null, ["dinner"], [])).toEqual([]);
  });

  it("reads the week's dish names for the days and slots asked about only", () => {
    const outline = pickOutline(
      {
        days: [
          {
            date: "2026-10-26",
            meals: [
              { slot: "dinner", title: "Steamed fish", titleZh: "蒸魚" },
              { slot: "dinner", title: "Another", titleZh: "另一個" },
              { slot: "snack", title: "Red bean soup", titleZh: "紅豆沙" },
            ],
          },
          { date: "2026-12-25", meals: [{ slot: "dinner", title: "Turkey", titleZh: "火雞" }] },
        ],
      },
      ["2026-10-26"],
      ["dinner"],
    );
    expect(Array.from(outline.entries())).toEqual([
      ["2026-10-26|dinner", { slot: "dinner", title: "Steamed fish", titleZh: "蒸魚" }],
    ]);
  });

  it("leaves out an outline dish that breaks an exclusion, so its day is planned afresh", () => {
    const outline = pickOutline(
      {
        days: [
          {
            date: "2026-10-26",
            meals: [
              { slot: "breakfast", title: "Ham and egg sandwich", titleZh: "火腿蛋治" },
              { slot: "dinner", title: "Steamed fish", titleZh: "蒸魚" },
            ],
          },
        ],
      },
      ["2026-10-26"],
      ["breakfast", "dinner"],
      ["pork"],
    );
    expect(Array.from(outline.keys())).toEqual(["2026-10-26|dinner"]);
  });
});
