import {
  buildDailyLogPayload,
  shouldSyncDate,
  addDirty,
  removeDirty,
} from "@/utils/nutritionSync";
import { DailyLog, FoodEntry } from "@/types";

function entry(over: Partial<FoodEntry>): FoodEntry {
  return {
    id: "fe1",
    dailyLogId: "log1",
    name: "Egg tart",
    nameZh: "蛋撻",
    mealType: "snack",
    calories: 200,
    protein: 4,
    carbs: 24,
    fat: 10,
    quantity: 1,
    unit: "piece",
    source: "manual",
    imageUri: null,
    barcode: null,
    loggedAt: "2026-08-28T02:00:00.000Z",
    ...over,
  };
}

describe("buildDailyLogPayload", () => {
  it("sends EFFECTIVE totals but BASE per-entry macros + customizations", () => {
    const log: DailyLog = {
      id: "log1",
      userId: "u1",
      logDate: "2026-08-28",
      entries: [entry({ customizations: ["less_sugar"] })], // -45 kcal / -11 carbs effective
    };
    const p = buildDailyLogPayload(log);
    expect(p.p_log_date).toBe("2026-08-28");
    expect(p.p_total_calories).toBe(155); // 200 - 45
    expect(p.p_total_carbs).toBe(13); // 24 - 11
    expect(p.p_entries).toHaveLength(1);
    // per-entry macros stay the untweaked base
    expect(p.p_entries[0]).toMatchObject({
      name: "Egg tart",
      name_zh: "蛋撻",
      meal_type: "snack",
      calories: 200,
      carbs: 24,
      source: "manual",
      image_url: null,
      barcode: null,
      logged_at: "2026-08-28T02:00:00.000Z",
      customizations: ["less_sugar"],
      micros: null,
    });
  });

  it("defaults customizations to [] and micros to null when absent", () => {
    const log: DailyLog = { id: "l", userId: "u", logDate: "2026-08-28", entries: [entry({})] };
    const p = buildDailyLogPayload(log);
    expect(p.p_entries[0].customizations).toEqual([]);
    expect(p.p_entries[0].micros).toBeNull();
  });

  it("clears a day: zero totals and no entries", () => {
    const log: DailyLog = { id: "l", userId: "u", logDate: "2026-08-28", entries: [] };
    const p = buildDailyLogPayload(log);
    expect(p.p_total_calories).toBe(0);
    expect(p.p_entries).toEqual([]);
  });
});

describe("shouldSyncDate", () => {
  it("paid syncs every day", () => {
    expect(shouldSyncDate(true, "2026-08-01", "2026-08-28")).toBe(true);
    expect(shouldSyncDate(true, "2026-08-28", "2026-08-28")).toBe(true);
  });
  it("free syncs today only", () => {
    expect(shouldSyncDate(false, "2026-08-28", "2026-08-28")).toBe(true);
    expect(shouldSyncDate(false, "2026-08-27", "2026-08-28")).toBe(false);
  });
});

describe("dirty-date set", () => {
  it("adds without duplicating", () => {
    expect(addDirty([], "2026-08-28")).toEqual(["2026-08-28"]);
    expect(addDirty(["2026-08-28"], "2026-08-28")).toEqual(["2026-08-28"]);
  });
  it("removes cleanly", () => {
    expect(removeDirty(["2026-08-27", "2026-08-28"], "2026-08-28")).toEqual(["2026-08-27"]);
    expect(removeDirty([], "2026-08-28")).toEqual([]);
  });
});
