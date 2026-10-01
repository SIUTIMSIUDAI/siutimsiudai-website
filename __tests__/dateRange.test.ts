import {
  datesInRange,
  matchPreset,
  monthGrid,
  normaliseRange,
  presetRange,
} from "@/utils/dateRange";

// The History report's calendar: preset ranges, inclusive day lists, and the month grid. Weeks run
// Monday to Sunday like the rest of the app. 2026-10-01 is a Thursday.
const TODAY = "2026-10-01";

describe("presetRange", () => {
  it("covers each preset, ending today", () => {
    expect(presetRange("today", TODAY)).toEqual({ from: TODAY, to: TODAY });
    expect(presetRange("thisWeek", TODAY)).toEqual({ from: "2026-09-28", to: TODAY });
    expect(presetRange("last7", TODAY)).toEqual({ from: "2026-09-25", to: TODAY });
    expect(presetRange("last30", TODAY)).toEqual({ from: "2026-09-02", to: TODAY });
  });

  it("names a range that matches a preset, preferring the simplest", () => {
    expect(matchPreset({ from: "2026-09-25", to: TODAY }, TODAY)).toBe("last7");
    // On a Monday, "this week" is just today.
    expect(matchPreset({ from: "2026-09-28", to: "2026-09-28" }, "2026-09-28")).toBe("today");
    expect(matchPreset({ from: "2026-09-20", to: "2026-09-22" }, TODAY)).toBeNull();
  });
});

describe("datesInRange", () => {
  it("lists every day inclusively, across a month end", () => {
    expect(datesInRange({ from: "2026-09-29", to: "2026-10-02" })).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
  });
});

describe("normaliseRange", () => {
  it("puts the ends in order", () => {
    expect(normaliseRange(TODAY, "2026-09-28")).toEqual({ from: "2026-09-28", to: TODAY });
  });

  it("keeps a range to 90 days, keeping the later end", () => {
    const range = normaliseRange("2026-01-01", TODAY);
    expect(range).toEqual({ from: "2026-07-04", to: TODAY });
    expect(datesInRange(range)).toHaveLength(90);
  });
});

describe("monthGrid", () => {
  it("lays out October 2026 Monday first in whole weeks", () => {
    const cells = monthGrid(2026, 9);
    expect(cells.slice(0, 4)).toEqual([null, null, null, "2026-10-01"]);
    expect(cells).toContain("2026-10-31");
    expect(cells).toHaveLength(35);
  });
});
