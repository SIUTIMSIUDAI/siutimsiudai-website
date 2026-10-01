import { todayKey } from "@/utils/formatters";

// Date ranges for the History report's calendar. Days are local calendar days as YYYY-MM-DD keys,
// and weeks run Monday to Sunday like weekDates() elsewhere in the app.

// An inclusive span of days.
export interface DateRange {
  from: string;
  to: string;
}

export type RangePreset = "today" | "thisWeek" | "last7" | "last30";

// The longest span the report averages over.
export const MAX_RANGE_DAYS = 90;

export function addDays(dateKey: string, n: number): string {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + n);
  return todayKey(d);
}

function mondayOf(dateKey: string): string {
  const day = new Date(`${dateKey}T00:00:00`).getDay();
  return addDays(dateKey, -((day + 6) % 7));
}

export function presetRange(preset: RangePreset, today: string): DateRange {
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "thisWeek":
      return { from: mondayOf(today), to: today };
    case "last7":
      return { from: addDays(today, -6), to: today };
    case "last30":
      return { from: addDays(today, -29), to: today };
  }
}

// The preset a range matches, for its label. Checked simplest first, so a Monday's "this week"
// reads as "Today" and a Sunday's as "Last 7 days".
export function matchPreset(range: DateRange, today: string): RangePreset | null {
  const order: RangePreset[] = ["today", "last7", "last30", "thisWeek"];
  for (const preset of order) {
    const r = presetRange(preset, today);
    if (r.from === range.from && r.to === range.to) return preset;
  }
  return null;
}

export function datesInRange(range: DateRange): string[] {
  const out: string[] = [];
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) out.push(d);
  return out;
}

// Puts two picked days in order and keeps the span within MAX_RANGE_DAYS, keeping the later end.
export function normaliseRange(a: string, b: string): DateRange {
  const [from, to] = a <= b ? [a, b] : [b, a];
  const earliest = addDays(to, -(MAX_RANGE_DAYS - 1));
  return { from: from < earliest ? earliest : from, to };
}

// One month as calendar cells, Monday first, padded with null to whole weeks. month is 0 to 11.
export function monthGrid(year: number, month: number): (string | null)[] {
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(todayKey(new Date(year, month, day)));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
