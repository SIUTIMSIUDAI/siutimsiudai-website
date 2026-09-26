// Pure helpers for editing a food entry's time of day as a plain HH:MM field.
//
// A FoodEntry stores loggedAt as a full ISO instant. The edit sheet only lets the user change the
// clock time, never the calendar day, so these helpers convert between that instant and a local
// "HH:MM" string. Everything is done in LOCAL time (getHours/setHours), because the field shows the
// wall-clock time the user actually ate, matching shortTime() in formatters.ts.

import type { MealType } from "@/types";

const HHMM = /^(\d{1,2}):(\d{2})$/;
const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

// When a forgotten meal is added to a past day, the moment it was typed in says nothing about when
// it was eaten, so it gets a typical time for its meal instead. The edit sheet can change it after.
const BACKFILL_TIME: Record<MealType, { h: number; m: number }> = {
  breakfast: { h: 8, m: 0 },
  lunch: { h: 13, m: 0 },
  snack: { h: 15, m: 30 },
  dinner: { h: 19, m: 30 },
};

// The loggedAt instant for a new entry filed under `dateKey`: the real clock for today, otherwise the
// meal's typical local time on that day. Falls back to the real clock for an unparseable key rather
// than building an Invalid Date, whose toISOString() would throw inside the store's save path.
export function loggedAtFor(dateKey: string, mealType: MealType, now: Date, today: string): string {
  const match = DATE_KEY.exec(dateKey);
  if (dateKey === today || !match) return now.toISOString();
  const { h, m } = BACKFILL_TIME[mealType];
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), h, m, 0, 0).toISOString();
}

// A day's meals in the order they were eaten. A forgotten meal is entered after the fact, so entry
// order stops matching meal order once backfill exists. Ties keep entry order through an explicit
// index tie-break rather than relying on the engine's sort being stable. Returns a new array: a
// store's arrays must never be sorted in place.
export function sortByLoggedAt<T extends { loggedAt: string }>(entries: readonly T[]): T[] {
  return entries
    .map((entry, index) => ({ entry, index, time: new Date(entry.loggedAt).getTime() }))
    .sort((a, b) => a.time - b.time || a.index - b.index)
    .map(({ entry }) => entry);
}

// Parse a user-typed "HH:MM" into hour/minute, or null if it is malformed or out of range.
// Minutes must be two digits (":5" is a typo, not 05); the hour may be one or two.
export function parseTimeOfDay(raw: string): { h: number; m: number } | null {
  const match = HHMM.exec(raw.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return { h, m };
}

// Render an ISO instant as a local zero-padded "HH:MM". Returns "" for an unparseable instant so a
// caller prefilling a field degrades to blank (which reads as "not set") rather than "NaN:NaN".
export function formatTimeOfDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

// Return a new ISO instant with the time of day set from `raw`, keeping the original local calendar
// date. Returns null when the time string is invalid or the base instant cannot be parsed, so the
// caller can refuse to save rather than write a bad timestamp. Seconds and milliseconds are zeroed
// so an edited entry reads as a clean minute.
export function applyTimeOfDay(iso: string, raw: string): string | null {
  const parsed = parseTimeOfDay(raw);
  if (!parsed) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(parsed.h, parsed.m, 0, 0);
  return d.toISOString();
}
