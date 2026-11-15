// Daily nutrient targets from a user's body metrics. Everything here is pure and unit-tested. The
// numbers are estimates for general guidance, not medical advice.
//
// Every value comes from a row in constants/nutrientReference.ts (the 2026-11-14 Hong Kong reference:
// Chinese DRIs 2023 for targets, WHO limits for sodium, free sugar, saturated and trans fat), and only
// rows that canShow() allows reach the result, so an unverified value is never shown.
//
// Energy keeps the Mifflin-St Jeor equation scaled by activity. Where the reference has a VERIFIED
// Chinese EER for the person's age, sex and activity, maintenance energy is kept within 10% of it
// (option 1 in section 4 of the reference). The weight goal applies after that check. Macros are
// shares of the energy inside the Chinese AMDR ranges. Targets are for adults: under-18s and anyone
// pregnant or breastfeeding get none (see targetCoverage), as section 2.6 of the reference says.

import { canShow, ReferenceRow, ReferenceUse, rowsFor } from "@/constants/nutrientReference";
import {
  ActivityLevel,
  HealthProfile,
  MicronutrientTarget,
  NutritionTargets,
  Sex,
  WeightGoal,
} from "@/types";

// Multiplier on BMR for typical weekly movement, sedentary through athlete.
const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

// Nudge maintenance energy for the chosen direction: a gentle 15% cut or 10% surplus. Applied after
// the EER check, so a goal still moves the target. Not from the reference (it has no goals); kept as
// it was on the owner's decision of 2026-11-14.
const GOAL_FACTORS: Record<WeightGoal, number> = {
  lose: 0.85,
  maintain: 1,
  gain: 1.1,
  muscle: 1.1,
};

// The app's five activity levels against the Chinese DRIs' three. The reference doesn't map them; this
// mapping is the owner's decision of 2026-11-14. Only "light" has EER values in the reference.
const PAL_FOR_ACTIVITY: Record<ActivityLevel, "light" | "moderate" | "heavy"> = {
  sedentary: "light",
  light: "light",
  moderate: "moderate",
  active: "heavy",
  very_active: "heavy",
};

// Maintenance energy stays within this share of the Chinese EER (reference section 4, option 1).
const EER_TOLERANCE = 0.1;

// Where fat sits inside its 20-30% AMDR (reference C1). Protein takes the top of its 10-15% AMDR and
// carbs take the rest, which lands inside 50-65%. Both positions are the owner's decision of 2026-11-14.
const FAT_SHARE = 0.27;

// WHO limits are % of energy in the reference; these turn them into grams.
const KCAL_PER_G = { sugar: 4, fat: 9 };

export type TargetCoverage = "adult" | "under_18" | "pregnancy";

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(Math.max(n, min), max);
}

function round10(n: number): number {
  return Math.round(n / 10) * 10;
}

// Sanitize raw inputs so a stray keystroke can't produce absurd targets.
export function normalizeHealthProfile(profile: HealthProfile): HealthProfile {
  return {
    sex: profile.sex,
    age: Math.round(clamp(profile.age, 13, 100)),
    heightCm: Math.round(clamp(profile.heightCm, 100, 250)),
    weightKg: Math.round(clamp(profile.weightKg, 25, 300)),
    activityLevel: profile.activityLevel,
    goal: profile.goal,
    // Only asked of women; ignored otherwise.
    lifeStage: profile.sex === "female" ? (profile.lifeStage ?? null) : null,
  };
}

// Mifflin-St Jeor basal metabolic rate in kcal/day.
export function mifflinStJeorBmr(profile: HealthProfile): number {
  const { weightKg, heightCm, age, sex } = normalizeHealthProfile(profile);
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(base + (sex === "male" ? 5 : -161));
}

// Who the targets cover. The reference's values are for adults; pregnancy and breastfeeding change
// needs enough that the app shows a talk-to-your-doctor note instead (owner's decision, 2026-11-14).
export function targetCoverage(profile: HealthProfile): TargetCoverage {
  const p = normalizeHealthProfile(profile);
  if (p.age < 18) return "under_18";
  if (p.lifeStage) return "pregnancy";
  return "adult";
}

// The one row of a nutrient that drives `use` for this person, if it may be shown.
function shownRow(nutrient: string, person: { age: number; sex: Sex }, use: ReferenceUse): ReferenceRow | null {
  return rowsFor(nutrient, person).find((r) => r.use === use && canShow(r)) ?? null;
}

// The verified Chinese EER this person's maintenance energy is checked against, or null where the
// reference has none verified (today: everyone outside light activity at ages 18-49).
export function referenceEer(profile: HealthProfile): ReferenceRow | null {
  const p = normalizeHealthProfile(profile);
  const pal = PAL_FOR_ACTIVITY[p.activityLevel];
  return (
    rowsFor("energy", { age: p.age, sex: p.sex }).find(
      (r) => r.use === "energy" && r.pal === pal && r.status === "verified",
    ) ?? null
  );
}

const MICRO_LABELS: Record<string, { label: string; labelZh: string; unit: string }> = {
  sodium: { label: "Sodium", labelZh: "鈉", unit: "mg" },
  fiber: { label: "Fibre", labelZh: "纖維", unit: "g" },
  calcium: { label: "Calcium", labelZh: "鈣", unit: "mg" },
  iron: { label: "Iron", labelZh: "鐵", unit: "mg" },
  potassium: { label: "Potassium", labelZh: "鉀", unit: "mg" },
  vitaminC: { label: "Vitamin C", labelZh: "維他命C", unit: "mg" },
  vitaminD: { label: "Vitamin D", labelZh: "維他命D", unit: "mcg" },
};

// The shown micro targets for an adult, in display order. A nutrient whose row can't be shown (an
// unverified or unsourced value) is left out, and the screens show its intake without a target.
export function micronutrientTargets(sex: Sex, age: number): MicronutrientTarget[] {
  const person = { sex, age: Math.round(clamp(age, 13, 100)) };
  const out: MicronutrientTarget[] = [];
  for (const key of Object.keys(MICRO_LABELS)) {
    const row = key === "sodium" ? shownRow(key, person, "limit") : shownRow(key, person, "target");
    if (!row || row.sourceId === null) continue;
    out.push({
      key,
      ...MICRO_LABELS[key],
      amount: row.value,
      isLimit: row.valueType === "limit",
      status: row.status === "verified" ? "verified" : "partial",
      sourceId: row.sourceId,
    });
  }
  return out;
}

// The headline function: body metrics in, full daily target set out. Null when the reference doesn't
// cover the person (under 18, pregnant or breastfeeding).
export function computeNutritionTargets(profile: HealthProfile): NutritionTargets | null {
  const p = normalizeHealthProfile(profile);
  if (targetCoverage(p) !== "adult") return null;

  const bmr = mifflinStJeorBmr(p);
  const tdee = Math.round(bmr * ACTIVITY_FACTORS[p.activityLevel]);
  const eer = referenceEer(p);
  const maintenance = eer
    ? Math.round(clamp(tdee, eer.value * (1 - EER_TOLERANCE), eer.value * (1 + EER_TOLERANCE)))
    : tdee;
  const calories = round10(maintenance * GOAL_FACTORS[p.goal]);

  const proteinRange = shownRow("protein", p, "target");
  const fatRange = shownRow("fat", p, "target");
  const carbsRange = shownRow("carbs", p, "target");
  if (!proteinRange?.valueMax || !fatRange || !carbsRange) {
    throw new Error("nutrientReference is missing a macro range"); // pinned by the reference tests
  }
  const protein = Math.round((calories * (proteinRange.valueMax / 100)) / 4);
  const fat = Math.round((calories * FAT_SHARE) / 9);
  // Carbs take whatever calories are left after protein (4 kcal/g) and fat (9 kcal/g).
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));

  const micros = micronutrientTargets(p.sex, p.age);
  const fiber = micros.find((m) => m.key === "fiber")?.amount ?? 0;

  // WHO limits, kept for when logging records these nutrients. Not shown today.
  const limitShare = (nutrient: string) => (shownRow(nutrient, p, "limit")?.value ?? 0) / 100;
  const limits = {
    freeSugar: Math.round((calories * limitShare("freeSugar")) / KCAL_PER_G.sugar),
    saturatedFat: Math.round((calories * limitShare("saturatedFat")) / KCAL_PER_G.fat),
    transFat: Math.round(((calories * limitShare("transFat")) / KCAL_PER_G.fat) * 10) / 10,
  };

  return { calories, protein, carbs, fat, fiber, bmr, tdee, maintenance, eer: eer?.value ?? null, micros, limits };
}
