import { GateInput, isAtTarget, isPreAppRoute, resolveGate } from "@/utils/authGate";

// A fully-onboarded, signed-in, verified, profiled user — the "everything done" baseline. Each
// test flips one field to prove the gate blocks at exactly the right step.
const DONE: GateInput = {
  hydrated: true,
  authReady: true,
  linkResolving: false,
  onboardingComplete: true,
  signedIn: true,
  emailVerified: true,
  pendingVerification: false,
  recoveryPending: false,
  profileComplete: true,
};

describe("resolveGate — loading", () => {
  it("waits (null) until the app store has hydrated", () => {
    expect(resolveGate({ ...DONE, hydrated: false })).toBeNull();
  });

  it("waits (null) until auth has initialized", () => {
    expect(resolveGate({ ...DONE, authReady: false })).toBeNull();
  });

  it("freezes while an auth deep link is still being exchanged", () => {
    // The reset-link bug in one assertion. Mid-exchange the user is signed OUT, so without this the
    // gate would resolve to sign-in and replace the callback screen a beat before the recovery
    // session lands, which is what sent a tapped reset link to the sign-in screen.
    expect(resolveGate({ ...DONE, signedIn: false, linkResolving: true })).toBeNull();
  });

  it("stops freezing once the link has resolved", () => {
    expect(resolveGate({ ...DONE, signedIn: true, recoveryPending: true, linkResolving: false })).toBe(
      "/auth/reset-password",
    );
  });
});

describe("resolveGate — sequence", () => {
  it("sends a brand-new user to onboarding first", () => {
    expect(
      resolveGate({ ...DONE, onboardingComplete: false, signedIn: false, profileComplete: false }),
    ).toBe("/onboarding");
  });

  it("routes to sign-in once onboarding is done but no one is signed in", () => {
    expect(resolveGate({ ...DONE, signedIn: false, profileComplete: false })).toBe("/auth/sign-in");
  });

  it("routes a pending email signup to verify-email even without a session", () => {
    expect(
      resolveGate({ ...DONE, signedIn: false, pendingVerification: true, profileComplete: false }),
    ).toBe("/auth/verify-email");
  });

  it("blocks a signed-in but unverified email user at verify-email", () => {
    expect(resolveGate({ ...DONE, emailVerified: false, profileComplete: false })).toBe(
      "/auth/verify-email",
    );
  });

  it("sends a verified user with no profile to profile setup", () => {
    expect(resolveGate({ ...DONE, profileComplete: false })).toBe("/profile-setup");
  });

  it("lets a fully set-up user into the app", () => {
    expect(resolveGate(DONE)).toBe("/(tabs)");
  });
});

describe("resolveGate — password recovery", () => {
  it("holds a recovery session on the reset screen instead of letting it into the app", () => {
    // A recovery link signs the user in as a side effect. Without this branch the gate would wave
    // them through to the tabs and the password they came to reset would never get reset.
    expect(resolveGate({ ...DONE, recoveryPending: true })).toBe("/auth/reset-password");
  });

  it("beats the verification wall, since clicking the emailed link proves the address is real", () => {
    expect(resolveGate({ ...DONE, recoveryPending: true, emailVerified: false })).toBe(
      "/auth/reset-password",
    );
  });

  it("beats profile setup, so nobody is asked their weight mid-lockout", () => {
    expect(resolveGate({ ...DONE, recoveryPending: true, profileComplete: false })).toBe(
      "/auth/reset-password",
    );
  });

  it("does not apply without a session — a signed-out user goes to sign-in", () => {
    expect(resolveGate({ ...DONE, recoveryPending: true, signedIn: false })).toBe("/auth/sign-in");
  });

  it("still shows onboarding first to a brand-new install", () => {
    expect(resolveGate({ ...DONE, recoveryPending: true, onboardingComplete: false })).toBe(
      "/onboarding",
    );
  });

  it("releases the user into the app once the flag clears", () => {
    expect(resolveGate({ ...DONE, recoveryPending: false })).toBe("/(tabs)");
  });
});

describe("resolveGate — OAuth bypasses verification", () => {
  it("routes an OAuth user (verified, no pending) straight to profile setup", () => {
    // OAuth accounts arrive already emailVerified with nothing pending.
    expect(
      resolveGate({ ...DONE, pendingVerification: false, emailVerified: true, profileComplete: false }),
    ).toBe("/profile-setup");
  });
});

describe("isAtTarget", () => {
  it("matches an exact leaf route", () => {
    expect(isAtTarget("/auth/sign-in", ["auth", "sign-in"])).toBe(true);
    expect(isAtTarget("/auth/verify-email", ["auth", "sign-in"])).toBe(false);
    expect(isAtTarget("/auth/reset-password", ["auth", "reset-password"])).toBe(true);
    expect(isAtTarget("/auth/reset-password", ["auth", "sign-in"])).toBe(false);
  });

  it("prefix-matches any screen inside the tabs group", () => {
    expect(isAtTarget("/(tabs)", ["(tabs)", "profile"])).toBe(true);
    expect(isAtTarget("/(tabs)", ["onboarding"])).toBe(false);
  });

  it("matches a single-segment route", () => {
    expect(isAtTarget("/onboarding", ["onboarding"])).toBe(true);
    expect(isAtTarget("/profile-setup", ["profile-setup"])).toBe(true);
  });

  it("counts forgot-password as satisfying the sign-in step", () => {
    // Without this the gate replaces the screen the moment it is pushed: the user is still signed
    // out, the target is still /auth/sign-in, and forgot-password would flash and disappear.
    expect(isAtTarget("/auth/sign-in", ["auth", "forgot-password"])).toBe(true);
  });

  it("does not let that satellite satisfy any OTHER step", () => {
    expect(isAtTarget("/auth/verify-email", ["auth", "forgot-password"])).toBe(false);
    expect(isAtTarget("/auth/reset-password", ["auth", "forgot-password"])).toBe(false);
    expect(isAtTarget("/(tabs)", ["auth", "forgot-password"])).toBe(false);
  });
});

describe("isPreAppRoute", () => {
  it("treats the launch-flow screens (and the bare index) as pre-app", () => {
    expect(isPreAppRoute([])).toBe(true); // root index route reports no segments
    expect(isPreAppRoute(["index"])).toBe(true);
    expect(isPreAppRoute(["onboarding"])).toBe(true);
    expect(isPreAppRoute(["auth", "sign-in"])).toBe(true);
    expect(isPreAppRoute(["auth", "verify-email"])).toBe(true);
    expect(isPreAppRoute(["auth", "reset-password"])).toBe(true);
    expect(isPreAppRoute(["profile-setup"])).toBe(true);
  });

  it("treats in-app stack routes as NOT pre-app, so the gate leaves them put", () => {
    expect(isPreAppRoute(["(tabs)"])).toBe(false);
    expect(isPreAppRoute(["(tabs)", "profile"])).toBe(false);
    expect(isPreAppRoute(["subscription"])).toBe(false);
    expect(isPreAppRoute(["recipe", "123"])).toBe(false);
    expect(isPreAppRoute(["cook", "123"])).toBe(false);
    expect(isPreAppRoute(["account", "password"])).toBe(false);
  });

  it("exempts forgot-password, which a SIGNED-IN user can also open", () => {
    // Reached from the change-password screen when the user cannot recall their current password.
    // Classified by root alone it would count as pre-app and the gate would yank them to the tabs.
    expect(isPreAppRoute(["auth", "forgot-password"])).toBe(false);
  });

  it("exempts only that screen, not the rest of auth/", () => {
    expect(isPreAppRoute(["auth"])).toBe(true);
    expect(isPreAppRoute(["auth", "sign-in"])).toBe(true);
    expect(isPreAppRoute(["auth", "reset-password"])).toBe(true);
  });
});
