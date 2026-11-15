import {
  computeNutritionTargets,
  micronutrientTargets,
  mifflinStJeorBmr,
  normalizeHealthProfile,
  referenceEer,
  targetCoverage,
} from "@/utils/nutritionTargets";
import { HealthProfile, NutritionTargets } from "@/types";

// Targets follow the 2026-11-14 Hong Kong reference (constants/nutrientReference.ts). The expected
// values below are the ones the owner approved in the Phase 1 plan, each with its source ID.

const MALE: HealthProfile = {
  sex: "male",
  age: 30,
  heightCm: 180,
  weightKg: 80,
  activityLevel: "moderate",
  goal: "maintain",
};

const FEMALE: HealthProfile = {
  sex: "female",
  age: 30,
  heightCm: 165,
  weightKg: 60,
  activityLevel: "moderate",
  goal: "maintain",
};

// The three test users from the brief, with the bodies the owner approved.
const F25: HealthProfile = { sex: "female", age: 25, heightCm: 160, weightKg: 55, activityLevel: "sedentary", goal: "maintain" };
const M35: HealthProfile = { sex: "male", age: 35, heightCm: 172, weightKg: 70, activityLevel: "moderate", goal: "maintain" };
const F72: HealthProfile = { sex: "female", age: 72, heightCm: 155, weightKg: 55, activityLevel: "light", goal: "maintain" };

function targetsOf(p: HealthProfile): NutritionTargets {
  const t = computeNutritionTargets(p);
  if (!t) throw new Error("expected targets for an adult");
  return t;
}

const micro = (t: NutritionTargets, key: string) => t.micros.find((m) => m.key === key);

describe("nutritionTargets: BMR (Mifflin-St Jeor)", () => {
  test("male uses the +5 constant", () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 1780
    expect(mifflinStJeorBmr(MALE)).toBe(1780);
  });

  test("female uses the -161 constant", () => {
    // 10*60 + 6.25*165 - 5*30 - 161 = 1320.25 -> 1320
    expect(mifflinStJeorBmr(FEMALE)).toBe(1320);
  });
});

describe("nutritionTargets: energy, kept within 10% of a verified Chinese EER", () => {
  test("no verified EER for moderate activity, so maintenance is Mifflin x activity", () => {
    const t = targetsOf(MALE);
    expect(t.tdee).toBe(2759); // 1780 * 1.55
    expect(t.eer).toBeNull();
    expect(t.maintenance).toBe(2759);
    expect(t.calories).toBe(2760);
  });

  test("raises a sedentary woman of 25 to 90% of her EER (1,700, O7)", () => {
    const t = targetsOf(F25);
    expect(t.tdee).toBe(1517);
    expect(t.eer).toBe(1700);
    expect(t.maintenance).toBe(1530); // 1,700 * 0.9
    expect(t.calories).toBe(1530);
  });

  test("lowers a large light-activity man of 25 to 110% of his EER (2,150, O7)", () => {
    const t = targetsOf({ sex: "male", age: 25, heightCm: 190, weightKg: 100, activityLevel: "light", goal: "maintain" });
    expect(t.tdee).toBe(2844);
    expect(t.eer).toBe(2150);
    expect(t.maintenance).toBe(2365); // 2,150 * 1.1
    expect(t.calories).toBe(2370);
  });

  test("leaves Mifflin alone inside the 10% band", () => {
    const t = targetsOf({ ...F25, activityLevel: "light", weightKg: 60 });
    expect(t.eer).toBe(1700);
    expect(t.maintenance).toBe(t.tdee);
  });

  test("uses no EER from age 50, where the reference's values are unverified", () => {
    expect(referenceEer({ ...F25, age: 49 })?.value).toBe(1700);
    expect(referenceEer({ ...F25, age: 50 })).toBeNull();
    expect(referenceEer({ ...F72 })).toBeNull();
  });

  test("maps sedentary and light to the Chinese light level only", () => {
    expect(referenceEer({ ...F25, activityLevel: "sedentary" })).not.toBeNull();
    expect(referenceEer({ ...F25, activityLevel: "light" })).not.toBeNull();
    for (const activityLevel of ["moderate", "active", "very_active"] as const) {
      expect(referenceEer({ ...F25, activityLevel })).toBeNull();
    }
  });

  test("applies the weight goal after the EER check", () => {
    expect(targetsOf({ ...F25, goal: "lose" }).calories).toBe(1300); // 1,530 * 0.85, rounded
    expect(targetsOf({ ...F25, goal: "gain" }).calories).toBe(1680); // 1,530 * 1.1, rounded
  });

  test("lose < maintain < gain for the same body", () => {
    const lose = targetsOf({ ...MALE, goal: "lose" }).calories;
    const maintain = targetsOf(MALE).calories;
    const gain = targetsOf({ ...MALE, goal: "gain" }).calories;
    expect(lose).toBeLessThan(maintain);
    expect(maintain).toBeLessThan(gain);
  });
});

describe("nutritionTargets: macros inside the Chinese AMDR ranges (C1)", () => {
  const t = targetsOf(MALE);

  test("protein is 15% of calories, the top of its 10-15% range", () => {
    expect(t.protein).toBe(Math.round((2760 * 0.15) / 4)); // 104
  });

  test("fat is 27% of calories, inside 20-30%", () => {
    expect(t.fat).toBe(Math.round((2760 * 0.27) / 9)); // 83
  });

  test("carbs take the rest and land inside 50-65%", () => {
    const share = (t.carbs * 4) / t.calories;
    expect(share).toBeGreaterThanOrEqual(0.5);
    expect(share).toBeLessThanOrEqual(0.65);
  });

  test("macro calories reconcile to the calorie budget", () => {
    const fromMacros = t.protein * 4 + t.carbs * 4 + t.fat * 9;
    expect(Math.abs(fromMacros - t.calories)).toBeLessThanOrEqual(10);
  });

  test("the muscle goal no longer raises protein above the reference range", () => {
    const muscle = targetsOf({ ...MALE, goal: "muscle" });
    const gain = targetsOf({ ...MALE, goal: "gain" });
    expect(muscle.calories).toBe(gain.calories);
    expect(muscle.protein).toBe(gain.protein);
    expect(muscle.protein).toBe(Math.round((muscle.calories * 0.15) / 4));
  });

  test("fibre is 25 g (O3), whatever the energy", () => {
    expect(t.fiber).toBe(25);
    expect(targetsOf(F72).fiber).toBe(25);
  });
});

describe("nutritionTargets: micronutrients", () => {
  const get = (list: ReturnType<typeof micronutrientTargets>, key: string) => list.find((m) => m.key === key);

  test("iron differs by sex and, for women, by age", () => {
    expect(get(micronutrientTargets("male", 30), "iron")?.amount).toBe(12);
    expect(get(micronutrientTargets("female", 49), "iron")?.amount).toBe(18);
    expect(get(micronutrientTargets("female", 50), "iron")?.amount).toBe(10);
  });

  test("calcium is 800 mg for every adult", () => {
    for (const [sex, age] of [["male", 20], ["female", 40], ["female", 55], ["male", 80]] as const) {
      expect(get(micronutrientTargets(sex, age), "calcium")?.amount).toBe(800);
    }
  });

  test("potassium is WHO's 3,500 mg for both sexes", () => {
    expect(get(micronutrientTargets("male", 30), "potassium")?.amount).toBe(3500);
    expect(get(micronutrientTargets("female", 30), "potassium")?.amount).toBe(3500);
  });

  test("vitamin D is 10 mcg to age 64 and has no target from 65 until its source can be opened", () => {
    expect(get(micronutrientTargets("female", 64), "vitaminD")?.amount).toBe(10);
    expect(get(micronutrientTargets("female", 64), "vitaminD")?.sourceId).toBe("O3");
    // 15 mcg from 65 is backed only by S2, whose link needs a sign-in, so it isn't shown yet.
    expect(get(micronutrientTargets("female", 65), "vitaminD")).toBeUndefined();
  });

  test("vitamin C is 100 mg for every adult, confirmed by O12", () => {
    expect(get(micronutrientTargets("male", 30), "vitaminC")?.amount).toBe(100);
    expect(get(micronutrientTargets("female", 72), "vitaminC")?.amount).toBe(100);
    expect(get(micronutrientTargets("female", 25), "vitaminC")?.sourceId).toBe("O12");
  });

  test("sodium is a 2,000 mg ceiling, not a floor", () => {
    const sodium = get(micronutrientTargets("male", 30), "sodium");
    expect(sodium?.amount).toBe(2000);
    expect(sodium?.isLimit).toBe(true);
  });

  test("fibre in the micro list matches the macro fibre", () => {
    const t = targetsOf(MALE);
    expect(micro(t, "fiber")?.amount).toBe(t.fiber);
  });

  test("every shown micro carries its status and source", () => {
    for (const m of targetsOf(F72).micros) {
      expect(["verified", "partial"]).toContain(m.status);
      expect(m.sourceId).toMatch(/^[OCS]\d+$/);
    }
  });
});

describe("nutritionTargets: who the reference covers", () => {
  test("adults get targets", () => {
    expect(targetCoverage(F25)).toBe("adult");
  });

  test("under-18s get none", () => {
    expect(targetCoverage({ ...F25, age: 17 })).toBe("under_18");
    expect(computeNutritionTargets({ ...F25, age: 17 })).toBeNull();
    expect(targetCoverage({ ...F25, age: 18 })).toBe("adult");
  });

  test("pregnancy and breastfeeding get none", () => {
    expect(computeNutritionTargets({ ...F25, lifeStage: "pregnant" })).toBeNull();
    expect(computeNutritionTargets({ ...F25, lifeStage: "breastfeeding" })).toBeNull();
    expect(targetCoverage({ ...F25, lifeStage: "pregnant" })).toBe("pregnancy");
  });

  test("the pregnancy answer only counts for women", () => {
    expect(targetCoverage({ ...MALE, lifeStage: "pregnant" })).toBe("adult");
    expect(normalizeHealthProfile({ ...MALE, lifeStage: "pregnant" }).lifeStage).toBeNull();
  });
});

describe("nutritionTargets: the three test users (doc value and source per target)", () => {
  // [target, expected, source ID]
  const cases: [string, HealthProfile, [string, number | null, string][]][] = [
    ["female 25, sedentary", F25, [
      ["calories", 1530, "O7"], ["protein", 57, "C1"], ["fat", 46, "C1"], ["carbs", 222, "C1"], ["fiber", 25, "O3"],
      ["sodium", 2000, "O4"], ["calcium", 800, "S1"], ["iron", 18, "O3"], ["potassium", 3500, "O8"],
      ["vitaminC", 100, "O12"], ["vitaminD", 10, "O3"],
    ]],
    ["male 35, moderately active", M35, [
      ["calories", 2490, "-"], ["protein", 93, "C1"], ["fat", 75, "C1"], ["carbs", 361, "C1"], ["fiber", 25, "O3"],
      ["sodium", 2000, "O4"], ["calcium", 800, "S1"], ["iron", 12, "S1"], ["potassium", 3500, "O8"],
      ["vitaminC", 100, "O12"], ["vitaminD", 10, "O3"],
    ]],
    ["female 72, light activity", F72, [
      ["calories", 1370, "-"], ["protein", 51, "C1"], ["fat", 41, "C1"], ["carbs", 199, "C1"], ["fiber", 25, "O3"],
      ["sodium", 2000, "O4"], ["calcium", 800, "S1"], ["iron", 10, "O3"], ["potassium", 3500, "O8"],
      ["vitaminC", 100, "O12"], ["vitaminD", null, "-"],
    ]],
  ];

  test.each(cases)("%s", (_name, profile, expected) => {
    const t = targetsOf(profile);
    for (const [key, value, source] of expected) {
      if (key === "calories" || key === "protein" || key === "fat" || key === "carbs" || key === "fiber") {
        expect([key, t[key]]).toEqual([key, value]);
      } else {
        const m = micro(t, key);
        expect([key, m?.amount ?? null]).toEqual([key, value]);
        if (m) expect([key, m.sourceId]).toEqual([key, source]);
      }
    }
    // Calories are checked against a verified EER only for the 25-year-old; the others have none.
    expect(t.eer).toBe(profile === F25 ? 1700 : null);
  });

  test("the WHO limits kept for later are in grams of the day's energy", () => {
    expect(targetsOf(F25).limits).toEqual({ freeSugar: 38, saturatedFat: 17, transFat: 1.7 });
    expect(targetsOf(M35).limits).toEqual({ freeSugar: 62, saturatedFat: 28, transFat: 2.8 });
    expect(targetsOf(F72).limits).toEqual({ freeSugar: 34, saturatedFat: 15, transFat: 1.5 });
  });
});

describe("nutritionTargets: input safety", () => {
  test("absurd inputs are clamped before use", () => {
    const p = normalizeHealthProfile({
      sex: "male",
      age: 999,
      heightCm: 9000,
      weightKg: 999,
      activityLevel: "sedentary",
      goal: "maintain",
    });
    expect(p.age).toBe(100);
    expect(p.heightCm).toBe(250);
    expect(p.weightKg).toBe(300);
  });

  test("an age typed as 0 counts as under 18, so no targets", () => {
    expect(computeNutritionTargets({ ...F25, age: 0 })).toBeNull();
  });

  test("computed targets stay finite and positive for the smallest adult body", () => {
    const t = targetsOf({ sex: "female", age: 18, heightCm: 0, weightKg: 0, activityLevel: "sedentary", goal: "lose" });
    expect(t.calories).toBeGreaterThan(0);
    expect(t.protein).toBeGreaterThan(0);
    expect(t.carbs).toBeGreaterThanOrEqual(0);
    expect(t.fat).toBeGreaterThan(0);
  });
});
