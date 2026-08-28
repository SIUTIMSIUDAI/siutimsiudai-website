import { mapDayFromRows, DailyLogRow, FoodEntryRow } from "@/utils/familyLogMap";

const logRow: DailyLogRow = { id: "log-1", user_id: "dep-1", log_date: "2026-08-28" };

function row(over: Partial<FoodEntryRow>): FoodEntryRow {
  return {
    id: "fe-1",
    daily_log_id: "log-1",
    name: "Congee",
    name_zh: "粥",
    meal_type: "breakfast",
    calories: 250,
    protein: 6,
    carbs: 50,
    fat: 2,
    quantity: 1,
    unit: "bowl",
    source: "manual",
    image_url: null,
    barcode: null,
    logged_at: "2026-08-28T00:30:00.000Z",
    customizations: [],
    micros: null,
    ...over,
  };
}

describe("mapDayFromRows", () => {
  it("maps snake_case columns to a camelCase DailyLog", () => {
    const day = mapDayFromRows(logRow, [row({})]);
    expect(day).toMatchObject({ id: "log-1", userId: "dep-1", logDate: "2026-08-28" });
    expect(day.entries[0]).toMatchObject({
      id: "fe-1",
      dailyLogId: "log-1",
      nameZh: "粥",
      mealType: "breakfast",
      imageUri: null,
      loggedAt: "2026-08-28T00:30:00.000Z",
    });
  });

  it("round-trips customizations and micros from jsonb, dropping unknown values", () => {
    const day = mapDayFromRows(logRow, [
      row({
        customizations: ["less_rice", "bogus"],
        micros: { iron: 3.2, calcium: 120, junk: "x" },
      }),
    ]);
    expect(day.entries[0].customizations).toEqual(["less_rice"]);
    expect(day.entries[0].micros).toEqual({ iron: 3.2, calcium: 120 });
  });

  it("coerces numeric strings (PostgREST numeric) to numbers", () => {
    const day = mapDayFromRows(logRow, [
      row({ calories: "250" as unknown as number, protein: "6" as unknown as number }),
    ]);
    expect(day.entries[0].calories).toBe(250);
    expect(day.entries[0].protein).toBe(6);
  });

  it("maps an empty day", () => {
    expect(mapDayFromRows(logRow, []).entries).toEqual([]);
  });
});
