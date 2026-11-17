import { useCallback } from "react";
import { router } from "expo-router";
import {
  SubscriptionTier,
  effectiveAiLogCount,
  useSubscriptionStore,
} from "@/stores/useSubscriptionStore";

// Every gated capability in the app, keyed by a stable string and grouped by the tier that
// unlocks it. Add a row here plus one line in FEATURE_MIN_TIER and any surface can gate on
// it without touching the store or this hook's return shape.
export type Feature =
  // Free — the daily habit every casual eater gets
  | "total_calories"
  | "ai_log"
  | "local_metrics"
  | "local_checklist"
  // Pro — the Healthy Foodie kit
  | "unlimited_ai"
  | "macro_drawer"
  | "micro_tracker"
  | "recipe_modifier"
  | "url_scraper"
  | "wet_market_units"
  | "pantry_suggest"
  | "receipt_scan"
  | "photo_recipe"
  | "meal_history"
  | "backfill_log"
  // Max — the Household Executive suite
  | "family_sync"
  | "household_calendar"
  | "grocery_export"
  | "family_meal_plan";

const TIER_RANK: Record<SubscriptionTier, number> = { free: 0, pro: 1, max: 2 };

// The lowest tier that unlocks each feature. The single place feature-to-tier policy lives.
const FEATURE_MIN_TIER: Record<Feature, SubscriptionTier> = {
  total_calories: "free",
  ai_log: "free",
  local_metrics: "free",
  local_checklist: "free",
  unlimited_ai: "pro",
  // Protein, carbs and fat: on the free plan beside calories (owner, 2026-11-17), on the dashboard,
  // in History's day view and on recipe cards.
  macro_drawer: "free",
  // Everything behind the "More nutrients" button: fibre, sodium, and the vitamins and minerals
  // (owner, 2026-11-17). Pro and Max.
  micro_tracker: "pro",
  recipe_modifier: "pro",
  url_scraper: "pro",
  wet_market_units: "pro",
  pantry_suggest: "pro",
  // Scanning a grocery receipt into the pantry. The fridge scan stays free (owner decision 2026-10-10).
  receipt_scan: "pro",
  photo_recipe: "pro",
  meal_history: "pro",
  // Adding a forgotten meal to a past day. Pro, because it lives beside the past-day meal list that
  // only Pro can see, so nobody adds a meal they then cannot see or fix.
  backfill_log: "pro",
  family_sync: "max",
  household_calendar: "max",
  grocery_export: "max",
  // The weekly family meal plan (owner, 2026-10-21). Members of a Max family use it whatever their own
  // plan; plan-week checks the planner's Max on the server.
  family_meal_plan: "max",
};

// Pure tier-policy check: does `tier` clear the minimum tier that unlocks `feature`? This is the
// tier half of hasAccess, split out so gating policy is unit-testable without rendering the hook.
// Metered rules (the free ai_log daily quota) live in the hook on top of this.
export function featureMeetsTier(tier: SubscriptionTier, feature: Feature): boolean {
  return TIER_RANK[tier] >= TIER_RANK[FEATURE_MIN_TIER[feature]];
}

export interface FeatureAccess {
  // Can the current tier use this feature right now? For "ai_log" this also respects the
  // free daily quota, so it flips to false once a free user spends today's photo log.
  hasAccess: boolean;
  // AI photo logs left today. Infinity for paid tiers (unlimited); use Number.isFinite to branch UI.
  remainingLogs: number;
  // Send the user to the paywall. Call this when hasAccess is false and they tap the action.
  triggerPaywall: () => void;
}

/**
 * The one hook every gated surface calls. Pass the feature string; get back whether the
 * active tier can use it, how many free AI photo logs remain today, and a paywall opener.
 */
export function useFeatureAccess(feature: Feature): FeatureAccess {
  const activeTier = useSubscriptionStore((s) => s.activeTier);
  const aiLogCount = useSubscriptionStore((s) => s.aiLogCount);
  const quotaResetDate = useSubscriptionStore((s) => s.quotaResetDate);
  const maxFreeAiLogs = useSubscriptionStore((s) => s.maxFreeAiLogs);

  // Yesterday's tally shouldn't shrink today's quota. effectiveAiLogCount reads a tally from a day
  // that has ended as zero without mutating; incrementAiLog does the actual reset on the next write.
  const usedToday = effectiveAiLogCount(aiLogCount, quotaResetDate, Date.now());
  const isPaid = TIER_RANK[activeTier] >= TIER_RANK.pro;
  const remainingLogs = isPaid
    ? Number.POSITIVE_INFINITY
    : Math.max(0, maxFreeAiLogs - usedToday);

  const meetsTier = featureMeetsTier(activeTier, feature);

  // AI photo logging is a free feature, but the free tier is metered: once today's photo log is
  // spent the door closes until midnight in Hong Kong or an upgrade. Paid tiers stay unlimited.
  const hasAccess = feature === "ai_log" ? meetsTier && remainingLogs > 0 : meetsTier;

  const triggerPaywall = useCallback(() => {
    router.push("/subscription");
  }, []);

  return { hasAccess, remainingLogs, triggerPaywall };
}
