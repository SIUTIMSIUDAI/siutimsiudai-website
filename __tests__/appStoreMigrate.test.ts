import { migrateAppState } from "@/stores/appStore";

// The AI consent sheet lists what reaches our AI provider. When that list grows to include something
// as sensitive as a family's allergies (the weekly family plan, 2026-10-26), people who agreed to the
// shorter list must see the new one once, so their earlier "yes" is cleared on upgrade.

describe("migrateAppState", () => {
  it("asks everyone who agreed to the earlier AI sheet to read the new one", () => {
    expect(migrateAppState({ locale: "en", onboardingComplete: true, aiConsentAccepted: true }, 1)).toEqual({
      locale: "en",
      onboardingComplete: true,
      aiConsentAccepted: false,
    });
  });

  it("still carries the oldest installs' onboarding flag across", () => {
    expect(migrateAppState({ onboardingSkipped: true, aiConsentAccepted: true }, 0)).toEqual({
      onboardingComplete: true,
      aiConsentAccepted: false,
    });
  });

  it("leaves a fresh install alone", () => {
    expect(migrateAppState(undefined, 1)).toBeUndefined();
  });
});
