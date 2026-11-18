import {
  PERSONAL_DATA_KEYS,
  isPersonalKey,
  resolveScopedKey,
  scopedKeyFor,
  shouldAdoptKey,
} from "../persistScope";

describe("per-account storage scoping", () => {
  it("namespaces a personal key by the signed-in user", () => {
    expect(resolveScopedKey("siutimsiudai-nutrition", "user-1")).toBe(
      "siutimsiudai-nutrition__u_user-1",
    );
  });

  it("uses the bare key for the signed-out / guest scope", () => {
    // Bare keys are also where any pre-scoping data already lives, so a signed-out read finds it.
    expect(resolveScopedKey("siutimsiudai-nutrition", null)).toBe("siutimsiudai-nutrition");
    expect(resolveScopedKey("siutimsiudai-nutrition", undefined)).toBe("siutimsiudai-nutrition");
  });

  it("never namespaces a non-personal device key, even while signed in", () => {
    // siutimsiudai-app (locale / units / onboarding) and the subscription mirror are per-device,
    // not per-account, so they must stay on the bare key for every user.
    expect(resolveScopedKey("siutimsiudai-app", "user-1")).toBe("siutimsiudai-app");
    expect(resolveScopedKey("siutimsiudai-subscription", "user-1")).toBe("siutimsiudai-subscription");
  });

  it("scopes every personal key and nothing outside the list", () => {
    PERSONAL_DATA_KEYS.forEach((k) => expect(isPersonalKey(k)).toBe(true));
    expect(isPersonalKey("siutimsiudai-app")).toBe(false);
    expect(isPersonalKey("siutimsiudai-cart-run")).toBe(false);
  });

  it("keeps the diary a scoped personal key (guards the account-mixing bug directly)", () => {
    expect(isPersonalKey("siutimsiudai-nutrition")).toBe(true);
  });

  it("round-trips scopedKeyFor through resolveScopedKey", () => {
    expect(resolveScopedKey("siutimsiudai-pantry", "abc")).toBe(scopedKeyFor("siutimsiudai-pantry", "abc"));
  });

  it("gives two accounts different physical keys for the same store", () => {
    expect(scopedKeyFor("siutimsiudai-nutrition", "A")).not.toBe(
      scopedKeyFor("siutimsiudai-nutrition", "B"),
    );
  });
});

describe("adopting pre-scoping data for the first account on a device", () => {
  it("adopts bare data when the account has no scoped copy yet", () => {
    expect(shouldAdoptKey(null, '{"state":{}}')).toBe(true);
  });

  it("never overwrites an existing scoped copy", () => {
    expect(shouldAdoptKey('{"state":{"logsByDate":{}}}', '{"state":{}}')).toBe(false);
  });

  it("does nothing when there is no bare data to adopt", () => {
    expect(shouldAdoptKey(null, null)).toBe(false);
    expect(shouldAdoptKey(null, undefined)).toBe(false);
  });
});
