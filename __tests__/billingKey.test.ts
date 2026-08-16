// Regression guard for the cross-platform key mix-up, a sibling of paywallFallback.test.ts.
//
// The original code had one key and used it everywhere:
//
//     PurchasesSDK.configure({ apiKey: APPLE_API_KEY });   // on Android too
//
// That is not a loud failure. RevenueCat's Android SDK rejects an `appl_` key, `configure()`
// throws, and availability lands on "unavailable" — but the old `KEY_LOOKS_REAL` only asked
// whether the key looked like a genuine *Apple* key, which on Android it did. So
// `isBillingConfigured` stayed true, and by the rule in utils/paywallCta.ts, configured plus
// unavailable means "the store is unreachable, refuse the sale". Every Android user would have hit
// a paywall that could never complete a purchase, with nothing in the app to explain it.
//
// The invariant these tests pin: a key is real ONLY when its prefix matches the store of the
// platform it is about to be handed to. Being a valid key for some *other* store is exactly as
// disqualifying as being absent.

import { resolveBillingKey } from "@/utils/billingKey";

// Both invented, and they must stay invented. This file previously held the project's REAL `appl_`
// key on the line below, where it reads as a fixture and is not one. A publishable key is not a
// billable secret — it ships inside the app binary by design — but this repo is public, and there is
// no reason to make it greppable. Nothing here needs a real value either: resolveBillingKey only
// reads the prefix and screens out stubs, so any random base62 that avoids "placeholder" and a run
// of x's exercises every branch just as well.
const APPLE = "appl_NvBqWmZrTkYhLpXsDgFjCuAeRoT";
const GOOGLE = "goog_KpQmTbXvNwHsLdYrZaEuFcGiJoP";

describe("resolveBillingKey picks the key for the platform's own store", () => {
  it("uses the Apple key on iOS", () => {
    const { apiKey, looksReal } = resolveBillingKey({
      os: "ios",
      appleKey: APPLE,
      googleKey: GOOGLE,
    });
    expect(apiKey).toBe(APPLE);
    expect(looksReal).toBe(true);
  });

  it("uses the Google key on Android", () => {
    const { apiKey, looksReal } = resolveBillingKey({
      os: "android",
      appleKey: APPLE,
      googleKey: GOOGLE,
    });
    expect(apiKey).toBe(GOOGLE);
    expect(looksReal).toBe(true);
  });

  it("never hands the Apple key to Android, even as a last resort", () => {
    const { apiKey, looksReal } = resolveBillingKey({
      os: "android",
      appleKey: APPLE,
      googleKey: undefined,
    });
    expect(apiKey).not.toBe(APPLE);
    expect(looksReal).toBe(false);
  });

  it("never hands the Google key to iOS", () => {
    const { apiKey, looksReal } = resolveBillingKey({
      os: "ios",
      appleKey: undefined,
      googleKey: GOOGLE,
    });
    expect(apiKey).not.toBe(GOOGLE);
    expect(looksReal).toBe(false);
  });
});

describe("resolveBillingKey rejects a key meant for the wrong store", () => {
  // The actual shipped bug, stated as a test: an Apple key supplied in the Google slot.
  it("refuses an appl_ key sitting in the Android slot", () => {
    expect(resolveBillingKey({ os: "android", googleKey: APPLE }).looksReal).toBe(false);
  });

  it("refuses a goog_ key sitting in the Apple slot", () => {
    expect(resolveBillingKey({ os: "ios", appleKey: GOOGLE }).looksReal).toBe(false);
  });
});

describe("resolveBillingKey screens out the placeholders", () => {
  it("rejects the in-code Android fallback", () => {
    expect(resolveBillingKey({ os: "android" }).looksReal).toBe(false);
  });

  it("rejects the in-code iOS fallback", () => {
    expect(resolveBillingKey({ os: "ios" }).looksReal).toBe(false);
  });

  it("rejects the .env.example stubs on both platforms", () => {
    expect(
      resolveBillingKey({ os: "ios", appleKey: "appl_xxxxxxxxxxxxxxxxxxxxxxxx" }).looksReal,
    ).toBe(false);
    expect(
      resolveBillingKey({ os: "android", googleKey: "goog_xxxxxxxxxxxxxxxxxxxxxxxx" }).looksReal,
    ).toBe(false);
  });

  it("rejects an empty string rather than treating it as supplied", () => {
    expect(resolveBillingKey({ os: "android", googleKey: "" }).looksReal).toBe(false);
  });

  // Guards the screening regex against over-reach: a genuine base62 key may well contain an "x",
  // just not a long run of them. If this ever fails, live billing has been switched off in
  // production by a false positive.
  it("accepts a real key that happens to contain an x", () => {
    expect(resolveBillingKey({ os: "android", googleKey: "goog_axbxcxdxefghijkl" }).looksReal).toBe(
      true,
    );
  });
});

describe("resolveBillingKey on platforms with no store", () => {
  it("reports web as unusable no matter what keys are supplied", () => {
    expect(
      resolveBillingKey({ os: "web", appleKey: APPLE, googleKey: GOOGLE }).looksReal,
    ).toBe(false);
  });

  it("reports an unknown platform as unusable", () => {
    expect(resolveBillingKey({ os: "windows", appleKey: APPLE }).looksReal).toBe(false);
  });
});
