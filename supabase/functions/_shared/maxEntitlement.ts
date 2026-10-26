// The server-side Max check, shared by every Edge Function that gives out a Max feature
// (create-family-invite, plan-week). The device's own idea of its plan can be tampered with, so these
// functions ask RevenueCat with the SECRET key instead, which lives only in this runtime:
//     supabase secrets set REVENUECAT_SECRET_KEY=sk_xxx
// Never commit or echo that value.
//
// Runs in the Supabase Deno runtime, excluded from the app tsconfig.

// The entitlement id that unlocks Max. Mirrors ENTITLEMENT_TIER_MAP in stores/useSubscriptionStore
// and MAX_ENTITLEMENT_ID in services/revenueCatService. Self-contained here: the Edge runtime cannot
// import the app's modules.
export const MAX_ENTITLEMENT_ID = "max_tier";

/**
 * Whether this app user currently holds an active Max entitlement. The client keys the RevenueCat
 * subscriber by the Supabase user id (Purchases.logIn(userId) in identifyUser), so the subscriber is
 * looked up by that same id. Returns "error" (distinct from false) so the caller can fail closed on
 * any transport or API problem rather than silently treating it as "not Max".
 */
export async function hasActiveMax(appUserId: string, secretKey: string): Promise<boolean | "error"> {
  try {
    const res = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
      { headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" } },
    );
    if (!res.ok) return "error";
    const body = await res.json();
    const ent = body?.subscriber?.entitlements?.[MAX_ENTITLEMENT_ID];
    if (!ent) return false;
    // A null expiry is a non-expiring grant; otherwise it must be in the future to count as active.
    const expires = ent.expires_date as string | null | undefined;
    return expires == null || Date.parse(expires) > Date.now();
  } catch {
    return "error";
  }
}
