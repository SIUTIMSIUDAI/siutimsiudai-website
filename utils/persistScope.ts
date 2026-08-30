// Pure, dependency-free helpers for per-account storage scoping. Kept free of AsyncStorage and any
// store so the key math is trivially unit-testable (see utils/__tests__/persistScope.test.ts) and
// safe to import from both the storage layer (stores/persistStorage.ts) and the scope orchestrator
// (stores/dataScope.ts).
//
// Why this exists: every personal Zustand store used to persist under a fixed, non-user key (e.g.
// "siutimsiudai-nutrition"), so two accounts signing in on the SAME device shared one on-device
// diary/pantry/recipe box. Switching accounts mixed one person's meals into another's log, and the
// diary sync then uploaded the leftover entries under the wrong account. Scoping personal keys by
// the signed-in user fixes both: each account reads and writes its own "<key>__u_<userId>" copy.

// The persisted stores that hold a user's own content, and so must be keyed per account. Device
// preferences (siutimsiudai-app: locale / units / onboarding), the subscription mirror and the
// ephemeral cart-run are intentionally NOT here: they are per-device or reset by their own path.
// MUST stay in lockstep with every store name below and with authStore's account-deletion wipe.
export const PERSONAL_DATA_KEYS = [
  "siutimsiudai-nutrition",
  "siutimsiudai-recipes",
  "siutimsiudai-pantry",
  "siutimsiudai-meal-plan",
  "siutimsiudai-grocery",
  "siutimsiudai-saved-meals",
  "siutimsiudai-family",
] as const;

const PERSONAL_KEY_SET: ReadonlySet<string> = new Set(PERSONAL_DATA_KEYS);

/** True for a store whose data belongs to one account and must be namespaced by user. */
export function isPersonalKey(name: string): boolean {
  return PERSONAL_KEY_SET.has(name);
}

/** The physical AsyncStorage key a personal store uses for one specific account. */
export function scopedKeyFor(name: string, userId: string): string {
  return `${name}__u_${userId}`;
}

/**
 * The physical storage key for `name` under the active account scope. Personal stores are keyed by
 * the signed-in user; every non-personal store, and the signed-out "guest" scope, uses the bare key
 * (which is also where any pre-scoping data already sits, so a first sign-in can adopt it).
 */
export function resolveScopedKey(name: string, scope: string | null | undefined): string {
  if (scope && isPersonalKey(name)) return scopedKeyFor(name, scope);
  return name;
}

/**
 * Whether a personal key's pre-scoping (bare) value should be folded into an account's scoped key:
 * only when the account has no scoped copy yet AND there is bare data to move. Never overwrites an
 * existing scoped copy, so a returning account keeps its own data.
 */
export function shouldAdoptKey(
  scopedValue: string | null | undefined,
  bareValue: string | null | undefined,
): boolean {
  return scopedValue == null && bareValue != null;
}
