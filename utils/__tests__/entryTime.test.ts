import { applyTimeOfDay, formatTimeOfDay, parseTimeOfDay } from "../entryTime";

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
