// Time-based history gating, pure and timezone-stable. Extracted from hooks/useFeatureAccess so
// non-React code (the nutrition sync scope) can reuse it without importing a hook module.
//
// The logbook is free for the current day only: a free user records and reviews today's intake,
// but every past day is a Pro perk. Paid tiers read the whole history. The window is whole
// calendar days, parsed at local midnight, so it never drifts by a few hours across a boundary.

import { todayKey } from "./formatters";

export const HISTORY_WINDOW_DAYS = 1;

/**
 * Whole calendar days from `dateKey` back to `today` (both yyyy-mm-dd). Today is 0, yesterday is 1,
 * a future date is negative. Pure and timezone-stable.
 */
export function daysAgo(dateKey: string, today: string = todayKey()): number {
  const then = new Date(`${dateKey}T00:00:00`).getTime();
  const now = new Date(`${today}T00:00:00`).getTime();
  return Math.round((now - then) / 86_400_000);
}

/**
 * Is `dateKey` inside the free window? With a one-day window that means today only. Future dates
 * count as inside, so a forward-dated entry is never accidentally locked.
 */
export function isWithinHistoryWindow(dateKey: string, today: string = todayKey()): boolean {
  return daysAgo(dateKey, today) <= HISTORY_WINDOW_DAYS - 1;
}
