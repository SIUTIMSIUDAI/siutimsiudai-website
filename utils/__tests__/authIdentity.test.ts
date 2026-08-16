import { hasPasswordIdentity, socialProviderNames } from "../authIdentity";

describe("hasPasswordIdentity", () => {
  it("is true for an email/password account", () => {
    expect(hasPasswordIdentity([{ provider: "email" }])).toBe(true);
  });

  it("is false for an OAuth-only account", () => {
    // These users have no password. Offering them a change-password screen would send them into a
    // form whose only possible outcome is "incorrect password" for a password that never existed.
    expect(hasPasswordIdentity([{ provider: "google" }])).toBe(false);
    expect(hasPasswordIdentity([{ provider: "apple" }])).toBe(false);
  });

  it("is true when a password was linked alongside a social provider", () => {
    expect(hasPasswordIdentity([{ provider: "apple" }, { provider: "email" }])).toBe(true);
  });

  it("fails closed on a missing or malformed identities list", () => {
    // `identities` is optional on the Supabase user and absent with no backend configured. An
    // unknown shape must never be read as "has a password", or Profile offers a dead-end row.
    expect(hasPasswordIdentity(undefined)).toBe(false);
    expect(hasPasswordIdentity(null)).toBe(false);
    expect(hasPasswordIdentity([])).toBe(false);
    expect(hasPasswordIdentity([null as unknown as { provider: string }])).toBe(false);
  });
});

describe("socialProviderNames", () => {
  it("names the providers the account actually uses", () => {
    expect(socialProviderNames([{ provider: "google" }])).toEqual(["Google"]);
    expect(socialProviderNames([{ provider: "apple" }, { provider: "google" }])).toEqual([
      "Apple",
      "Google",
    ]);
  });

  it("ignores the email identity and de-duplicates", () => {
    expect(socialProviderNames([{ provider: "email" }, { provider: "google" }])).toEqual(["Google"]);
    expect(socialProviderNames([{ provider: "google" }, { provider: "google" }])).toEqual(["Google"]);
  });

  it("returns nothing for a missing list", () => {
    expect(socialProviderNames(undefined)).toEqual([]);
    expect(socialProviderNames([])).toEqual([]);
  });
});
