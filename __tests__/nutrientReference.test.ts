import { canShow, NUTRIENT_REFERENCE, ReferenceRow, rowsFor, SIGN_IN_ONLY_SOURCES } from "@/constants/nutrientReference";
import { computeNutritionTargets } from "@/utils/nutritionTargets";
import { TRACKED_MICRO_META } from "@/utils/micros";
import { ActivityLevel, HealthProfile, Sex, WeightGoal } from "@/types";

// The reference table is copied from Part A of the 2026-11-14 Hong Kong reference. These pin its
// shape and, above all, the rule that nothing unverified or unsourced ever reaches a target.

// Every source ID the reference doc lists in its section 6, plus O12 (China CDC Weekly 2024), added on
// 2026-11-15 to confirm the vitamin C figure.
const DOC_SOURCES = new Set([
  ...Array.from({ length: 12 }, (_, i) => `O${i + 1}`),
  ...Array.from({ length: 17 }, (_, i) => `C${i + 1}`),
  "S1",
  "S2",
  "S3",
  "S4",
]);

// The units food logging records, which a shown target must use (types EntryMicronutrients, MacroNutrients).
const LOGGING_UNITS: Record<string, string> = {
  sodium: "mg",
  fiber: "g",
  calcium: "mg",
  iron: "mg",
  potassium: "mg",
  vitaminC: "mg",
  vitaminD: "mcg",
};

const AGES = Array.from({ length: 83 }, (_, i) => 18 + i); // 18 to 100
const SEXES: Sex[] = ["male", "female"];
const ACTIVITIES: ActivityLevel[] = ["sedentary", "light", "moderate", "active", "very_active"];
const GOALS: WeightGoal[] = ["lose", "maintain", "gain", "muscle"];

function everyAdult(): HealthProfile[] {
  const out: HealthProfile[] = [];
  for (const age of AGES)
    for (const sex of SEXES)
      for (const activityLevel of ACTIVITIES)
        for (const goal of GOALS) out.push({ sex, age, heightCm: 165, weightKg: 60, activityLevel, goal });
  return out;
}

// The row a shown micro target came from.
function rowBehind(key: string, age: number, sex: Sex): ReferenceRow | undefined {
  const use = key === "sodium" ? "limit" : "target";
  return rowsFor(key, { age, sex }).find((r) => r.use === use && canShow(r));
}

describe("nutrientReference: the table", () => {
  // 2026-11-17: calcium, iron (three rows) and vitamin D (two rows) were checked in the DRIs 2023 book.
  test("holds the 72 rows of Part A: 31 verified (2 by O12, 6 in the DRIs 2023 book), 9 partial, 32 unverified", () => {
    expect(NUTRIENT_REFERENCE).toHaveLength(72);
    const count = (s: string) => NUTRIENT_REFERENCE.filter((r) => r.status === s).length;
    expect([count("verified"), count("partial"), count("unverified")]).toEqual([31, 9, 32]);
  });

  test.each(NUTRIENT_REFERENCE.map((r, i) => [i + 1, r] as const))("row %i is well formed", (_i, r) => {
    expect(["verified", "partial", "unverified"]).toContain(r.status);
    expect(["target", "limit", "energy", "ul", "none"]).toContain(r.use);
    expect(r.ageMin).toBeGreaterThanOrEqual(18);
    if (r.ageMax !== null) expect(r.ageMax).toBeGreaterThanOrEqual(r.ageMin);
    if (r.valueMax !== null) expect(r.valueMax).toBeGreaterThan(r.value);
    if (r.sourceId !== null) expect(DOC_SOURCES.has(r.sourceId)).toBe(true);
    expect(r.value).toBeGreaterThanOrEqual(0);
  });

  test("only 12 rows can drive a shown target", () => {
    expect(NUTRIENT_REFERENCE.filter((r) => r.use === "target" && canShow(r))).toHaveLength(12);
  });

  // Vitamin D at 65+ was hidden while S2 (sign-in only) was its only source; the DRIs 2023 book (O6)
  // confirmed 15 mcg on 2026-11-17, and the owner chose to show it with the book's citation.
  test("vitamin D at 65+ is shown from the book, and a row citing a sign-in source never is", () => {
    const vitD65 = NUTRIENT_REFERENCE.find((r) => r.nutrient === "vitaminD" && r.ageMin === 65 && r.use === "target")!;
    expect(vitD65).toMatchObject({ value: 15, status: "verified", sourceId: "O6" });
    expect(canShow(vitD65)).toBe(true);
    for (const r of NUTRIENT_REFERENCE.filter((r) => r.sourceId && SIGN_IN_ONLY_SOURCES.has(r.sourceId))) {
      expect(canShow(r)).toBe(false);
    }
  });

  test("an unverified row can never be shown", () => {
    for (const r of NUTRIENT_REFERENCE.filter((r) => r.status === "unverified")) expect(canShow(r)).toBe(false);
  });

  test("a row with no source can never be shown, even if the doc tags it partial", () => {
    const protein = NUTRIENT_REFERENCE.filter((r) => r.nutrient === "protein" && r.valueType === "RNI");
    expect(protein.some((r) => r.status === "partial" && r.sourceId === null)).toBe(true);
    for (const r of NUTRIENT_REFERENCE.filter((r) => r.sourceId === null)) expect(canShow(r)).toBe(false);
  });

  test("energy checks use only light-activity EER rows", () => {
    for (const r of NUTRIENT_REFERENCE.filter((r) => r.use === "energy")) {
      expect(r.valueType).toBe("EER");
      expect(r.pal).toBe("light");
    }
  });

  test("Part B never appears: no row cites a Part B-only source", () => {
    // C2-C8, C10-C17 and O9-O11 back only Part B (what people eat) or section 4.
    const partBOnly = ["C2", "C3", "C4", "C5", "C6", "C7", "C8", "C10", "C11", "C12", "C13", "C14", "C15", "C16", "C17", "O9", "O10", "O11"];
    for (const r of NUTRIENT_REFERENCE) expect(partBOnly).not.toContain(r.sourceId);
  });
});

describe("nutrientReference: every adult's targets", () => {
  const adults = everyAdult();

  test("every shown micro traces to a verified or partial row with a source, in the logging unit", () => {
    for (const p of adults) {
      const t = computeNutritionTargets(p)!;
      for (const m of t.micros) {
        const row = rowBehind(m.key, p.age, p.sex);
        expect(row).toBeDefined();
        expect(row!.status).not.toBe("unverified");
        expect(row!.sourceId).not.toBeNull();
        expect(m.amount).toBe(row!.value);
        expect(m.sourceId).toBe(row!.sourceId);
        expect(SIGN_IN_ONLY_SOURCES.has(m.sourceId)).toBe(false);
        expect(m.unit).toBe(LOGGING_UNITS[m.key]);
        expect(row!.unit).toBe(LOGGING_UNITS[m.key]);
      }
    }
  });

  test("vitamin C shows 100 mg, traced to O12, for every adult", () => {
    for (const p of adults) {
      const c = computeNutritionTargets(p)!.micros.find((m) => m.key === "vitaminC");
      expect(c?.amount).toBe(100);
      expect(c?.sourceId).toBe("O12");
    }
  });

  test("the tracked micros' units match the tracker's", () => {
    for (const [key, meta] of Object.entries(TRACKED_MICRO_META)) expect(meta.unit).toBe(LOGGING_UNITS[key]);
  });

  test("no shown target is above its upper intake level", () => {
    for (const p of adults) {
      const t = computeNutritionTargets(p)!;
      for (const m of t.micros) {
        const ul = rowsFor(m.key, { age: p.age, sex: p.sex }).find((r) => r.use === "ul");
        if (ul) expect(m.amount).toBeLessThan(ul.value);
      }
    }
    // The three ULs the check uses exist (calcium 2,000 mg, iron 42 mg, vitamin D 50 mcg).
    expect(NUTRIENT_REFERENCE.filter((r) => r.use === "ul").map((r) => r.nutrient).sort()).toEqual(
      ["calcium", "iron", "vitaminA", "vitaminD"].sort(),
    );
  });

  test("protein, fat and carbs stay inside their Chinese AMDR ranges", () => {
    for (const p of adults) {
      const t = computeNutritionTargets(p)!;
      const share = (grams: number, kcalPerG: number) => (grams * kcalPerG * 100) / t.calories;
      expect(share(t.protein, 4)).toBeGreaterThanOrEqual(10 - 0.5);
      expect(share(t.protein, 4)).toBeLessThanOrEqual(15 + 0.5);
      expect(share(t.fat, 9)).toBeGreaterThanOrEqual(20);
      expect(share(t.fat, 9)).toBeLessThanOrEqual(30);
      expect(share(t.carbs, 4)).toBeGreaterThanOrEqual(50);
      expect(share(t.carbs, 4)).toBeLessThanOrEqual(65);
    }
  });

  test("energy is checked only against a verified EER", () => {
    for (const p of adults) {
      const t = computeNutritionTargets(p)!;
      if (t.eer === null) {
        expect(t.maintenance).toBe(t.tdee);
      } else {
        const row = rowsFor("energy", { age: p.age, sex: p.sex }).find((r) => r.value === t.eer);
        expect(row?.status).toBe("verified");
        expect(Math.abs(t.maintenance - t.eer)).toBeLessThanOrEqual(t.eer * 0.1 + 0.5);
      }
    }
  });
});
