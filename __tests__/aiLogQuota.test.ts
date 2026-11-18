import {
  MAX_DAILY_FREE_AI_LOGS,
  SUBSCRIPTION_STORE_VERSION,
  effectiveAiLogCount,
  isQuotaCycleActive,
  migrateSubscriptionState,
  nextQuotaReset,
} from "@/stores/useSubscriptionStore";

// The free AI photo allowance: one a day, refilled at midnight in Hong Kong (owner, 2026-11-17; it
// was two a week). Pure helpers with an explicit clock, so every edge of the day is pinned.

const HOUR = 60 * 60 * 1000;
// 17 Nov 2026, 15:30 in Hong Kong (07:30 UTC).
const NOW = Date.parse("2026-11-17T07:30:00Z");

describe("the free photo allowance", () => {
  it("is one AI photo log a day", () => {
    expect(MAX_DAILY_FREE_AI_LOGS).toBe(1);
  });
});

describe("nextQuotaReset", () => {
  it("is the next midnight in Hong Kong", () => {
    // 00:00 on 18 Nov in Hong Kong.
    expect(nextQuotaReset(NOW)).toBe("2026-11-17T16:00:00.000Z");
  });

  it("just after midnight in Hong Kong, is the following midnight", () => {
    expect(nextQuotaReset(Date.parse("2026-11-17T16:00:01Z"))).toBe("2026-11-18T16:00:00.000Z");
  });

  it("at 23:59 in Hong Kong, is a minute away", () => {
    expect(nextQuotaReset(Date.parse("2026-11-17T15:59:00Z"))).toBe("2026-11-17T16:00:00.000Z");
  });

  // 07:00 on 17 Nov in Hong Kong is still 16 Nov in UTC: the day is Hong Kong's.
  it("follows the Hong Kong day, not the UTC one", () => {
    expect(nextQuotaReset(Date.parse("2026-11-16T23:00:00Z"))).toBe("2026-11-17T16:00:00.000Z");
  });

  it("opens a tally that runs until midnight and closes on it", () => {
    const reset = nextQuotaReset(NOW);
    expect(isQuotaCycleActive(reset, NOW)).toBe(true);
    expect(isQuotaCycleActive(reset, Date.parse(reset) - 1)).toBe(true);
    expect(isQuotaCycleActive(reset, Date.parse(reset))).toBe(false);
  });
});

describe("isQuotaCycleActive", () => {
  it("is false before any log", () => {
    expect(isQuotaCycleActive(null, NOW)).toBe(false);
  });

  it("is false for an unreadable date", () => {
    expect(isQuotaCycleActive("not-a-date", NOW)).toBe(false);
  });
});

describe("effectiveAiLogCount", () => {
  it("keeps today's tally", () => {
    expect(effectiveAiLogCount(1, nextQuotaReset(NOW), NOW + HOUR)).toBe(1);
  });

  it("reads a tally from a day that has ended as zero", () => {
    const reset = nextQuotaReset(NOW);
    expect(effectiveAiLogCount(1, reset, Date.parse(reset))).toBe(0);
  });

  it("is zero with no tally running", () => {
    expect(effectiveAiLogCount(3, null, NOW)).toBe(0);
  });
});

// The free-tier "remaining" figure the gating hook derives, end to end through the pure helpers.
describe("free-tier photo logs left over a day", () => {
  const remaining = (count: number, reset: string | null, nowMs: number) =>
    Math.max(0, MAX_DAILY_FREE_AI_LOGS - effectiveAiLogCount(count, reset, nowMs));

  it("starts at 1 before any log", () => {
    expect(remaining(0, null, NOW)).toBe(1);
  });

  it("is 0 for the rest of the day once today's photo log is spent", () => {
    const reset = nextQuotaReset(NOW);
    expect(remaining(1, reset, NOW + 3 * HOUR)).toBe(0);
    expect(remaining(1, reset, Date.parse(reset) - 1)).toBe(0);
  });

  it("comes back at midnight in Hong Kong", () => {
    const reset = nextQuotaReset(NOW);
    expect(remaining(1, reset, Date.parse(reset))).toBe(1);
  });

  it("reads 0, not a negative, for a tally above the limit", () => {
    expect(remaining(2, nextQuotaReset(NOW), NOW)).toBe(0);
  });
});

// Version 0 stored a WEEKLY tally. The move to daily must not carry it over: two photos used this week
// would otherwise lock a free user out for days.
describe("migrateSubscriptionState", () => {
  it("is at version 1", () => {
    expect(SUBSCRIPTION_STORE_VERSION).toBe(1);
  });

  it("drops the old weekly tally and keeps the tier", () => {
    expect(
      migrateSubscriptionState(
        { activeTier: "pro", weeklyAiLogCount: 2, quotaResetDate: "2026-11-20T00:00:00.000Z" },
        0,
      ),
    ).toEqual({ activeTier: "pro", aiLogCount: 0, quotaResetDate: null });
  });

  it("never locks a free user out after the update", () => {
    const m = migrateSubscriptionState(
      { activeTier: "free", weeklyAiLogCount: 2, quotaResetDate: "2026-11-22T00:00:00.000Z" },
      0,
    );
    expect(Math.max(0, MAX_DAILY_FREE_AI_LOGS - effectiveAiLogCount(m.aiLogCount, m.quotaResetDate, NOW))).toBe(1);
  });

  it("treats a missing or unknown tier as free", () => {
    expect(migrateSubscriptionState(undefined, 0).activeTier).toBe("free");
    expect(migrateSubscriptionState({ activeTier: "gold" }, 0).activeTier).toBe("free");
  });

  it("keeps a current-version tally as it is", () => {
    const reset = nextQuotaReset(NOW);
    expect(migrateSubscriptionState({ activeTier: "free", aiLogCount: 1, quotaResetDate: reset }, 1)).toEqual({
      activeTier: "free",
      aiLogCount: 1,
      quotaResetDate: reset,
    });
  });
});
