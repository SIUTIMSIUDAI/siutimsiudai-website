/**
 * Which RevenueCat publishable key this build should use, and whether it is usable at all.
 *
 * This lives here, apart from the service, because picking the wrong one does not fail loudly.
 * It fails as a permanently broken paywall, and only on the platform you are not testing on.
 *
 * The bug this exists to prevent (it shipped in the iOS-only era and would have reached the first
 * Android build):
 *
 *     PurchasesSDK.configure({ apiKey: APPLE_API_KEY });   // on EVERY platform
 *
 * RevenueCat's Android SDK rejects an `appl_` key. The damage is not the rejection, it is what our
 * own availability model then concludes. The old `KEY_LOOKS_REAL` only asked "does this look like a
 * genuine Apple key", which on Android is true, so `isBillingConfigured` stayed true, `configure()`
 * threw, and availability settled on "unavailable". Per the rule in utils/paywallCta.ts,
 * configured-but-unavailable means "the store is unreachable, refuse the sale". So every Android
 * user would see a dead paywall that never recovers, forever, and no error anywhere would say why.
 *
 * The fix is that "real" is a per-platform question. A key is only real if it carries the prefix
 * belonging to the platform it is about to be handed to.
 */

/** RevenueCat's publishable key prefixes, by the platform whose store they talk to. */
const PREFIX: Record<string, string> = {
  ios: "appl_",
  macos: "appl_",
  android: "goog_",
};

/**
 * Stand-ins that must never be mistaken for a real key: the in-code defaults below and the
 * `.env.example` stubs (`appl_xxxx...x`, `goog_xxxx...x`). A genuine publishable key is random
 * base62 and never contains "PLACEHOLDER" or a long run of x's, so this only screens out stubs.
 */
const PLACEHOLDER = /placeholder|x{8,}/i;

const FALLBACK: Record<string, string> = {
  ios: "appl_PLACEHOLDER_NOT_CONFIGURED",
  macos: "appl_PLACEHOLDER_NOT_CONFIGURED",
  android: "goog_PLACEHOLDER_NOT_CONFIGURED",
};

export interface BillingKeyInput {
  /** `Platform.OS`. Anything without a store (web, windows) resolves to unusable. */
  os: string;
  /** EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY as supplied at build time. */
  appleKey?: string;
  /** EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY as supplied at build time. */
  googleKey?: string;
}

export interface BillingKey {
  /**
   * The key to hand `Purchases.configure()`. Always a string so callers need no null handling,
   * but only safe to actually use when `looksReal` is true.
   */
  apiKey: string;
  /** True only when `apiKey` is a genuine publishable key FOR THIS PLATFORM's store. */
  looksReal: boolean;
}

/**
 * Resolve the key for one platform.
 *
 * Deliberately strict in both directions: an Apple key on Android is just as wrong as a missing
 * one, and both must return `looksReal: false` so the build falls into mock mode rather than
 * handing RevenueCat something it will reject at boot.
 */
export function resolveBillingKey(input: BillingKeyInput): BillingKey {
  const { os, appleKey, googleKey } = input;

  const prefix = PREFIX[os];
  // No store on this platform (web, windows). Nothing to configure, nothing to sell.
  if (!prefix) return { apiKey: "", looksReal: false };

  const supplied = os === "android" ? googleKey : appleKey;
  const apiKey = supplied ?? FALLBACK[os];
  const looksReal = apiKey.startsWith(prefix) && !PLACEHOLDER.test(apiKey);

  return { apiKey, looksReal };
}
