import { isAppleCancellation, toHex } from "@/utils/appleAuth";

// Build 12 was rejected under guideline 2.1(a) because Sign in with Apple errored: the app used
// browser OAuth against a Supabase project with the Apple provider switched off. The fix moves to
// the native sheet, and these cover the two pieces of that flow that can fail silently.

describe("toHex — the sign-in nonce encoding", () => {
  it("pads bytes below 0x10 to two characters", () => {
    // Without the pad, [0x0a, 0xff] would encode as "aff" and every byte after it would shift.
    // The nonce would still look plausible and would never verify against the identity token.
    expect(toHex([0x0a, 0xff])).toBe("0aff");
    expect(toHex([0x00, 0x01, 0x0f])).toBe("00010f");
  });

  it("turns 32 random bytes into exactly 64 hex characters", () => {
    const bytes = Array.from({ length: 32 }, (_, i) => i * 7);
    expect(toHex(bytes)).toHaveLength(64);
  });

  it("emits only lowercase hex, so the value is URL and JWT safe", () => {
    expect(toHex([0xde, 0xad, 0xbe, 0xef])).toBe("deadbeef");
    expect(toHex([255, 128, 16])).toMatch(/^[0-9a-f]+$/);
  });

  it("handles a typed array, which is what the crypto module actually returns", () => {
    expect(toHex(new Uint8Array([1, 2, 254]))).toBe("0102fe");
  });

  it("is empty for no bytes rather than throwing", () => {
    expect(toHex([])).toBe("");
  });
});

describe("isAppleCancellation — dismissing the sheet is not an error", () => {
  it("recognises Apple's string code", () => {
    expect(isAppleCancellation({ code: "ERR_REQUEST_CANCELED" })).toBe(true);
  });

  it("recognises the legacy 1001, as a number or a string", () => {
    // Which one arrives depends on the bridge, so both spellings have to be accepted.
    expect(isAppleCancellation({ code: 1001 })).toBe(true);
    expect(isAppleCancellation({ code: "1001" })).toBe(true);
  });

  it("treats a genuine failure as a failure, so real bugs still surface", () => {
    expect(isAppleCancellation({ code: "ERR_INVALID_RESPONSE" })).toBe(false);
    expect(isAppleCancellation(new Error("network request failed"))).toBe(false);
  });

  it("does not throw on null, undefined, or a bare string", () => {
    expect(isAppleCancellation(null)).toBe(false);
    expect(isAppleCancellation(undefined)).toBe(false);
    expect(isAppleCancellation("cancelled")).toBe(false);
  });
});
