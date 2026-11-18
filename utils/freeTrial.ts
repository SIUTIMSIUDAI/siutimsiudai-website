import { Locale } from "@/types";

// A free trial at the start of a subscription, which App Store Connect calls a "Free" introductory
// offer. The store charges the plan's price when it ends unless the person turns off renewal first.
// Everything here is pure so the paywall's promises can be unit-tested without the store SDK.

export type TrialUnit = "DAY" | "WEEK" | "MONTH" | "YEAR";

/** How long a free trial lasts, e.g. { count: 1, unit: "MONTH" }. */
export interface FreeTrial {
  count: number;
  unit: TrialUnit;
}

/** What this needs from a product's introductory price (RevenueCat's PurchasesIntroPrice). */
export interface IntroPriceLike {
  price: number;
  cycles: number;
  periodUnit: string;
  periodNumberOfUnits: number;
}

/** What this needs from an active entitlement (RevenueCat's PurchasesEntitlementInfo). */
export interface EntitlementLike {
  periodType: string;
  expirationDate: string | null;
}

type Tl = (en: string, zh: string) => string;

// RevenueCat's INTRO_ELIGIBILITY_STATUS_ELIGIBLE, matched by raw value so this file stays free of
// the SDK (classifyError in services/revenueCatService.ts matches raw codes for the same reason).
const INTRO_ELIGIBLE = 2;

const UNITS: TrialUnit[] = ["DAY", "WEEK", "MONTH", "YEAR"];
const EN_UNIT: Record<TrialUnit, string> = { DAY: "day", WEEK: "week", MONTH: "month", YEAR: "year" };
const ZH_UNIT: Record<TrialUnit, string> = { DAY: "日", WEEK: "星期", MONTH: "個月", YEAR: "年" };

/**
 * The free trial to show on a package, or null. Only a free introductory offer counts, and only
 * once the store has confirmed this person can still redeem it. Anything else, including "unknown"
 * (always the answer on Android), shows the normal price: promising a free month the store then
 * doesn't give is the misleading direction, and RevenueCat's own guidance says the same.
 */
export function resolveFreeTrial(
  intro: IntroPriceLike | null | undefined,
  eligibility: number | null | undefined,
): FreeTrial | null {
  if (!intro || eligibility !== INTRO_ELIGIBLE || intro.price !== 0) return null;
  const unit = UNITS.find((u) => u === intro.periodUnit);
  // A trial can run several periods (2 x 1 week), so its length is periods x period length.
  const count = intro.periodNumberOfUnits * Math.max(1, intro.cycles);
  return unit && count > 0 ? { count, unit } : null;
}

const isOneMonth = (trial: FreeTrial) => trial.count === 1 && trial.unit === "MONTH";

/** "First month free" / "首月免費", or the length spelled out: "2 weeks free" / "免費試用 2 星期". */
export function trialLengthLabel(trial: FreeTrial, tl: Tl): string {
  if (isOneMonth(trial)) return tl("First month free", "首月免費");
  const unit = EN_UNIT[trial.unit] + (trial.count === 1 ? "" : "s");
  return tl(`${trial.count} ${unit} free`, `免費試用 ${trial.count} ${ZH_UNIT[trial.unit]}`);
}

/**
 * The line under a plan's price: how long the trial lasts and what is charged once it ends, which
 * Apple requires in the purchase flow. The billed price itself stays the big number on the card.
 */
export function trialPriceLine(trial: FreeTrial, priceString: string, annual: boolean, tl: Tl): string {
  return tl(
    `${trialLengthLabel(trial, (en) => en)}, then ${priceString} / ${annual ? "year" : "month"}`,
    `${trialLengthLabel(trial, (_en, zh) => zh)}，之後${annual ? "每年" : "每月"} ${priceString}`,
  );
}

/** The plan's button when buying it starts a free trial. */
export function trialCta(tier: "pro" | "max", trial: FreeTrial, tl: Tl): string {
  if (!isOneMonth(trial)) return tl("Start my free trial", "開始免費試用");
  return tier === "pro"
    ? tl("Try Pro free for a month", "免費做一個月熟客")
    : tl("Try Max free for a month", "免費做一個月話事人");
}

/** When the free trial among these active entitlements ends (ISO), or null when none is a trial. */
export function trialEndFromEntitlements(active: Record<string, EntitlementLike>): string | null {
  let end: string | null = null;
  for (const e of Object.values(active)) {
    if (e.periodType !== "TRIAL" || !e.expirationDate) continue;
    if (end === null || Date.parse(e.expirationDate) > Date.parse(end)) end = e.expirationDate;
  }
  return end;
}

/**
 * The "you're in" message after a purchase. When the store started a free trial it adds the day the
 * trial ends and how to stop the first charge, so nobody is surprised by it. `advertised` is the
 * trial the paywall showed, used only for the wording ("free month" vs "free trial").
 */
export function purchaseSuccessBody(
  base: string,
  trialEndsAt: string | null,
  advertised: FreeTrial | null,
  locale: Locale,
  tl: Tl,
): string {
  if (!trialEndsAt) return base;
  const date = new Date(trialEndsAt).toLocaleDateString(locale === "zh-Hant" ? "zh-HK" : "en-US", {
    month: "short",
    day: "numeric",
  });
  const what = advertised && isOneMonth(advertised) ? "free month" : "free trial";
  const note = tl(
    `Your ${what} runs until ${date}. If it isn't for you, turn off renewal in Settings at least a day before and you won't be charged.`,
    `免費試用到 ${date}。如果覺得唔啱，最少提早一日去「設定」關閉自動續訂，就唔會收費。`,
  );
  return `${base}\n\n${note}`;
}
