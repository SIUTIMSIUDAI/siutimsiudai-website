import { create } from "zustand";
import { persist } from "zustand/middleware";
import { persistStorage } from "./persistStorage";

// The three tiers the whole app gates on. Ranked free < pro < max in useFeatureAccess.
export type SubscriptionTier = "free" | "pro" | "max";

// A casual eater gets one AI photo log a day before the paywall taps them on the shoulder (owner,
// 2026-11-17; it was two a week, and five a week before that). Only photos count: typing, voice and
// barcode never do (utils/logMetering.ts). Exported as a constant so gating logic and the copy that
// states the number can reference it without a store read, and mirrored into state below so the store
// stays the single source of truth.
export const MAX_DAILY_FREE_AI_LOGS = 1;

// Hong Kong is a fixed UTC+8 with no daylight saving.
const HK_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// --- Pure quota-day helpers ----------------------------------------------------------------
//
// The free allowance runs by the Hong Kong calendar day: it refills at midnight in Hong Kong, the
// same day the server's AI counter uses (bump_ai_usage counts per Asia/Hong_Kong date). Kept free of
// store and clock so the policy can be unit-tested with an explicit `nowMs`. The gating hook reads
// through these (a tally from a day that has ended reports zero without mutating anything);
// incrementAiLog is the only writer that physically starts a new day's tally.

// Is today's tally still open? A null reset time means no tally has started (fresh install or just
// after a reset); a reset time at or before now means the day it was counted on has ended.
export function isQuotaCycleActive(quotaResetDate: string | null, nowMs: number): boolean {
  if (!quotaResetDate) return false;
  const resetMs = Date.parse(quotaResetDate);
  return Number.isFinite(resetMs) && nowMs < resetMs;
}

// The tally that actually applies right now. Once its day has ended this reads as zero, so a free
// user's photo log comes back at midnight even before the next write lands.
export function effectiveAiLogCount(
  aiLogCount: number,
  quotaResetDate: string | null,
  nowMs: number,
): number {
  return isQuotaCycleActive(quotaResetDate, nowMs) ? aiLogCount : 0;
}

// When today's allowance refills: the next midnight in Hong Kong after `nowMs`.
export function nextQuotaReset(nowMs: number): string {
  const hkMidnightToday = Math.floor((nowMs + HK_OFFSET_MS) / DAY_MS) * DAY_MS - HK_OFFSET_MS;
  return new Date(hkMidnightToday + DAY_MS).toISOString();
}

// Persisted-state migration. Version 0 kept a WEEKLY tally (`weeklyAiLogCount`, with a seven-day
// expiry). Carrying it into a daily allowance would lock out anyone who had used two photos that week
// for days, so the move to daily starts everyone on a fresh day: the tier is kept, the tally is not.
// The worst case is one extra free photo log on the day of the update.
export const SUBSCRIPTION_STORE_VERSION = 1;

export function migrateSubscriptionState(
  persisted: unknown,
  version: number,
): { activeTier: SubscriptionTier; aiLogCount: number; quotaResetDate: string | null } {
  const p = (persisted ?? {}) as Record<string, unknown>;
  const tier = p.activeTier;
  const activeTier: SubscriptionTier = tier === "pro" || tier === "max" || tier === "free" ? tier : "free";
  if (version < 1) return { activeTier, aiLogCount: 0, quotaResetDate: null };
  const count = Number(p.aiLogCount);
  return {
    activeTier,
    aiLogCount: Number.isFinite(count) && count >= 0 ? count : 0,
    quotaResetDate: typeof p.quotaResetDate === "string" ? p.quotaResetDate : null,
  };
}

// RevenueCat entitlement identifiers, mapped to our tiers. These strings are configured in
// the RevenueCat dashboard and, once a purchase clears, arrive inside the server-validated
// customerInfo.entitlements.active map. That server truth is the security boundary; the local
// activeTier below is only a UX mirror of it, never a gate a client can forge. Keep the keys
// here in lockstep with the dashboard's "Entitlements" setup (see services/revenueCatService).
export const ENTITLEMENT_TIER_MAP: Record<string, SubscriptionTier> = {
  pro_tier: "pro",
  max_tier: "max",
};

const TIER_RANK: Record<SubscriptionTier, number> = { free: 0, pro: 1, max: 2 };

// True for any paying tier (pro or max). The single predicate premium-only capabilities gate on,
// e.g. retaining per-meal micronutrients in history or unlocking the detailed vitamins & minerals
// panel. Pure so it can be unit-tested and read imperatively from stores that can't use the
// useFeatureAccess hook. The server entitlement stays the real boundary; this only mirrors it.
export function isPaidTier(tier: SubscriptionTier): boolean {
  return tier !== "free";
}

// The plan every brand-new account begins on. A first-time registrant has purchased nothing, so
// the local tier mirror must read "free" until — and unless — a server-validated RevenueCat
// entitlement raises it. Exported as the SINGLE definition the store's initial state AND the
// new-account reset both derive from, so the default can never silently drift to a paid plan.
export const NEW_ACCOUNT_TIER: SubscriptionTier = "free";

// How the health-profile form should present the premium daily vitamins & minerals panel.
//   values  -> show the real numbers (paid tiers only)
//   upsell  -> a locked •••• teaser with a tappable paywall prompt (free tier, where /subscription
//              is reachable, e.g. the profile-tab "Nutrition needs" sheet)
//   hidden  -> omit the panel entirely (free tier on the forced first-run setup, where the route
//              gate pins the user on /profile-setup so the paywall can't open — an inert lock there
//              would be worse than simply not surfacing premium data)
export type MicrosPresentation = "values" | "upsell" | "hidden";

// The single decision that keeps daily micronutrient figures premium-only. Paid tiers always see
// the real values; a free tier NEVER does — it only chooses between an upsell teaser and hiding the
// panel, per the screen's policy. Pure so the "free users can't see micros" guarantee is provable
// in a unit test without rendering the form or booting the paywall.
export function resolveMicrosPresentation(
  tier: SubscriptionTier,
  freeTierMode: "upsell" | "hidden",
): MicrosPresentation {
  return isPaidTier(tier) ? "values" : freeTierMode;
}

// Resolve the highest tier a customer is actually entitled to from their *active* entitlement
// ids (the keys of customerInfo.entitlements.active). Unknown ids are ignored, and an empty
// list means every subscription has lapsed, so we fall back to free. Kept pure and SDK-free so
// the entitlement policy can be unit-tested without pulling in react-native-purchases.
export function resolveTierFromEntitlements(activeEntitlementIds: string[]): SubscriptionTier {
  let best: SubscriptionTier = "free";
  for (const id of activeEntitlementIds) {
    const tier = ENTITLEMENT_TIER_MAP[id];
    if (tier && TIER_RANK[tier] > TIER_RANK[best]) best = tier;
  }
  return best;
}

interface SubscriptionState {
  activeTier: SubscriptionTier;
  // AI photo logs submitted today (Hong Kong day). Read through effectiveAiLogCount so a tally
  // from a day that has ended counts as zero without a write.
  aiLogCount: number;
  // Fixed ceiling on free AI photo logs a day. Lives in state to match the spec; never persisted,
  // so it always tracks the constant above even after an app update changes it.
  maxFreeAiLogs: number;
  // ISO timestamp today's tally expires (the next midnight in Hong Kong), or null when no tally is
  // running. Set on the first log of the day; once now passes it, the tally resets.
  quotaResetDate: string | null;
  hasHydrated: boolean;

  setTier: (tier: SubscriptionTier) => void;
  // Sync the tier from RevenueCat's server-validated active entitlements. Pass the keys of
  // customerInfo.entitlements.active; unmapped ids are ignored and an empty list resets to free.
  // This is what the CustomerInfo listener calls, so the store always mirrors the store receipt.
  setTierFromEntitlements: (activeEntitlementIds: string[]) => void;
  // Reset the local tier mirror to the free default for a brand-new account (a fresh sign-up, or
  // the account boundary when a user signs out). Tier only — never the photo-log quota. See the impl.
  resetTierForNewAccount: () => void;
  incrementAiLog: () => void;
  resetAiLogs: () => void;
  setHasHydrated: (v: boolean) => void;
}

export const useSubscriptionStore = create<SubscriptionState>()(
  persist(
    (set) => ({
      activeTier: NEW_ACCOUNT_TIER,
      aiLogCount: 0,
      maxFreeAiLogs: MAX_DAILY_FREE_AI_LOGS,
      quotaResetDate: null,
      hasHydrated: false,

      setTier: (activeTier) => set({ activeTier }),

      setTierFromEntitlements: (ids) => set({ activeTier: resolveTierFromEntitlements(ids) }),

      // Force the local tier mirror back to the free default for a brand-new account — a fresh
      // sign-up, or the account boundary the moment a user signs out. Guards two shared-device
      // leaks that live only in the persisted mirror: a previous user's paid tier, and a leftover
      // simulated-checkout purchase. Tier ONLY: the daily photo-log quota is deliberately preserved
      // so signing out and back in can't refill it. A live RevenueCat sync then raises this to the
      // real server-validated entitlement (still free for a genuine first-time user).
      resetTierForNewAccount: () => set({ activeTier: NEW_ACCOUNT_TIER }),

      incrementAiLog: () =>
        set((state) => {
          const now = Date.now();
          // First log of the day (or the last tally's day has ended): restart the tally at one,
          // expiring at the next midnight in Hong Kong.
          if (!isQuotaCycleActive(state.quotaResetDate, now)) {
            return { aiLogCount: 1, quotaResetDate: nextQuotaReset(now) };
          }
          return { aiLogCount: state.aiLogCount + 1 };
        }),

      // Wipe the tally and clear its expiry so the next log starts a fresh day.
      resetAiLogs: () => set({ aiLogCount: 0, quotaResetDate: null }),

      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
    }),
    {
      name: "siutimsiudai-subscription",
      storage: persistStorage,
      // Persist the tier and the day's tally + its expiry so an upgrade survives a reboot and the
      // free quota can't be reset by force-quitting. maxFreeAiLogs stays out on purpose.
      partialize: (s) => ({
        activeTier: s.activeTier,
        aiLogCount: s.aiLogCount,
        quotaResetDate: s.quotaResetDate,
      }),
      version: SUBSCRIPTION_STORE_VERSION,
      migrate: (persisted, version) => migrateSubscriptionState(persisted, version) as unknown as SubscriptionState,
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
