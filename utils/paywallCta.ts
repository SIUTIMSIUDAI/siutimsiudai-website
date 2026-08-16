import type { SubscriptionTier } from "@/stores/useSubscriptionStore";

/**
 * What tapping a paywall card should actually do.
 *
 * This lives here, apart from the screen, because it is the branch that decides whether somebody
 * gets charged, gets a tier for free, or gets told no. The screen cannot be unit tested in this
 * repo (jest runs pure logic only, no renderer), and this decision is too load-bearing to leave
 * untested inside a component.
 */
export type PaywallCtaAction =
  /** Already on this tier. Do nothing. */
  | "none"
  /** A real StoreKit purchase through RevenueCat. */
  | "purchase"
  /** Demo stand-in: flip the tier locally. ONLY legal in a build with no billing at all. */
  | "simulate"
  /** This build sells subscriptions but the store cannot complete a sale right now. */
  | "unavailable";

export interface PaywallCtaInput {
  planTier: SubscriptionTier;
  activeTier: SubscriptionTier;
  /** Build-time fact: this binary ships real billing (native SDK + genuine publishable key). */
  billingConfigured: boolean;
  /** Runtime fact: RevenueCat configured successfully this session. */
  live: boolean;
  /** Runtime fact: a purchasable package was actually loaded for THIS tier. */
  hasPurchasablePackage: boolean;
}

/**
 * The rule, and the reason it is written down:
 *
 * A simulated checkout is a demo stand-in, never a failure fallback. It is the same promise the
 * AI services make (see services/index.ts). The paywall used to break it in two places, and both
 * ended at the same line, `choose(plan)`, which sets the paid tier locally and pops a
 * congratulations alert:
 *
 *   1. RevenueCat failed to configure, so `live` was false.
 *   2. RevenueCat configured fine but no package loaded, so `option` was null. This is the more
 *      likely one in the wild: offerings come back empty whenever the products are not yet
 *      approved or the RevenueCat dashboard is misconfigured, which is exactly the state an App
 *      Review device can be in.
 *
 * Either way a user on a real build could tap "Go Pro", be told the purchase succeeded, and get
 * Pro for nothing. Now anything short of a genuinely purchasable package refuses, and only a build
 * with no billing at all is allowed to pretend.
 *
 * Moving DOWN to Free is exempt: it takes no money and needs no store.
 */
export function resolvePaywallCta(input: PaywallCtaInput): PaywallCtaAction {
  const { planTier, activeTier, billingConfigured, live, hasPurchasablePackage } = input;

  if (planTier === activeTier) return "none";
  if (live && hasPurchasablePackage) return "purchase";
  if (planTier === "free") return "simulate";
  if (billingConfigured) return "unavailable";
  return "simulate";
}
