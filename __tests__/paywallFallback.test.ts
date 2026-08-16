// Regression guard for the silent-fabrication bug on the BILLING path, the third sibling of
// pantryScanFallback.test.ts and mealAiFallback.test.ts.
//
// The paywall had the same shape of defect as the AI services, with money attached. Its CTA read:
//
//     if (live && option) runLivePurchase(plan, option);
//     else                choose(plan);          // <- sets the paid tier locally, then
//                                                //    Alert.alert(plan.successTitle, ...)
//
// `choose()` is the DEMO checkout. It exists so the tier gates can be exercised in Expo Go. But it
// sat on the `else` of a two-way branch, so it also caught every real failure:
//
//   1. RevenueCat failed to configure   -> live === false
//   2. RevenueCat configured but returned no packages -> option === null. This is the likelier one:
//      offerings come back empty while products are still unapproved or the dashboard is
//      misconfigured, which is exactly the state an App Review device can be in.
//
// In both cases a user on a real build could tap "Go Pro", be congratulated on their purchase, and
// receive Pro for free, having paid nothing and with no receipt in existence.
//
// The rule enforced here is the one from services/index.ts, applied to money: a mock is a demo
// stand-in, never a failure fallback. Only a build with NO billing configured may simulate.

import { resolvePaywallCta, type PaywallCtaInput } from "@/utils/paywallCta";

// A real store build: native SDK present, genuine publishable key baked in.
const REAL_BUILD: PaywallCtaInput = {
  planTier: "pro",
  activeTier: "free",
  billingConfigured: true,
  live: true,
  hasPurchasablePackage: true,
};

describe("resolvePaywallCta on a build that ships real billing", () => {
  it("charges through StoreKit when a package is genuinely purchasable", () => {
    expect(resolvePaywallCta(REAL_BUILD)).toBe("purchase");
  });

  it("refuses instead of simulating when RevenueCat never configured", () => {
    const action = resolvePaywallCta({ ...REAL_BUILD, live: false, hasPurchasablePackage: false });

    expect(action).toBe("unavailable");
    // The whole bug in one assertion.
    expect(action).not.toBe("simulate");
  });

  it("refuses when RevenueCat configured but loaded no package for this tier", () => {
    // The case the original two-way branch missed entirely: `live` is true, so nothing looks
    // wrong, but there is nothing to sell.
    const action = resolvePaywallCta({ ...REAL_BUILD, live: true, hasPurchasablePackage: false });

    expect(action).toBe("unavailable");
    expect(action).not.toBe("simulate");
  });

  it("never hands out a paid tier for free, in any broken combination", () => {
    for (const planTier of ["pro", "max"] as const) {
      for (const live of [true, false]) {
        for (const hasPurchasablePackage of [true, false]) {
          if (live && hasPurchasablePackage) continue; // that is the working path
          const action = resolvePaywallCta({
            ...REAL_BUILD,
            planTier,
            live,
            hasPurchasablePackage,
          });
          expect(action).toBe("unavailable");
        }
      }
    }
  });

  it("still lets someone move down to Free, which takes no money and needs no store", () => {
    const action = resolvePaywallCta({
      ...REAL_BUILD,
      planTier: "free",
      activeTier: "pro",
      live: false,
      hasPurchasablePackage: false,
    });

    expect(action).toBe("simulate");
  });

  it("does nothing when the user is already on that tier", () => {
    expect(resolvePaywallCta({ ...REAL_BUILD, planTier: "pro", activeTier: "pro" })).toBe("none");
  });
});

describe("resolvePaywallCta on a build with no billing (Expo Go, web)", () => {
  // The demo path must survive. Killing it would break tier-gate testing in development, and this
  // fix is about honesty in shipped builds, not about removing the stand-in.
  const DEMO_BUILD: PaywallCtaInput = {
    planTier: "pro",
    activeTier: "free",
    billingConfigured: false,
    live: false,
    hasPurchasablePackage: false,
  };

  it("simulates the checkout so tier gates stay testable", () => {
    expect(resolvePaywallCta(DEMO_BUILD)).toBe("simulate");
  });

  it("simulates for every tier", () => {
    expect(resolvePaywallCta({ ...DEMO_BUILD, planTier: "max" })).toBe("simulate");
    expect(resolvePaywallCta({ ...DEMO_BUILD, planTier: "free", activeTier: "pro" })).toBe(
      "simulate",
    );
  });

  it("never reports the store as unavailable, because there is no store to be unavailable", () => {
    for (const planTier of ["free", "pro", "max"] as const) {
      expect(resolvePaywallCta({ ...DEMO_BUILD, planTier })).not.toBe("unavailable");
    }
  });
});
