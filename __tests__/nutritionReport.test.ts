import {
  biggestGaps,
  buildReport,
  dayNutrients,
  DayNutrients,
  formatNutrientAmount,
  ReportNutrientKey,
  targetStatus,
} from "@/utils/nutritionReport";
import { DailyLog, FoodEntry, NutritionTargets } from "@/types";

// The History report compares what was eaten with the user's own targets over a chosen range. These
// tests pin the rules a user reads off it: which days count, what "on target" means for each kind of
// nutrient, and which gaps are named first.

const TODAY = "2026-10-01";

function entry(over: Partial<FoodEntry>): FoodEntry {
  return {
    id: "e1",
    dailyLogId: "d1",
    name: "Meal",
    nameZh: "餐",
    mealType: "lunch",
    quantity: 1,
    unit: "serving",
    source: "manual",
    imageUri: null,
    barcode: null,
    loggedAt: "2026-09-30T12:00:00.000Z",
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
    ...over,
  };
}

const ZERO: Record<ReportNutrientKey, number> = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  fiber: 0,
  iron: 0,
  calcium: 0,
  potassium: 0,
  sodium: 0,
  vitaminC: 0,
  vitaminD: 0,
};

function day(dateKey: string, values: Partial<Record<ReportNutrientKey, number>>, logged = true): DayNutrients {
  return { dateKey, logged, values: { ...ZERO, ...values } };
}

const TARGETS: NutritionTargets = {
  calories: 2000,
  protein: 100,
  carbs: 250,
  fat: 70,
  fiber: 25,
  bmr: 1500,
  tdee: 2000,
  maintenance: 2000,
  eer: null,
  limits: { freeSugar: 50, saturatedFat: 22, transFat: 2.2 },
  micros: [
    { key: "sodium", label: "Sodium", labelZh: "鈉", amount: 2000, unit: "mg", isLimit: true, status: "verified", sourceId: "test" },
    { key: "fiber", label: "Fibre", labelZh: "纖維", amount: 25, unit: "g", isLimit: false, status: "verified", sourceId: "test" },
    { key: "calcium", label: "Calcium", labelZh: "鈣", amount: 1000, unit: "mg", isLimit: false, status: "verified", sourceId: "test" },
    { key: "iron", label: "Iron", labelZh: "鐵", amount: 8, unit: "mg", isLimit: false, status: "verified", sourceId: "test" },
    { key: "potassium", label: "Potassium", labelZh: "鉀", amount: 3400, unit: "mg", isLimit: false, status: "verified", sourceId: "test" },
    { key: "vitaminC", label: "Vitamin C", labelZh: "維他命C", amount: 90, unit: "mg", isLimit: false, status: "verified", sourceId: "test" },
    { key: "vitaminD", label: "Vitamin D", labelZh: "維他命D", amount: 15, unit: "mcg", isLimit: false, status: "verified", sourceId: "test" },
  ],
};

describe("dayNutrients", () => {
  it("adds up a day's meals with their 少甜 / 少底 tweaks and their micronutrients", () => {
    const logs: Record<string, DailyLog> = {
      "2026-09-30": {
        id: "d1",
        userId: "u1",
        logDate: "2026-09-30",
        entries: [
          // 少底 on a rice dish takes 40% of its carbs (32 g), about 149 kcal, 3 g protein and 1 g fat.
          entry({ name: "Char siu rice", nameZh: "叉燒飯", calories: 600, protein: 30, carbs: 80, fat: 18, fiber: 4, customizations: ["less_rice"] }),
          entry({ id: "e2", calories: 200, protein: 10, carbs: 20, fat: 8, fiber: 3, micros: { vitaminD: 2.5, calcium: 300 } }),
        ],
      },
    };
    expect(dayNutrients(logs, "2026-09-30")).toEqual({
      dateKey: "2026-09-30",
      logged: true,
      values: { ...ZERO, calories: 651, protein: 37, carbs: 68, fat: 25, fiber: 7, vitaminD: 2.5, calcium: 300 },
    });
  });

  it("marks a day with nothing on it as not logged", () => {
    expect(dayNutrients({}, "2026-09-29")).toEqual({ dateKey: "2026-09-29", logged: false, values: ZERO });
  });
});

describe("targetStatus", () => {
  it("reads calories, carbs and fat as a band: within 10% either way", () => {
    expect(targetStatus("calories", 1780, 2000)).toBe("under");
    expect(targetStatus("calories", 1800, 2000)).toBe("on");
    expect(targetStatus("calories", 2200, 2000)).toBe("on");
    expect(targetStatus("fat", 78, 70)).toBe("over");
  });

  it("reads protein, fibre, vitamins and minerals as a floor: 90% or more", () => {
    expect(targetStatus("protein", 89, 100)).toBe("under");
    expect(targetStatus("protein", 90, 100)).toBe("on");
    expect(targetStatus("vitaminD", 30, 15)).toBe("on");
  });

  // Sodium is a ceiling (owner, 2026-11-17): at or under the limit is on target, any amount over is
  // over, and eating less is never a miss.
  it("treats sodium as a ceiling", () => {
    expect(targetStatus("sodium", 0, 2000)).toBe("on");
    expect(targetStatus("sodium", 1200, 2000)).toBe("on");
    expect(targetStatus("sodium", 2000, 2000)).toBe("on");
    expect(targetStatus("sodium", 2001, 2000)).toBe("over");
  });
});

describe("buildReport", () => {
  const range = [
    day("2026-09-28", { calories: 2100, protein: 80 }),
    day("2026-09-29", {}, false),
    day("2026-09-30", { calories: 1900, protein: 120 }),
    day(TODAY, { calories: 500, protein: 20 }),
  ];

  it("averages only days that were logged, leaving today out while it is in progress", () => {
    const report = buildReport(range, TARGETS, TODAY);
    expect(report.daysCounted).toBe(2);
    expect(report.daysInRange).toBe(4);
    const calories = report.rows.find((r) => r.key === "calories");
    expect(calories).toMatchObject({ average: 2000, target: 2000, percent: 100, status: "on", daysOnTarget: 2, daysCounted: 2 });
  });

  it("counts each day against its own target", () => {
    const protein = buildReport(range, TARGETS, TODAY).rows.find((r) => r.key === "protein");
    expect(protein).toMatchObject({ average: 100, status: "on", daysOnTarget: 1 });
  });

  it("counts today when today is the whole range", () => {
    const report = buildReport([day(TODAY, { calories: 500 })], TARGETS, TODAY);
    expect(report.daysCounted).toBe(1);
    expect(report.rows.find((r) => r.key === "calories")).toMatchObject({ average: 500, percent: 25, status: "under" });
  });

  it("shows amounts without judging them when there are no targets, in the usual order", () => {
    const report = buildReport(range, null, TODAY);
    expect(report.rows.map((r) => r.key)).toEqual([
      "calories", "protein", "carbs", "fat", "fiber", "iron", "calcium", "potassium", "sodium", "vitaminC", "vitaminD",
    ]);
    expect(report.rows[0]).toMatchObject({ average: 2000, target: null, percent: null, status: null, daysOnTarget: 0 });
  });

  it("has nothing to average when no day in the range was logged", () => {
    const report = buildReport([day("2026-09-29", {}, false)], TARGETS, TODAY);
    expect(report.daysCounted).toBe(0);
    expect(report.rows[0]).toMatchObject({ average: null, percent: null, status: null, daysCounted: 0 });
  });

  it("puts the biggest gaps first, and does not count going over a floor as a gap", () => {
    const report = buildReport(
      [day("2026-09-30", {
        calories: 2000, protein: 150, carbs: 250, fat: 105, fiber: 15,
        iron: 8, calcium: 1000, potassium: 3400, vitaminC: 90, vitaminD: 1.5,
      })],
      TARGETS,
      TODAY,
    );
    expect(report.rows.map((r) => r.key)).toEqual([
      "vitaminD", "fat", "fiber", "calories", "protein", "carbs", "iron", "calcium", "potassium", "sodium", "vitaminC",
    ]);
    expect(biggestGaps(report)).toEqual(["vitaminD", "fat"]);
  });

  // Sodium is a ceiling: staying under it is no gap, going over it is, by how far over (130% of the
  // limit is a 30-point gap, ranked between fibre's 40 and the rows on target).
  it("counts going over the sodium ceiling as a gap, and staying under it as none", () => {
    const base = {
      calories: 2000, protein: 150, carbs: 250, fat: 105, fiber: 15,
      iron: 8, calcium: 1000, potassium: 3400, vitaminC: 90, vitaminD: 1.5,
    };
    const over = buildReport([day("2026-09-30", { ...base, sodium: 2600 })], TARGETS, TODAY);
    expect(over.rows.find((r) => r.key === "sodium")).toMatchObject({ average: 2600, target: 2000, percent: 130, status: "over" });
    expect(over.rows.map((r) => r.key)).toEqual([
      "vitaminD", "fat", "fiber", "sodium", "calories", "protein", "carbs", "iron", "calcium", "potassium", "vitaminC",
    ]);
    const under = buildReport([day("2026-09-30", { ...base, sodium: 900 })], TARGETS, TODAY);
    expect(under.rows.find((r) => r.key === "sodium")).toMatchObject({ status: "on", daysOnTarget: 1 });
    expect(under.rows.map((r) => r.key).indexOf("sodium")).toBe(9);
  });
});

describe("formatNutrientAmount", () => {
  it("keeps small amounts to one decimal and big ones whole", () => {
    expect(formatNutrientAmount("calories", 1662.5)).toBe("1,663");
    expect(formatNutrientAmount("protein", 63.4)).toBe("63");
    expect(formatNutrientAmount("vitaminD", 1.75)).toBe("1.8");
    expect(formatNutrientAmount("iron", 8)).toBe("8");
  });
});
