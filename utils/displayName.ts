// The user-chosen name shown on the family roster (the "how should we call you?" field). Kept as
// pure logic so both the onboarding health-profile step and the Profile tab clean input the same
// way before it reaches profiles.display_name.

// A roster row is one line; 30 characters is generous for a real name or nickname while stopping a
// single member from stretching the layout. Chinese names sit well within it.
export const DISPLAY_NAME_MAX = 30;

/**
 * Clean a raw name field into what we store, or null when there is nothing worth storing.
 * Trims, collapses internal whitespace runs to a single space, then caps the length (trimming again
 * so a cut that lands inside a run of spaces leaves no trailing gap). Returns null for an empty or
 * whitespace-only input so the caller stores null and the roster shows its "Family member" fallback.
 */
export function normaliseDisplayName(raw: string): string | null {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  const capped = collapsed.slice(0, DISPLAY_NAME_MAX).trim();
  return capped || null;
}
