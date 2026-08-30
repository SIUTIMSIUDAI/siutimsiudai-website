// Pure helpers for editing a food entry's time of day as a plain HH:MM field.
//
// A FoodEntry stores loggedAt as a full ISO instant. The edit sheet only lets the user change the
// clock time, never the calendar day, so these helpers convert between that instant and a local
// "HH:MM" string. Everything is done in LOCAL time (getHours/setHours), because the field shows the
// wall-clock time the user actually ate, matching shortTime() in formatters.ts.

const HHMM = /^(\d{1,2}):(\d{2})$/;

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
