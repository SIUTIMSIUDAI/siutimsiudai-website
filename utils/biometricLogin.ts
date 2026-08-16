// The decisions behind biometric sign-in, kept free of native modules so they can be tested.
//
// Two questions run through the whole feature and they are easy to conflate:
//
//   "Can this device do biometrics?"  -> hardware exists AND a face/finger is enrolled.
//   "Has this user turned it on?"     -> a credential is sitting in the keychain.
//
// The first decides whether the Profile toggle is worth showing at all. The second decides whether
// the sign-in screen offers a Face ID button. A device can answer yes to one and no to the other in
// both directions: a brand-new phone with Face ID set up but the feature never enabled, and a phone
// where the user enabled it and later removed their face from iOS Settings.

/** What expo-local-authentication reports, reduced to the shape this module reasons about. */
export interface BiometricProbe {
  hasHardware: boolean;
  isEnrolled: boolean;
  /** LocalAuthentication.AuthenticationType values: 1 = fingerprint, 2 = facial, 3 = iris. */
  types: number[];
}

export type BiometricKind = "face" | "fingerprint" | "iris" | "generic";

export interface BiometricCapability {
  /** True only when the device can actually perform a biometric check right now. */
  available: boolean;
  /** Drives the copy, so the button says "Face ID" on a Face ID phone and "Touch ID" on a Touch ID one. */
  kind: BiometricKind;
}

const FINGERPRINT = 1;
const FACIAL = 2;
const IRIS = 3;

/**
 * Reduce a raw probe to "can we offer this, and what do we call it".
 *
 * Naming it correctly is not cosmetic. A prompt that says "Face ID" on an iPhone SE is asking the
 * user for something their phone cannot do, and they will assume the feature is broken rather than
 * that we got the label wrong. When the device reports several methods we prefer face, because iOS
 * shows the Face ID sheet first where both exist.
 *
 * Unenrolled hardware is deliberately reported as unavailable. A phone with a Face ID sensor but no
 * face registered will fail every prompt, so offering the toggle would only produce a setting that
 * cannot be switched on.
 */
export function readCapability(probe: BiometricProbe | null | undefined): BiometricCapability {
  if (!probe || !probe.hasHardware || !probe.isEnrolled) return { available: false, kind: "generic" };
  const types = Array.isArray(probe.types) ? probe.types : [];
  if (types.includes(FACIAL)) return { available: true, kind: "face" };
  if (types.includes(FINGERPRINT)) return { available: true, kind: "fingerprint" };
  if (types.includes(IRIS)) return { available: true, kind: "iris" };
  // Enrolled hardware of a kind we do not recognise still works; we just describe it generically.
  return { available: true, kind: "generic" };
}

/** i18n key for the name of the method, e.g. "Face ID". Used inside sentences and on buttons. */
export function biometricNameKey(kind: BiometricKind): string {
  return `auth.biometricName.${kind}`;
}

/** What the stored credential knows about who it signs in. */
export interface StoredCredential {
  userId: string;
  email: string | null;
}

/**
 * Should the sign-in screen offer the biometric button?
 *
 * Requires both a usable sensor and a stored credential. The stored credential alone is not enough:
 * if the user has since removed their face in iOS Settings the keychain item is unreadable, and a
 * button that always fails is worse than no button.
 */
export function canOfferBiometricSignIn(
  capability: BiometricCapability,
  credential: StoredCredential | null,
): boolean {
  return capability.available && credential !== null;
}

/**
 * Is the credential in the keychain the right one for the user who just signed in?
 *
 * Shared devices are the reason this exists. If someone signs out and a second person signs in with
 * their own password, the keychain still holds the first person's token. Left alone, the sign-in
 * screen would offer to log the second person straight into the first person's food diary. Any
 * mismatch means the stored credential is stale and must go.
 */
export function credentialMatchesUser(
  credential: StoredCredential | null,
  userId: string | null | undefined,
): boolean {
  if (!credential || !userId) return false;
  return credential.userId === userId;
}

/**
 * Why a biometric sign-in attempt failed, in terms the UI can act on.
 *
 * `cancelled` is silent: the user dismissed the sheet on purpose and does not need to be told what
 * they just did. `unenrolled` and `locked_out` are recoverable on the device, so we explain and
 * leave the credential in place. `rejected` means the server refused the token, which is the one
 * case where the credential is genuinely dead and has to be cleared, sending the user back to their
 * password once so they can register again.
 */
export type BiometricFailure = "cancelled" | "unenrolled" | "locked_out" | "rejected" | "unknown";

/** True when the failure means the stored credential is worthless and should be deleted. */
export function shouldClearCredential(failure: BiometricFailure): boolean {
  return failure === "rejected";
}

/** A LocalAuthentication outcome, narrowed to the two fields the mapping below reads. */
export interface BiometricAuthResult {
  success: boolean;
  error?: string;
}

/**
 * Reduce a LocalAuthentication result to a failure the UI can act on, or null when it succeeded.
 *
 * Shared by turning the feature on and by signing in with it, so a dismissed prompt means the same
 * thing in both places and neither can drift from the other. It lives here rather than in the
 * service because the string-to-failure mapping is the part worth testing and the native call is
 * not. A missing result counts as a failure rather than a success: if we cannot tell what happened,
 * we must not behave as though the user proved who they were.
 */
export function readAuthFailure(
  result: BiometricAuthResult | null | undefined,
): BiometricFailure | null {
  if (!result) return "unknown";
  if (result.success) return null;
  const reason = result.error ?? "";
  if (reason === "user_cancel" || reason === "app_cancel" || reason === "system_cancel") {
    return "cancelled";
  }
  if (reason === "not_enrolled" || reason === "not_available" || reason === "passcode_not_set") {
    return "unenrolled";
  }
  // Too many failed attempts. iOS wants a passcode before it will try the sensor again, so this is
  // recoverable on the device and any stored credential stays put.
  if (reason === "lockout") return "locked_out";
  return "unknown";
}

/**
 * Reduce a rejected keychain read to a failure the UI can act on.
 *
 * The important half of this is what it never returns. A read only rejects for reasons that leave
 * the stored token intact: the user dismissed the sheet, or the sensor would not play. An item that
 * has genuinely gone, including one iOS invalidated because the enrolled face or fingerprints
 * changed, comes back as null instead of rejecting and so never reaches here. That is why nothing
 * below maps to `rejected`, the one failure that deletes the credential. Clearing it because
 * somebody dismissed a prompt would make them register all over again for changing their mind.
 *
 * The match is on the message text because expo-secure-store gives every keychain error the same
 * code and varies only the reason string. Anything unrecognised falls through to `unknown`, which
 * shows a generic message and keeps the credential, so guessing wrong here is never destructive.
 */
export function readKeychainFailure(error: unknown): BiometricFailure {
  const raw = (error as { message?: unknown } | null | undefined)?.message;
  const message = typeof raw === "string" ? raw.toLowerCase() : "";
  if (message.includes("cancel")) return "cancelled";
  // errSecAuthFailed. On an item held behind biometrics this is what too many bad attempts looks
  // like, and it clears once the device is unlocked with its passcode.
  if (message.includes("authentication failed")) return "locked_out";
  return "unknown";
}
