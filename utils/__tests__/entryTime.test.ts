import {
  applyTimeOfDay,
  formatTimeOfDay,
  loggedAtFor,
  parseTimeOfDay,
  sortByLoggedAt,
} from "../entryTime";

describe("parseTimeOfDay", () => {
  it("parses a valid zero-padded time", () => {
    expect(parseTimeOfDay("08:30")).toEqual({ h: 8, m: 30 });
    expect(parseTimeOfDay("00:00")).toEqual({ h: 0, m: 0 });
    expect(parseTimeOfDay("23:59")).toEqual({ h: 23, m: 59 });
  });

  it("accepts a single-digit hour and trims surrounding space", () => {
    expect(parseTimeOfDay("9:05")).toEqual({ h: 9, m: 5 });
    expect(parseTimeOfDay("  7:15  ")).toEqual({ h: 7, m: 15 });
  });

  it("rejects out-of-range hours and minutes", () => {
    expect(parseTimeOfDay("24:00")).toBeNull();
    expect(parseTimeOfDay("12:60")).toBeNull();
    expect(parseTimeOfDay("99:99")).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(parseTimeOfDay("")).toBeNull();
    expect(parseTimeOfDay("830")).toBeNull();
    expect(parseTimeOfDay("8:3")).toBeNull(); // minutes must be two digits
    expect(parseTimeOfDay("8.30")).toBeNull();
    expect(parseTimeOfDay("lunch")).toBeNull();
    expect(parseTimeOfDay("8:30pm")).toBeNull();
  });
});

describe("formatTimeOfDay", () => {
  it("renders local hours and minutes zero-padded", () => {
    // Built in local time so the assertion holds in any timezone.
    const iso = new Date(2026, 7, 30, 8, 5, 0, 0).toISOString();
    expect(formatTimeOfDay(iso)).toBe("08:05");
  });

  it("renders midnight and one-minute-to-midnight", () => {
    expect(formatTimeOfDay(new Date(2026, 0, 1, 0, 0).toISOString())).toBe("00:00");
    expect(formatTimeOfDay(new Date(2026, 0, 1, 23, 59).toISOString())).toBe("23:59");
  });

  it("returns an empty string for an invalid date", () => {
    expect(formatTimeOfDay("not-a-date")).toBe("");
  });
});

describe("applyTimeOfDay", () => {
  it("replaces the time of day while keeping the local calendar date", () => {
    const base = new Date(2026, 7, 30, 8, 30, 0, 0); // local Aug 30 2026, 08:30
    const out = applyTimeOfDay(base.toISOString(), "14:45");
    expect(out).not.toBeNull();
    const d = new Date(out as string);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(30);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(45);
    expect(d.getSeconds()).toBe(0);
    expect(d.getMilliseconds()).toBe(0);
  });

  it("round-trips through formatTimeOfDay", () => {
    const iso = new Date(2026, 2, 15, 6, 0, 0, 0).toISOString();
    const moved = applyTimeOfDay(iso, "21:07");
    expect(formatTimeOfDay(moved as string)).toBe("21:07");
  });

  it("returns null when the time string is invalid", () => {
    const iso = new Date(2026, 7, 30, 8, 30).toISOString();
    expect(applyTimeOfDay(iso, "25:00")).toBeNull();
    expect(applyTimeOfDay(iso, "boom")).toBeNull();
  });

  it("returns null when the base date is invalid", () => {
    expect(applyTimeOfDay("not-a-date", "10:00")).toBeNull();
  });
});

describe("loggedAtFor", () => {
  // Local Sat 26 Sep 2026, 15:49:12. Built in local time so every assertion holds in any timezone.
  const NOW = new Date(2026, 8, 26, 15, 49, 12, 345);
  const TODAY = "2026-09-26";

  function localParts(iso: string) {
    const d = new Date(iso);
    return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()];
  }

  it("stamps an entry for today with the real clock time", () => {
    expect(loggedAtFor(TODAY, "lunch", NOW, TODAY)).toBe(NOW.toISOString());
  });

  it("stamps a forgotten meal on the past day it belongs to, not on today", () => {
    expect(localParts(loggedAtFor("2026-09-22", "lunch", NOW, TODAY))).toEqual([2026, 9, 22, 13, 0, 0]);
  });

  it.each([
    ["breakfast", 8, 0],
    ["lunch", 13, 0],
    ["snack", 15, 30],
    ["dinner", 19, 30],
  ] as const)("gives a backfilled %s its typical time of day", (mealType, hour, minute) => {
    expect(localParts(loggedAtFor("2026-09-25", mealType, NOW, TODAY))).toEqual([2026, 9, 25, hour, minute, 0]);
  });

  it("crosses a month boundary without drifting to the wrong day", () => {
    expect(localParts(loggedAtFor("2026-08-31", "dinner", NOW, TODAY))).toEqual([2026, 8, 31, 19, 30, 0]);
  });

  it("falls back to the real clock for an unparseable date key instead of throwing", () => {
    expect(loggedAtFor("not-a-date", "lunch", NOW, TODAY)).toBe(NOW.toISOString());
  });
});

describe("sortByLoggedAt", () => {
  const at = (h: number, m: number) => new Date(2026, 8, 25, h, m, 0, 0).toISOString();

  it("lists a day's meals in the order they were eaten, not the order they were entered", () => {
    const entered = [
      { id: "snack", loggedAt: at(15, 30) },
      { id: "breakfast", loggedAt: at(8, 0) },
      { id: "dinner", loggedAt: at(19, 30) },
    ];
    expect(sortByLoggedAt(entered).map((e) => e.id)).toEqual(["breakfast", "snack", "dinner"]);
  });

  it("keeps entry order for meals stamped with the same time", () => {
    const entered = [
      { id: "first", loggedAt: at(13, 0) },
      { id: "second", loggedAt: at(13, 0) },
    ];
    expect(sortByLoggedAt(entered).map((e) => e.id)).toEqual(["first", "second"]);
  });

  it("leaves the stored array untouched, since store state must never be sorted in place", () => {
    const entered = [
      { id: "snack", loggedAt: at(15, 30) },
      { id: "breakfast", loggedAt: at(8, 0) },
    ];
    sortByLoggedAt(entered);
    expect(entered.map((e) => e.id)).toEqual(["snack", "breakfast"]);
  });
});
