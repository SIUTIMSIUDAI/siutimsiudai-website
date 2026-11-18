import {
  purchaseSuccessBody,
  resolveFreeTrial,
  trialCta,
  trialEndFromEntitlements,
  trialLengthLabel,
  trialPriceLine,
  type FreeTrial,
} from "@/utils/freeTrial";

// RevenueCat's INTRO_ELIGIBILITY_STATUS values, by raw number.
const UNKNOWN = 0;
const INELIGIBLE = 1;
const ELIGIBLE = 2;
const NO_OFFER = 3;

// Apple's "Free" introductory offer of one month, as the SDK reports it on a product.
const FREE_MONTH = { price: 0, cycles: 1, periodUnit: "MONTH", periodNumberOfUnits: 1 };
const ONE_MONTH: FreeTrial = { count: 1, unit: "MONTH" };

const EN = (en: string) => en;
const ZH = (_en: string, zh: string) => zh;

// The paywall may only promise a free trial the store will actually give. Promising one that
// then never happens is the misleading direction, so anything short of a confirmed "eligible"
// shows the normal price.
describe("resolveFreeTrial", () => {
  it("offers a free month when the store says this person can still get it", () => {
    expect(resolveFreeTrial(FREE_MONTH, ELIGIBLE)).toEqual(ONE_MONTH);
  });

  it("shows the normal price to anyone the store hasn't confirmed", () => {
    for (const status of [UNKNOWN, INELIGIBLE, NO_OFFER, undefined, null]) {
      expect(resolveFreeTrial(FREE_MONTH, status)).toBeNull();
    }
  });

  it("needs an introductory offer to exist", () => {
    expect(resolveFreeTrial(null, ELIGIBLE)).toBeNull();
    expect(resolveFreeTrial(undefined, ELIGIBLE)).toBeNull();
  });

  it("ignores a discounted introductory price, which is not a free trial", () => {
    expect(resolveFreeTrial({ ...FREE_MONTH, price: 8 }, ELIGIBLE)).toBeNull();
  });

  it("measures the whole trial, not one period of it", () => {
    expect(
      resolveFreeTrial({ price: 0, cycles: 2, periodUnit: "WEEK", periodNumberOfUnits: 1 }, ELIGIBLE),
    ).toEqual({ count: 2, unit: "WEEK" });
    expect(
      resolveFreeTrial({ price: 0, cycles: 1, periodUnit: "DAY", periodNumberOfUnits: 7 }, ELIGIBLE),
    ).toEqual({ count: 7, unit: "DAY" });
  });

  it("drops a trial whose length it can't read", () => {
    expect(resolveFreeTrial({ ...FREE_MONTH, periodUnit: "UNKNOWN" }, ELIGIBLE)).toBeNull();
    expect(resolveFreeTrial({ ...FREE_MONTH, periodNumberOfUnits: 0 }, ELIGIBLE)).toBeNull();
  });
});

describe("trial wording", () => {
  it("says 'first month free' for a one-month trial", () => {
    expect(trialLengthLabel(ONE_MONTH, EN)).toBe("First month free");
    expect(trialLengthLabel(ONE_MONTH, ZH)).toBe("首月免費");
  });

  it("spells out any other length", () => {
    expect(trialLengthLabel({ count: 2, unit: "WEEK" }, EN)).toBe("2 weeks free");
    expect(trialLengthLabel({ count: 1, unit: "WEEK" }, EN)).toBe("1 week free");
    expect(trialLengthLabel({ count: 7, unit: "DAY" }, ZH)).toBe("免費試用 7 日");
    expect(trialLengthLabel({ count: 3, unit: "MONTH" }, ZH)).toBe("免費試用 3 個月");
  });

  // Apple: the purchase flow must say how long the trial lasts and what is billed once it ends.
  it("states the price that is charged once the trial ends", () => {
    expect(trialPriceLine(ONE_MONTH, "HK$58.00", false, EN)).toBe("First month free, then HK$58.00 / month");
    expect(trialPriceLine(ONE_MONTH, "HK$58.00", false, ZH)).toBe("首月免費，之後每月 HK$58.00");
    expect(trialPriceLine(ONE_MONTH, "HK$488.00", true, EN)).toBe("First month free, then HK$488.00 / year");
    expect(trialPriceLine(ONE_MONTH, "HK$488.00", true, ZH)).toBe("首月免費，之後每年 HK$488.00");
  });

  it("names the plan on the button", () => {
    expect(trialCta("pro", ONE_MONTH, EN)).toBe("Try Pro free for a month");
    expect(trialCta("pro", ONE_MONTH, ZH)).toBe("免費做一個月熟客");
    expect(trialCta("max", ONE_MONTH, EN)).toBe("Try Max free for a month");
    expect(trialCta("max", ONE_MONTH, ZH)).toBe("免費做一個月話事人");
  });

  it("uses a plain button for any other trial length", () => {
    expect(trialCta("pro", { count: 2, unit: "WEEK" }, EN)).toBe("Start my free trial");
    expect(trialCta("max", { count: 2, unit: "WEEK" }, ZH)).toBe("開始免費試用");
  });
});

describe("trialEndFromEntitlements", () => {
  it("reads when the trial ends", () => {
    expect(
      trialEndFromEntitlements({ pro_tier: { periodType: "TRIAL", expirationDate: "2026-11-11T09:00:00Z" } }),
    ).toBe("2026-11-11T09:00:00Z");
  });

  it("is null when nothing active is a trial", () => {
    expect(trialEndFromEntitlements({})).toBeNull();
    expect(
      trialEndFromEntitlements({ pro_tier: { periodType: "NORMAL", expirationDate: "2026-11-11T09:00:00Z" } }),
    ).toBeNull();
    expect(trialEndFromEntitlements({ pro_tier: { periodType: "TRIAL", expirationDate: null } })).toBeNull();
  });

  it("finds the trial among paid entitlements", () => {
    expect(
      trialEndFromEntitlements({
        pro_tier: { periodType: "NORMAL", expirationDate: "2026-12-01T00:00:00Z" },
        max_tier: { periodType: "TRIAL", expirationDate: "2026-11-11T09:00:00Z" },
      }),
    ).toBe("2026-11-11T09:00:00Z");
  });
});

describe("purchaseSuccessBody", () => {
  const BASE = "Pro is on.";
  // Midday UTC, so the calendar date is the same in every Hong Kong-adjacent time zone.
  const ENDS = "2026-11-11T12:00:00Z";

  it("keeps the usual message when no trial started", () => {
    expect(purchaseSuccessBody(BASE, null, ONE_MONTH, "en", EN)).toBe(BASE);
  });

  it("adds when the free month ends and how to stop the charge", () => {
    expect(purchaseSuccessBody(BASE, ENDS, ONE_MONTH, "en", EN)).toBe(
      "Pro is on.\n\nYour free month runs until Nov 11. If it isn't for you, turn off renewal in Settings at least a day before and you won't be charged.",
    );
  });

  it("says it in Chinese, with a Chinese date", () => {
    expect(purchaseSuccessBody("Pro 已開通。", ENDS, ONE_MONTH, "zh-Hant", ZH)).toBe(
      "Pro 已開通。\n\n免費試用到 11月11日。如果覺得唔啱，最少提早一日去「設定」關閉自動續訂，就唔會收費。",
    );
  });

  it("calls it a free trial when the store gave one the paywall didn't show", () => {
    expect(purchaseSuccessBody(BASE, ENDS, null, "en", EN)).toContain("Your free trial runs until Nov 11.");
  });
});
