import { DailyLog, NutritionTargets } from "@/types";
import { effectiveMacros } from "@/utils/customizations";
import { sumMicroTotals, TRACKED_MICRO_KEYS, TRACKED_MICRO_META, TrackedMicroKey } from "@/utils/micros";

// The History report: how a range of days compared with the user's own targets. A day counts only
// if something was logged on it, so a skipped day never drags an average down, and today counts
// only when it is the whole range, because a day still in progress always looks short.

export type ReportNutrientKey = "calories" | "protein" | "carbs" | "fat" | "fiber" | TrackedMicroKey;

// The order rows show in when there is no target to rank them by.
export const REPORT_NUTRIENT_KEYS: readonly ReportNutrientKey[] = [
  "calories",
  "protein",
  "carbs",
  "fat",
  "fiber",
  ...TRACKED_MICRO_KEYS,
];

// Calories, carbs and fat are budgets: on target within 10% either way. Protein, fibre, vitamins and
// minerals are floors: on target from 90% up, and eating more is never a miss.
const BAND: ReadonlySet<ReportNutrientKey> = new Set(["calories", "carbs", "fat"]);
const ON_TARGET_LOW = 0.9;
const ON_TARGET_HIGH = 1.1;

export type TargetStatus = "on" | "under" | "over";

export function targetStatus(key: ReportNutrientKey, value: number, target: number): TargetStatus {
  const ratio = value / target;
  if (ratio < ON_TARGET_LOW) return "under";
  if (BAND.has(key) && ratio > ON_TARGET_HIGH) return "over";
  return "on";
}

export interface DayNutrients {
  dateKey: string;
  logged: boolean;
  values: Record<ReportNutrientKey, number>;
}

function zeroValues(): Record<ReportNutrientKey, number> {
  const values = {} as Record<ReportNutrientKey, number>;
  for (const key of REPORT_NUTRIENT_KEYS) values[key] = 0;
  return values;
}

// One day's effective totals: each meal's 少甜 / 少底 tweaks applied, the same numbers the day view
// shows, plus the tracked micronutrients.
export function dayNutrients(logsByDate: Record<string, DailyLog>, dateKey: string): DayNutrients {
  const entries = logsByDate[dateKey]?.entries ?? [];
  const values = zeroValues();
  for (const e of entries) {
    const m = effectiveMacros(e, e.customizations);
    values.calories += m.calories;
    values.protein += m.protein;
    values.carbs += m.carbs;
    values.fat += m.fat;
    values.fiber += m.fiber;
  }
  const micros = sumMicroTotals(entries);
  for (const key of TRACKED_MICRO_KEYS) values[key] = micros[key];
  return { dateKey, logged: entries.length > 0, values };
}

// The user's daily target for a nutrient, or null when there is none (no health profile yet).
export function targetFor(key: ReportNutrientKey, targets: NutritionTargets | null): number | null {
  if (!targets) return null;
  const amount =
    key === "calories" || key === "protein" || key === "carbs" || key === "fat" || key === "fiber"
      ? targets[key]
      : targets.micros.find((m) => m.key === key)?.amount;
  return amount != null && amount > 0 ? amount : null;
}

export interface ReportRow {
  key: ReportNutrientKey;
  // Per counted day. Null when no day in the range counts.
  average: number | null;
  target: number | null;
  // The average as a percentage of the target.
  percent: number | null;
  status: TargetStatus | null;
  daysOnTarget: number;
  daysCounted: number;
}

export interface NutrientReport {
  // Biggest gap from target first.
  rows: ReportRow[];
  daysCounted: number;
  daysInRange: number;
}

// The days that count towards averages: logged ones, without today unless it is the whole range.
export function countedDays(days: DayNutrients[], today: string): DayNutrients[] {
  const todayAlone = days.length === 1;
  return days.filter((d) => d.logged && (todayAlone || d.dateKey !== today));
}

// How far a row sits from its target, in percentage points. Going over a floor is no gap, and rows
// without a target sort last.
function gapOf(row: ReportRow): number {
  if (row.percent == null) return -1;
  return BAND.has(row.key) ? Math.abs(row.percent - 100) : Math.max(0, 100 - row.percent);
}

export function buildReport(
  days: DayNutrients[],
  targets: NutritionTargets | null,
  today: string,
): NutrientReport {
  const counted = countedDays(days, today);
  const rows = REPORT_NUTRIENT_KEYS.map((key): ReportRow => {
    const target = targetFor(key, targets);
    if (counted.length === 0) {
      return { key, average: null, target, percent: null, status: null, daysOnTarget: 0, daysCounted: 0 };
    }
    const average = counted.reduce((sum, d) => sum + d.values[key], 0) / counted.length;
    if (target == null) {
      return { key, average, target, percent: null, status: null, daysOnTarget: 0, daysCounted: counted.length };
    }
    return {
      key,
      average,
      target,
      percent: (average / target) * 100,
      status: targetStatus(key, average, target),
      daysOnTarget: counted.filter((d) => targetStatus(key, d.values[key], target) === "on").length,
      daysCounted: counted.length,
    };
  });
  const sorted = rows
    .map((row, index) => ({ row, index, gap: gapOf(row) }))
    .sort((a, b) => b.gap - a.gap || a.index - b.index)
    .map((x) => x.row);
  return { rows: sorted, daysCounted: counted.length, daysInRange: days.length };
}

// The one or two nutrients furthest off target on average, for the summary line.
export function biggestGaps(report: NutrientReport): ReportNutrientKey[] {
  return report.rows
    .filter((r) => r.status === "under" || r.status === "over")
    .slice(0, 2)
    .map((r) => r.key);
}

export function nutrientUnit(key: ReportNutrientKey): string {
  if (key === "calories") return "kcal";
  if (key === "protein" || key === "carbs" || key === "fat" || key === "fiber") return "g";
  return TRACKED_MICRO_META[key].unit;
}

// Whole numbers from 10 up (with thousands separators), one decimal below, so 1.8 mcg of vitamin D
// does not read as 2.
export function formatNutrientAmount(key: ReportNutrientKey, value: number): string {
  if (key === "calories" || value >= 10) return Math.round(value).toLocaleString("en-US");
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
