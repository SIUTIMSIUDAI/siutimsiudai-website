import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";
import type {
  CustomerInfo,
  PurchasesError,
  PurchasesOffering,
  PurchasesPackage,
} from "react-native-purchases";
import {
  resolveTierFromEntitlements,
  SubscriptionTier,
  useSubscriptionStore,
} from "@/stores/useSubscriptionStore";
import { resolveBillingKey } from "@/utils/billingKey";
import { PurchasesSDK } from "./purchasesModule";

/**
 * RevenueCat integration for native in-app purchase across Free / Pro / Max, on both the App Store
 * (StoreKit) and Google Play (Play Billing).
 *
 * Security model (why this is safe to ship):
 *  - The key embedded here is the RevenueCat *public* (publishable) SDK key for the current
 *    platform's store. Public keys are meant to live in the client binary: they can fetch
 *    offerings and start a purchase, but they cannot read another user's data, mutate
 *    entitlements, or grant access. Only the store's signed receipt, validated on RevenueCat's
 *    servers over TLS, unlocks a tier.
 *  - The *secret* server key (sk_...) is NEVER referenced in the app. It belongs on a backend.
 *  - Entitlement truth flows one way: App Store / Play -> RevenueCat server -> `customerInfo` ->
 *    store. The local `activeTier` is only a UX mirror; a tampered client can flip a pixel, not a
 *    plan, because every gated purchase is re-validated server-side on the next `customerInfo`
 *    sync.
 *
 * Availability model (why the app never crashes without it):
 *  - On web and in Expo Go the native module is absent, so `PurchasesSDK` is null (web) or
 *    `configure()` throws (Expo Go). Either way we settle into "unavailable". Nothing here can
 *    block boot or throw uncaught.
 *  - "Unavailable" alone does not license a simulated checkout. Read it together with
 *    `isBillingConfigured`: unconfigured means demo, configured-but-unavailable means the store
 *    is unreachable and the paywall must say so instead of granting a tier for free.
 */

// Supplied at build time (EXPO_PUBLIC_ vars are inlined into the client bundle, which is correct
// for a *publishable* key). Each store has its own key and they are not interchangeable: handing
// the Android SDK an `appl_` key breaks the paywall permanently and silently. resolveBillingKey
// picks by platform and only reports a key "real" if its prefix matches that platform's store, so
// a misconfigured build falls into mock mode instead of pointing at the wrong project. See
// utils/billingKey.ts for the failure mode this prevents.
const { apiKey: API_KEY, looksReal: KEY_LOOKS_REAL } = resolveBillingKey({
  os: Platform.OS,
  appleKey: process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY,
  googleKey: process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY,
});

/**
 * True when THIS BUILD is meant to be able to take real money: a runtime that can carry the
 * compiled store module, plus a genuine publishable key for the store it will actually talk to.
 *
 * This is the paywall's `isSupabaseConfigured`, and it exists to keep the same promise the AI
 * services make: a simulated checkout is a demo stand-in, never a failure fallback. Without it the
 * paywall cannot tell "this build has no billing" from "billing is configured but unreachable
 * right now", and it answers the second case by handing out a paid tier for free.
 *
 * `PurchasesSDK != null` is deliberately NOT enough on its own. Expo Go bundles the
 * react-native-purchases JavaScript happily and only throws when a native method is called, so the
 * loader returns a non-null class there too. `executionEnvironment` is what actually separates
 * Expo Go (StoreClient) from a dev or store build.
 */
export const isBillingConfigured =
  Platform.OS !== "web" &&
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient &&
  PurchasesSDK != null &&
  KEY_LOOKS_REAL;

type Availability = "unknown" | "ready" | "unavailable";
let availability: Availability = "unknown";
let configuring: Promise<boolean> | null = null;

/** True only once the SDK is loaded, configured, and talking to a real RevenueCat project. */
export function isRevenueCatAvailable(): boolean {
  return availability === "ready";
}

// --- Error classification -------------------------------------------------------------------
// RevenueCat error codes are string enums. We match the two buckets the paywall shows distinct
// copy for and treat the rest as a generic failure. Matching raw values (not the runtime enum)
// keeps this dependency-free so it also classifies synthesized errors in mock mode.
export type PurchaseFailure = "cancelled" | "network" | "error";

const CANCELLED_CODE = "1"; // PURCHASE_CANCELLED_ERROR
const NETWORK_CODES = new Set(["10", "35", "32"]); // NETWORK_ERROR, OFFLINE_CONNECTION_ERROR, PRODUCT_REQUEST_TIMED_OUT_ERROR

function classifyError(err: unknown): PurchaseFailure {
  const e = err as Partial<PurchasesError> | undefined;
  if (e?.userCancelled === true || e?.code === CANCELLED_CODE) return "cancelled";
  if (e?.code != null && NETWORK_CODES.has(String(e.code))) return "network";
  return "error";
}

// --- Entitlement sync -----------------------------------------------------------------------
// The single funnel from RevenueCat's server-validated receipt to our store. Called by the
// update listener and after every purchase/restore so the tier always mirrors the real receipt.
function syncTierFromCustomerInfo(info: CustomerInfo): SubscriptionTier {
  const activeIds = Object.keys(info.entitlements.active);
  useSubscriptionStore.getState().setTierFromEntitlements(activeIds);
  return resolveTierFromEntitlements(activeIds);
}

/**
 * Configure RevenueCat exactly once. Idempotent and safe to call from app boot on every
 * platform: returns true only when a live SDK + real key are present, false (mock mode)
 * otherwise. Never throws.
 *
 * Pass `getCurrentUserId` as a live accessor (not a snapshot): auth may still be resolving when
 * this is called at boot, so once the SDK is ready we read it and re-identify that user. This
 * closes the race where authStore.applySession already ran identifyUser() against an unready SDK.
 */
export async function configureRevenueCat(
  getCurrentUserId?: () => string | null | undefined,
): Promise<boolean> {
  if (availability === "ready") return true;
  if (configuring) return configuring;

  configuring = (async () => {
    // No native SDK (web / Expo Go), or the build shipped without a real key: stay in mock mode.
    if (!PurchasesSDK || Platform.OS === "web" || !KEY_LOOKS_REAL) {
      availability = "unavailable";
      return false;
    }
    try {
      // Anonymous identity by default: RevenueCat mints a stable anonymous appUserID and keeps it
      // in the device keychain, so entitlements survive reinstalls with zero PII on our side.
      // When real auth lands, call Purchases.logIn(backendUserId) to move the receipt onto it.
      PurchasesSDK.configure({ apiKey: API_KEY });
      PurchasesSDK.addCustomerInfoUpdateListener(syncTierFromCustomerInfo);
      // Prime the tier from the store's current view of this device's receipt.
      const info = await PurchasesSDK.getCustomerInfo();
      syncTierFromCustomerInfo(info);
      availability = "ready";
      // Now that we're ready, associate the receipt with whoever is signed in. If auth resolved
      // first, its identifyUser() no-oped against the unready SDK; if it resolves later,
      // applySession identifies then. Either way the signed-in user's tier ends up correct.
      const currentUserId = getCurrentUserId?.();
      if (currentUserId) await identifyUser(currentUserId);
      return true;
    } catch {
      // Most commonly Expo Go, where configure() throws because the native module is absent.
      availability = "unavailable";
      return false;
    }
  })();

  const result = await configuring;
  configuring = null;
  return result;
}

// --- Identity -------------------------------------------------------------------------------
// Move this device's receipt onto the signed-in account and back to anonymous on sign-out, so a
// user's tier follows them across reinstalls and devices. Both are boot-safe no-ops until a real
// build makes the SDK available (Expo Go / web / mock mode return immediately) and never throw.
// authStore.applySession calls these on every auth state change.

/** Associate RevenueCat's receipt with our backend (Supabase) user id after sign-in. */
export async function identifyUser(appUserId: string): Promise<void> {
  if (!isRevenueCatAvailable() || !PurchasesSDK) return;
  try {
    const { customerInfo } = await PurchasesSDK.logIn(appUserId);
    syncTierFromCustomerInfo(customerInfo);
  } catch {
    // Leave the tier as-is; the update listener re-syncs on the next receipt change.
  }
}

/** Detach on sign-out: logOut returns a fresh anonymous customer, so entitlements reset to free. */
export async function forgetUser(): Promise<void> {
  if (!isRevenueCatAvailable() || !PurchasesSDK) return;
  try {
    // RevenueCat's logOut throws (and logs a noisy "current user is anonymous" console.error, which
    // surfaces as a red LogBox in dev) when there is no identified user to detach — the normal state
    // on a cold boot with no session, or right after a prior sign-out. Guard on isAnonymous() so we
    // only call logOut when a real account is actually attached. authStore already reset the local
    // tier, so the anonymous case needs nothing more from us here.
    if (await PurchasesSDK.isAnonymous()) return;
    const info = await PurchasesSDK.logOut();
    syncTierFromCustomerInfo(info);
  } catch {
    // Defensive only: the guard above prevents the common already-anonymous throw; any other transient
    // native error leaves the tier as-is, and the local reset in authStore covers that case.
  }
}

// --- Entitlement checks ---------------------------------------------------------------------
// The RevenueCat entitlement id that unlocks the Max tier. Mirrors ENTITLEMENT_TIER_MAP in
// stores/useSubscriptionStore and the dashboard's Entitlements setup.
export const MAX_ENTITLEMENT_ID = "max_tier";

/**
 * Client-side convenience check: does this device's server-validated receipt currently carry the
 * Max entitlement? Reads RevenueCat's CustomerInfo when a live SDK is present.
 *
 * This is a UX pre-check ONLY — it decides how fast the invite affordance appears, nothing more.
 * The real, unspoofable Max gate lives in the create-family-invite Edge Function, which re-verifies
 * the entitlement with the RevenueCat SECRET key server-side before it will mint an invite. Returns
 * false in mock mode (web / Expo Go), where the family screen falls back to the local activeTier
 * mirror instead. Never throws.
 */
export async function hasActiveMaxEntitlement(): Promise<boolean> {
  if (!isRevenueCatAvailable() || !PurchasesSDK) return false;
  try {
    const info = await PurchasesSDK.getCustomerInfo();
    return Boolean(info.entitlements.active[MAX_ENTITLEMENT_ID]);
  } catch {
    return false;
  }
}

// --- Offerings ------------------------------------------------------------------------------
// Normalized shape the paywall renders. Each tier may expose a monthly and/or annual package
// with a store-localized price string (e.g. "HK$48", "US$5.99") straight from StoreKit.
export interface TierOption {
  package: PurchasesPackage;
  priceString: string;
}
export interface TierPricing {
  monthly: TierOption | null;
  annual: TierOption | null;
}
export interface LiveOfferings {
  pro: TierPricing;
  max: TierPricing;
}

function offeringToPricing(offering: PurchasesOffering | null | undefined): TierPricing {
  const toOption = (p: PurchasesPackage | null): TierOption | null =>
    p ? { package: p, priceString: p.product.priceString } : null;
  if (!offering) return { monthly: null, annual: null };
  return { monthly: toOption(offering.monthly), annual: toOption(offering.annual) };
}

/**
 * Fetch and normalize the current offerings. Returns null in mock mode or on any failure, which
 * the paywall reads as "use the built-in HK$ fallback prices". Convention: the dashboard exposes
 * one offering per paid tier keyed "pro" and "max"; a single-offering project falls back to
 * `current` for both so the screen still shows live prices rather than blanks.
 */
export async function getSubscriptionOfferings(): Promise<LiveOfferings | null> {
  if (!isRevenueCatAvailable() || !PurchasesSDK) return null;
  try {
    const offerings = await PurchasesSDK.getOfferings();
    const proOffering = offerings.all["pro"] ?? offerings.current ?? null;
    const maxOffering = offerings.all["max"] ?? offerings.current ?? null;
    return {
      pro: offeringToPricing(proOffering),
      max: offeringToPricing(maxOffering),
    };
  } catch {
    return null;
  }
}

// --- Purchase / restore ---------------------------------------------------------------------
export type PurchaseResult =
  | { ok: true; tier: SubscriptionTier }
  | { ok: false; reason: PurchaseFailure };

/** Buy a package. On success the store tier is synced from the returned, server-validated receipt. */
export async function purchaseSubscription(pkg: PurchasesPackage): Promise<PurchaseResult> {
  if (!isRevenueCatAvailable() || !PurchasesSDK) return { ok: false, reason: "error" };
  try {
    const { customerInfo } = await PurchasesSDK.purchasePackage(pkg);
    return { ok: true, tier: syncTierFromCustomerInfo(customerInfo) };
  } catch (err) {
    return { ok: false, reason: classifyError(err) };
  }
}

/** Restore prior purchases (App Store account is the source of truth) and re-sync the tier. */
export async function restoreSubscription(): Promise<PurchaseResult> {
  if (!isRevenueCatAvailable() || !PurchasesSDK) return { ok: false, reason: "error" };
  try {
    const customerInfo = await PurchasesSDK.restorePurchases();
    return { ok: true, tier: syncTierFromCustomerInfo(customerInfo) };
  } catch (err) {
    return { ok: false, reason: classifyError(err) };
  }
}
