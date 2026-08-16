import {
  biometricNameKey,
  canOfferBiometricSignIn,
  credentialMatchesUser,
  readAuthFailure,
  readCapability,
  readKeychainFailure,
  shouldClearCredential,
  type BiometricCapability,
  type StoredCredential,
} from "@/utils/biometricLogin";

const FINGERPRINT = 1;
const FACIAL = 2;
const IRIS = 3;

const CREDENTIAL: StoredCredential = { userId: "user-1", email: "a@example.com" };
const USABLE: BiometricCapability = { available: true, kind: "face" };
const UNUSABLE: BiometricCapability = { available: false, kind: "generic" };

describe("readCapability", () => {
  it("names the method so the prompt matches the hardware", () => {
    expect(readCapability({ hasHardware: true, isEnrolled: true, types: [FACIAL] })).toEqual({
      available: true,
      kind: "face",
    });
    expect(readCapability({ hasHardware: true, isEnrolled: true, types: [FINGERPRINT] })).toEqual({
      available: true,
      kind: "fingerprint",
    });
    expect(readCapability({ hasHardware: true, isEnrolled: true, types: [IRIS] })).toEqual({
      available: true,
      kind: "iris",
    });
  });

  it("prefers face when a device reports several, matching which sheet iOS shows", () => {
    const c = readCapability({ hasHardware: true, isEnrolled: true, types: [FINGERPRINT, FACIAL] });
    expect(c.kind).toBe("face");
  });

  it("treats hardware with nothing enrolled as unavailable", () => {
    // The sensor exists but no face is registered, so every prompt would fail. Offering the toggle
    // here produces a setting that cannot be switched on.
    expect(readCapability({ hasHardware: true, isEnrolled: false, types: [FACIAL] })).toEqual({
      available: false,
      kind: "generic",
    });
  });

  it("treats a device with no sensor as unavailable", () => {
    expect(readCapability({ hasHardware: false, isEnrolled: false, types: [] }).available).toBe(false);
  });

  it("still works when the probe is missing or malformed", () => {
    expect(readCapability(null).available).toBe(false);
    expect(readCapability(undefined).available).toBe(false);
    expect(
      readCapability({ hasHardware: true, isEnrolled: true, types: null as unknown as number[] }),
    ).toEqual({ available: true, kind: "generic" });
  });

  it("describes enrolled hardware of an unknown type generically rather than hiding it", () => {
    expect(readCapability({ hasHardware: true, isEnrolled: true, types: [99] })).toEqual({
      available: true,
      kind: "generic",
    });
  });
});

describe("biometricNameKey", () => {
  it("maps each kind to its own copy key", () => {
    expect(biometricNameKey("face")).toBe("auth.biometricName.face");
    expect(biometricNameKey("fingerprint")).toBe("auth.biometricName.fingerprint");
    expect(biometricNameKey("generic")).toBe("auth.biometricName.generic");
  });
});

describe("canOfferBiometricSignIn", () => {
  it("needs both a usable sensor and a registered credential", () => {
    expect(canOfferBiometricSignIn(USABLE, CREDENTIAL)).toBe(true);
    expect(canOfferBiometricSignIn(USABLE, null)).toBe(false);
    expect(canOfferBiometricSignIn(UNUSABLE, CREDENTIAL)).toBe(false);
    expect(canOfferBiometricSignIn(UNUSABLE, null)).toBe(false);
  });

  it("hides the button when the user removed their face after enabling", () => {
    // The credential is still in the keychain but iOS will never release it, so a button here
    // would fail every time it was pressed.
    expect(canOfferBiometricSignIn({ available: false, kind: "face" }, CREDENTIAL)).toBe(false);
  });
});

describe("credentialMatchesUser", () => {
  it("accepts the owner", () => {
    expect(credentialMatchesUser(CREDENTIAL, "user-1")).toBe(true);
  });

  it("rejects a different user, so a shared device never opens the wrong diary", () => {
    expect(credentialMatchesUser(CREDENTIAL, "user-2")).toBe(false);
  });

  it("rejects when either side is missing", () => {
    expect(credentialMatchesUser(null, "user-1")).toBe(false);
    expect(credentialMatchesUser(CREDENTIAL, null)).toBe(false);
    expect(credentialMatchesUser(CREDENTIAL, undefined)).toBe(false);
  });
});

describe("shouldClearCredential", () => {
  it("clears only when the server refused the token", () => {
    expect(shouldClearCredential("rejected")).toBe(true);
  });

  it("keeps the credential for failures the user can fix on the device", () => {
    // Cancelling, a lockout, or unenrolling are all recoverable. Deleting the credential would
    // punish the user by making them sign in with a password and register all over again.
    expect(shouldClearCredential("cancelled")).toBe(false);
    expect(shouldClearCredential("locked_out")).toBe(false);
    expect(shouldClearCredential("unenrolled")).toBe(false);
    expect(shouldClearCredential("unknown")).toBe(false);
  });
});

// Turning the feature on and signing in with it both run this mapping, so a dismissed prompt has to
// mean the same thing in both. Getting `cancelled` wrong is the expensive one: on the toggle it
// would accuse the user of a failure they chose, and on sign-in it would do the same.
describe("readAuthFailure", () => {
  it("returns null on success, which is the only way anything gets written", () => {
    expect(readAuthFailure({ success: true })).toBeNull();
  });

  it("treats every flavour of dismissal as cancelled", () => {
    // The user backing out, the app being backgrounded, and iOS pulling the sheet away all mean the
    // user did not fail a check. None of them deserve an error message.
    expect(readAuthFailure({ success: false, error: "user_cancel" })).toBe("cancelled");
    expect(readAuthFailure({ success: false, error: "app_cancel" })).toBe("cancelled");
    expect(readAuthFailure({ success: false, error: "system_cancel" })).toBe("cancelled");
  });

  it("maps the three device-setup problems to unenrolled", () => {
    // All three are fixed in iOS Settings, not in our app, so the copy points the user there.
    expect(readAuthFailure({ success: false, error: "not_enrolled" })).toBe("unenrolled");
    expect(readAuthFailure({ success: false, error: "not_available" })).toBe("unenrolled");
    expect(readAuthFailure({ success: false, error: "passcode_not_set" })).toBe("unenrolled");
  });

  it("maps a lockout to its own case, since it clears on its own", () => {
    expect(readAuthFailure({ success: false, error: "lockout" })).toBe("locked_out");
  });

  it("falls back to unknown for an unrecognised or missing error string", () => {
    expect(readAuthFailure({ success: false, error: "something_new_from_apple" })).toBe("unknown");
    expect(readAuthFailure({ success: false })).toBe("unknown");
  });

  it("treats a missing result as a failure, never as a pass", () => {
    // If we cannot tell what happened we must not behave as though the user proved who they were.
    expect(readAuthFailure(null)).toBe("unknown");
    expect(readAuthFailure(undefined)).toBe("unknown");
  });
});

// Signing in reads the token straight out of the keychain and lets that read be the biometric
// prompt, so this mapping is what stands between a dismissed sheet and a deleted credential.
describe("readKeychainFailure", () => {
  it("reads a cancelled prompt as cancelled, so backing out costs the user nothing", () => {
    // The message is iOS's own wording for errSecUserCanceled, spelled with one l.
    expect(readKeychainFailure(new Error("User canceled the operation."))).toBe("cancelled");
  });

  it("reads a refused sensor as a lockout, which the user clears with their passcode", () => {
    expect(
      readKeychainFailure(new Error("Authentication failed. Provided passphrase/PIN is incorrect")),
    ).toBe("locked_out");
  });

  it("falls back to unknown rather than guessing at a message it does not recognise", () => {
    expect(readKeychainFailure(new Error("I/O error."))).toBe("unknown");
    expect(readKeychainFailure(new Error(""))).toBe("unknown");
  });

  it("survives being handed something that is not an error at all", () => {
    expect(readKeychainFailure(null)).toBe("unknown");
    expect(readKeychainFailure(undefined)).toBe("unknown");
    expect(readKeychainFailure("a bare string")).toBe("unknown");
    expect(readKeychainFailure({ message: 42 })).toBe("unknown");
  });

  it("never asks for the credential to be deleted, whatever the message says", () => {
    // This is the whole point of the function. A read only fails for reasons that leave the token
    // sitting in the keychain; an item that is genuinely gone resolves as null and never lands here.
    // Returning `rejected` would make a user who tapped Cancel register all over again.
    const messages = [
      "User canceled the operation.",
      "Authentication failed. Provided passphrase/PIN is incorrect",
      "User interaction is not allowed.",
      "Unknown Keychain Error.",
      "something Apple has not written yet",
    ];
    for (const message of messages) {
      expect(shouldClearCredential(readKeychainFailure(new Error(message)))).toBe(false);
    }
  });
});
