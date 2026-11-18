// The history gate is a paywall boundary (free users get today only), so its date math gets
// pinned here. Everything is pure and takes an explicit `today`, so no clock mocking is needed.

import {
  daysAgo,
  isBackfillableDate,
  isWithinHistoryWindow,
  HISTORY_WINDOW_DAYS,
} from "@/utils/historyWindow";

const TODAY = "2026-07-05";

describe("daysAgo", () => {
  it("is 0 for today", () => {
    expect(daysAgo(TODAY, TODAY)).toBe(0);
  });

  it("is 1 for yesterday", () => {
    expect(daysAgo("2026-07-04", TODAY)).toBe(1);
  });

  it("is 7 for a week ago", () => {
    expect(daysAgo("2026-06-28", TODAY)).toBe(7);
  });

  it("is negative for a future date", () => {
    expect(daysAgo("2026-07-06", TODAY)).toBe(-1);
  });

  it("counts across a month boundary", () => {
    expect(daysAgo("2026-06-30", "2026-07-02")).toBe(2);
  });

  it("counts across a year boundary", () => {
    expect(daysAgo("2025-12-31", "2026-01-02")).toBe(2);
  });
});

describe("isWithinHistoryWindow", () => {
  it("includes today", () => {
    expect(isWithinHistoryWindow(TODAY, TODAY)).toBe(true);
  });

  it("excludes yesterday (free tier is today only)", () => {
    expect(isWithinHistoryWindow("2026-07-04", TODAY)).toBe(false);
  });

  it("excludes anything older", () => {
    expect(isWithinHistoryWindow("2026-05-01", TODAY)).toBe(false);
  });

  it("treats future dates as inside the window", () => {
    expect(isWithinHistoryWindow("2026-07-10", TODAY)).toBe(true);
  });
});

// Adding a forgotten meal is allowed on any past day the History strip shows (35 days, today
// included), so the oldest backfillable day is 34 days back.
describe("isBackfillableDate", () => {
  it("allows yesterday", () => {
    expect(isBackfillableDate("2026-07-04", TODAY)).toBe(true);
  });

  it("allows the oldest day on the History strip, 34 days back", () => {
    expect(isBackfillableDate("2026-06-01", TODAY)).toBe(true);
  });

  it("refuses a day older than the strip, 35 days back", () => {
    expect(isBackfillableDate("2026-05-31", TODAY)).toBe(false);
  });

  it("refuses today, which the Log tab already covers", () => {
    expect(isBackfillableDate(TODAY, TODAY)).toBe(false);
  });

  it("refuses a future day", () => {
    expect(isBackfillableDate("2026-07-06", TODAY)).toBe(false);
  });

  it("refuses an unparseable date key", () => {
    expect(isBackfillableDate("not-a-date", TODAY)).toBe(false);
  });
});

it("HISTORY_WINDOW_DAYS is 1 (today only)", () => {
  expect(HISTORY_WINDOW_DAYS).toBe(1);
});
