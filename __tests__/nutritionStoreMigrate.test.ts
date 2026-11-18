import { legacyCalorieTarget, migrateNutritionState } from "@/stores/nutritionStore";
import { HealthProfile } from "@/types";

// The one-time update when targets moved to the Hong Kong reference (store version 1): a saved calorie
// target the old app calculated is recalculated; one the user typed in is theirs and stays.

const F25: HealthProfile = { sex: "female", age: 25, heightCm: 160, weightKg: 55, activityLevel: "sedentary", goal: "maintain" };
const MALE: HealthProfile = { sex: "male", age: 30, heightCm: 180, weightKg: 80, activityLevel: "moderate", goal: "maintain" };

describe("legacyCalorieTarget (the old rule, frozen)", () => {
  test("matches what the old app calculated", () => {
    expect(legacyCalorieTarget(MALE)).toBe(2760);
    expect(legacyCalorieTarget(F25)).toBe(1520);
    expect(legacyCalorieTarget({ ...F25, goal: "lose" })).toBe(1290); // 1517 * 0.85 = 1289.45
  });
});

describe("migrateNutritionState", () => {
  test("recalculates a target the old app calculated", () => {
    const out = migrateNutritionState({ dailyCalorieTarget: 1520, healthProfile: F25, logsByDate: {} }, 0) as {
      dailyCalorieTarget: number | null;
    };
    expect(out.dailyCalorieTarget).toBe(1530);
  });

  test("keeps a target the user typed in", () => {
    const out = migrateNutritionState({ dailyCalorieTarget: 1800, healthProfile: F25, logsByDate: {} }, 0) as {
      dailyCalorieTarget: number | null;
    };
    expect(out.dailyCalorieTarget).toBe(1800);
  });

  test("clears a calculated target for someone the reference doesn't cover", () => {
    const teen = { ...F25, age: 16 };
    const out = migrateNutritionState(
      { dailyCalorieTarget: legacyCalorieTarget(teen), healthProfile: teen, logsByDate: {} },
      0,
    ) as { dailyCalorieTarget: number | null };
    expect(out.dailyCalorieTarget).toBeNull();
  });

  test("leaves a user with no health profile alone", () => {
    const out = migrateNutritionState({ dailyCalorieTarget: 2000, healthProfile: null, logsByDate: {} }, 0) as {
      dailyCalorieTarget: number | null;
    };
    expect(out.dailyCalorieTarget).toBe(2000);
  });

  test("does nothing once already on version 1", () => {
    const out = migrateNutritionState({ dailyCalorieTarget: 1520, healthProfile: F25, logsByDate: {} }, 1) as {
      dailyCalorieTarget: number | null;
    };
    expect(out.dailyCalorieTarget).toBe(1520);
  });

  test("keeps the diary untouched", () => {
    const logsByDate = { "2026-11-14": { id: "log-1", userId: "u", logDate: "2026-11-14", entries: [] } };
    const out = migrateNutritionState({ dailyCalorieTarget: 1520, healthProfile: F25, logsByDate }, 0) as {
      logsByDate: unknown;
    };
    expect(out.logsByDate).toBe(logsByDate);
  });
});
