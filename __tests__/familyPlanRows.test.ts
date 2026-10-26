import { dishFromRow, planFromRows, rosterFromRows } from "@/utils/familyPlanRows";

// The plan arrives as database rows (database/0012_max_household.sql). These checks decide what the
// screen trusts: a dish it can't cook from or log is left out rather than shown half-broken.

const recipe = {
  title: "Steamed sea bass, rice",
  titleZh: "蒸鱸魚飯",
  totalMinutes: 25,
  ingredients: [
    { name: "Sea bass", nameZh: "鱸魚", quantity: 180, unit: "g", category: "seafood" },
    { name: "Mystery", nameZh: "神秘", quantity: 1, unit: "cup", category: "other" },
    { name: "Rice", nameZh: "白米", quantity: 80, unit: "g", category: "grains" },
  ],
  steps: [{ stepNumber: 1, instruction: "Steam.", instructionZh: "蒸。", durationSeconds: 480 }],
  perServing: { calories: 480, protein: 30, carbs: 66, fat: 9, fiber: 1 },
};

const row = (over: Record<string, unknown> = {}) => ({
  id: "dish-1",
  plan_id: "plan-1",
  plan_date: "2026-10-26",
  slot: "dinner",
  locked: false,
  logged_at: null,
  recipe,
  ...over,
});

describe("dishFromRow", () => {
  it("maps a dish row, dropping ingredient lines it can't use and filing unknown groups under other", () => {
    expect(dishFromRow(row())).toEqual({
      id: "dish-1",
      planId: "plan-1",
      date: "2026-10-26",
      slot: "dinner",
      title: "Steamed sea bass, rice",
      titleZh: "蒸鱸魚飯",
      totalMinutes: 25,
      ingredients: [
        { name: "Sea bass", nameZh: "鱸魚", quantity: 180, unit: "g", category: "seafood" },
        { name: "Rice", nameZh: "白米", quantity: 80, unit: "g", category: "other" },
      ],
      steps: [{ stepNumber: 1, instruction: "Steam.", instructionZh: "蒸。", durationSeconds: 480 }],
      perServing: { calories: 480, protein: 30, carbs: 66, fat: 9, fiber: 1 },
      locked: false,
      loggedAt: null,
    });
  });

  it("keeps the lock and the 食咗 time", () => {
    expect(dishFromRow(row({ locked: true, logged_at: "2026-10-26T12:00:00Z" }))).toMatchObject({
      locked: true,
      loggedAt: "2026-10-26T12:00:00Z",
    });
  });

  it("leaves out a dish with no title, a bad slot, nothing to cook, or nutrition it can't log", () => {
    expect(dishFromRow(row({ recipe: { ...recipe, titleZh: "" } }))).toBeNull();
    expect(dishFromRow(row({ slot: "brunch" }))).toBeNull();
    expect(dishFromRow(row({ recipe: { ...recipe, ingredients: [] } }))).toBeNull();
    expect(dishFromRow(row({ recipe: { ...recipe, perServing: { ...recipe.perServing, calories: "lots" } } }))).toBeNull();
    expect(dishFromRow(row({ recipe: null }))).toBeNull();
  });
});

describe("planFromRows", () => {
  it("puts dishes in day and slot order and folds portion rows into slot choices", () => {
    const plan = planFromRows(
      { id: "plan-1", week_start: "2026-10-26", generated_at: "2026-10-25T09:00:00Z", regen_used: 3 },
      [
        row({ id: "dish-3", plan_date: "2026-10-27", slot: "lunch" }),
        row({ id: "dish-2", slot: "dinner" }),
        row({ id: "dish-1", slot: "breakfast" }),
        row({ id: "bad", slot: "brunch" }),
      ],
      [
        { plan_date: "2026-10-26", slot: "dinner", user_id: "dad", choice: "skip" },
        { plan_date: "2026-10-26", slot: "dinner", user_id: "teen", choice: "large" },
        { plan_date: "2026-10-27", slot: "lunch", user_id: "dad", choice: "huge" },
      ],
    );
    expect(plan.dishes.map((d) => d.id)).toEqual(["dish-1", "dish-2", "dish-3"]);
    expect(plan.portions).toEqual({ "2026-10-26|dinner": { dad: "skip", teen: "large" } });
    expect(plan).toMatchObject({ id: "plan-1", weekStart: "2026-10-26", regenUsed: 3 });
  });
});

describe("rosterFromRows", () => {
  it("maps the roster, defaulting an unknown size to 中", () => {
    expect(
      rosterFromRows([
        { user_id: "me", role: "manager", display_name: "Ka Yan", default_size: "medium" },
        { user_id: "dad", role: "dependent", display_name: null, default_size: "giant" },
        { user_id: 7, role: "dependent", display_name: "x", default_size: "small" },
      ]),
    ).toEqual([
      { userId: "me", role: "manager", displayName: "Ka Yan", defaultSize: "medium" },
      { userId: "dad", role: "dependent", displayName: null, defaultSize: "medium" },
    ]);
  });
});
