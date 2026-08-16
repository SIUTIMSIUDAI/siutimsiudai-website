import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import type { Session } from "@supabase/supabase-js";
import { sessionStorageKey, supabase } from "./supabase";
import { secureSessionStorage } from "./secureSessionStorage";
import {
  readAuthFailure,
  readCapability,
  readKeychainFailure,
  type BiometricCapability,
  type BiometricFailure,
  type StoredCredential,
} from "@/utils/biometricLogin";

// Sign in with Face ID (or Touch ID) after being signed out.
//
// WHAT IS STORED, AND WHY THAT AND NOT SOMETHING ELSE
//
// The keychain holds the Supabase *refresh token*, never the password. A password would be a
// replayable secret sitting on the device forever, it would not work for an Apple or Google
// account, and it would survive a password change with no way for us to know. A refresh token is
// scoped to one session, can be revoked server-side, and is what Supabase itself already uses to
// keep people signed in.
//
// The token goes in behind `requireAuthentication`, which is what makes this a security feature
// rather than a convenience one. iOS will not hand the bytes back without a successful face or
// finger check, so the token is unreadable even to code running inside this app. The user's email
// and id are stored beside it WITHOUT that flag, deliberately: the sign-in screen needs to know
// whose account is on offer before prompting, and asking for a face just to render a label would be
// a prompt the user did not ask for.
//
// WHY SIGNING OUT DOES NOT REVOKE
//
// See signOutPreservingBiometrics(). GoTrue revokes the refresh token on logout at every scope, so
// a normal sign-out would leave a keychain full of dead bytes and a Face ID button that always
// fails. When the feature is on, "Sign out" clears the local session and leaves the token alive.
// The security of that rests entirely on the biometric gate above, which is why the token is stored
// the way it is.
//
// ONE PROMPT, AND WHERE IT COMES FROM
//
// There is no shared authentication context between calls, so every trip to a gated keychain item
// is its own face or finger check. Asking three times to sign in once is not a security feature, it
// is a bug, so each path here is built to touch the gate exactly once:
//
//   Signing in  -> the keychain read IS the prompt. Nothing else in that path touches the item.
//   Turning on  -> an explicit prompt, because the write that follows creates a new item and iOS
//                  does not ask on a create. Without it the switch would flip with no confirmation.
//
// The rule underneath both: iOS prompts when a gated item is READ or UPDATED, never when one is
// created or deleted. writeToken() leans on that, deleting before writing so every write is a
// create. See its comment for what that buys.

const TOKEN_KEY = "siutimsiudai.biometric.refreshToken";
const OWNER_KEY = "siutimsiudai.biometric.owner";

/** Options that put the item behind the biometric gate. Only ever used for the token itself. */
const PROTECTED: SecureStore.SecureStoreOptions = {
  requireAuthentication: true,
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/** Options for the non-secret label. Same device-only rule, no prompt. */
const UNPROTECTED: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/**
 * Store the token without raising a prompt.
 *
 * iOS asks for a face or finger when an existing gated item is updated, but not when one is created.
 * setItemAsync tries an add first and quietly falls back to an update when the key is already there,
 * so writing over the old token would prompt. Deleting first makes every write a create instead.
 *
 * This is not a micro-optimisation. Supabase rotates the refresh token roughly hourly and the auth
 * store rewrites the keychain each time, so without this a Face ID sheet would appear on top of
 * whatever the user was doing, once an hour, for no reason they could see.
 */
async function writeToken(token: string): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY, PROTECTED).catch(() => {});
  await SecureStore.setItemAsync(TOKEN_KEY, token, PROTECTED);
}

/**
 * What this device can do right now. Safe to call anywhere: on web, in Expo Go, or on a simulator
 * with no enrolled biometrics it resolves to unavailable rather than throwing.
 */
export async function getCapability(): Promise<BiometricCapability> {
  try {
    const [hasHardware, isEnrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    return readCapability({ hasHardware, isEnrolled, types: types as unknown as number[] });
  } catch {
    return readCapability(null);
  }
}

/**
 * Who the stored credential belongs to, or null if nothing is registered. Reads only the
 * unprotected half, so this never shows a prompt and is cheap enough to call on every render of the
 * sign-in screen.
 */
export async function getStoredCredential(): Promise<StoredCredential | null> {
  try {
    const raw = await SecureStore.getItemAsync(OWNER_KEY, UNPROTECTED);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredCredential>;
    if (typeof parsed?.userId !== "string" || parsed.userId.length === 0) return null;
    return { userId: parsed.userId, email: typeof parsed.email === "string" ? parsed.email : null };
  } catch {
    // Corrupt or unreadable: treat as "not registered" so the UI falls back to password sign-in.
    return null;
  }
}

/** True when a credential is registered on this device. */
export async function isEnabled(): Promise<boolean> {
  return (await getStoredCredential()) !== null;
}

/**
 * Raise the system biometric prompt and reduce the outcome to a failure, or null on success.
 *
 * Only enable() uses this. Signing in gets its prompt from the keychain read itself, because that
 * read has to happen anyway and one sign-in should cost one face check. Turning the feature on has
 * no such read to lean on: the write that follows creates a new item, and iOS does not ask on a
 * create, so without an explicit prompt the switch would flip with nobody proving it was them.
 *
 * `disableDeviceFallback` is false so someone whose face is not recognised can still confirm with
 * the device passcode, which is what people expect of a settings toggle.
 */
async function promptForBiometrics(
  promptMessage: string,
  cancelLabel: string,
): Promise<BiometricFailure | null> {
  try {
    return readAuthFailure(
      await LocalAuthentication.authenticateAsync({
        promptMessage,
        cancelLabel,
        disableDeviceFallback: false,
      }),
    );
  } catch {
    return "unknown";
  }
}

export interface BiometricEnableResult {
  ok: boolean;
  failure?: BiometricFailure;
}

/**
 * Register the current session for biometric sign-in.
 *
 * The face or finger check is raised explicitly here rather than left to the keychain write. iOS
 * only prompts on that write on some versions, so relying on it meant the switch could flip on with
 * no confirmation at all: the user was never asked to prove it was them, and never got to see the
 * thing they had just enabled actually work. Asking first also means a dismissed prompt leaves the
 * keychain untouched, rather than writing a credential and then having to unpick it.
 *
 * Nothing is written unless the prompt succeeds, and a failed write clears both halves, so the
 * feature is never left half-registered.
 */
export async function enable(
  session: Session,
  promptMessage: string,
  cancelLabel: string,
): Promise<BiometricEnableResult> {
  const token = session.refresh_token;
  if (!token || !session.user?.id) return { ok: false, failure: "unknown" };

  const failure = await promptForBiometrics(promptMessage, cancelLabel);
  if (failure) return { ok: false, failure };

  try {
    await writeToken(token);
    await SecureStore.setItemAsync(
      OWNER_KEY,
      JSON.stringify({ userId: session.user.id, email: session.user.email ?? null }),
      UNPROTECTED,
    );
    return { ok: true };
  } catch {
    await disable();
    return { ok: false, failure: "unknown" };
  }
}

/** Remove the credential. Used by the toggle, by a failed sign-in, and by account deletion. */
export async function disable(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY, PROTECTED).catch(() => {}),
    SecureStore.deleteItemAsync(OWNER_KEY, UNPROTECTED).catch(() => {}),
  ]);
}

/**
 * Replace the stored token with the current one.
 *
 * Supabase rotates the refresh token on every use, and a rotated-away token stops working once the
 * short reuse window closes. Without this the credential would quietly go stale after a day or two
 * of normal use and Face ID sign-in would fail exactly when the user finally needed it. Only runs
 * when the feature is already on and the session belongs to the registered user.
 *
 * Silent by design: it runs on a timer the user did not start, so it must never put a prompt on
 * screen. writeToken() is what keeps that promise.
 */
export async function refreshStoredToken(session: Session | null): Promise<void> {
  if (!session?.refresh_token || !session.user?.id) return;
  const credential = await getStoredCredential();
  if (!credential || credential.userId !== session.user.id) return;
  try {
    await writeToken(session.refresh_token);
  } catch {
    // The old token was cleared to keep the write silent, so there is no previous value to fall back
    // on. Drop the rest of the credential rather than leave an owner with nothing behind it, which
    // would offer a Face ID button that fails and then sends the user to register again anyway.
    await disable();
  }
}

export interface BiometricSignInResult {
  ok: boolean;
  failure?: BiometricFailure;
}

/**
 * Unlock the stored refresh token with a face or finger, then exchange it for a live session.
 *
 * The keychain read IS the prompt. There is deliberately no separate authenticateAsync call in front
 * of it: that would be a second face check for one sign-in, and the read cannot be skipped. The
 * bilingual reason string rides along on `authenticationPrompt`, so nothing is lost by dropping it.
 *
 * The button this sits behind is a shortcut, not the only door. Someone the sensor will not
 * recognise still has the password form and the Apple and Google buttons on the same screen, which
 * is why there is no passcode escape hatch here.
 */
export async function signIn(promptMessage: string): Promise<BiometricSignInResult> {
  const client = supabase;
  if (!client) return { ok: false, failure: "unknown" };

  const credential = await getStoredCredential();
  if (!credential) return { ok: false, failure: "unknown" };

  let token: string | null = null;
  try {
    token = await SecureStore.getItemAsync(TOKEN_KEY, {
      ...PROTECTED,
      authenticationPrompt: promptMessage,
    });
  } catch (error) {
    // The read was refused, not the credential. A dismissed sheet and a sensor that would not play
    // both land here and both leave the token exactly where it is, so nothing is deleted.
    return { ok: false, failure: readKeychainFailure(error) };
  }
  if (!token) {
    // Null, not a rejection, is how a dead item reports itself. That covers both a missing key and
    // one iOS invalidated because the enrolled face or fingerprints changed since it was written.
    // Either way the bytes are unreachable for good, so the credential is finished.
    await disable();
    return { ok: false, failure: "rejected" };
  }

  // Exchange the refresh token for a fresh session. supabase-js writes the new session to its own
  // storage and raises SIGNED_IN, which the auth store is already listening for, so the route gate
  // advances on its own from here.
  const { data, error } = await client.auth.refreshSession({ refresh_token: token });
  if (error || !data.session) {
    // The server refused it: revoked, expired, or the password was changed elsewhere. Nothing on
    // this device can revive it, so clear it and let the user register again after a password login.
    await disable();
    return { ok: false, failure: "rejected" };
  }

  // No write-back here. That SIGNED_IN event carries the rotated token to the auth store, which
  // stores it through the same path every other rotation uses. Doing it again would be a second
  // trip to the keychain for a job already in hand.
  return { ok: true };
}

/**
 * Sign out in a way that leaves the stored refresh token usable, so Face ID can sign the user back
 * in. Returns false when biometric login is not on, meaning the caller should do a normal signOut.
 *
 * GoTrue revokes the refresh token on logout at EVERY scope, `local` included. Calling signOut()
 * here would therefore destroy the exact token the keychain is holding, and the Face ID button
 * would fail forever after the first sign-out. So this deliberately makes no server call: it
 * deletes supabase-js's persisted session from secure storage and stops the refresh timer, which
 * leaves the user signed out on this device with the session still alive server-side.
 *
 * That is a real trade-off and worth naming. The session outlives the sign-out, and what protects
 * it is the biometric gate on the keychain item holding the only copy of the token. Anyone who
 * picks up the phone sees the sign-in screen and cannot get past it without the registered face or
 * the device passcode. Turning the feature off, or signing in as a different user, revokes properly.
 */
export async function signOutPreservingBiometrics(): Promise<boolean> {
  const client = supabase;
  if (!client) return false;
  if (!(await isEnabled())) return false;
  try {
    client.auth.stopAutoRefresh();
  } catch {
    // Timer control is best effort; the storage removal below is what actually signs the user out.
  }
  try {
    await secureSessionStorage.removeItem(sessionStorageKey);
  } catch {
    // If the session cannot be removed the user is still cleared in memory by the auth store, and
    // the next launch signs them straight back in. Not ideal, but not a lockout either.
    return false;
  }
  return true;
}

/**
 * Fully sign out and forget the credential. This is the honest exit: the refresh token is revoked
 * server-side and the keychain item is deleted, so nothing about this account is left on the device.
 * Used when the user switches the feature off and when a different account signs in.
 */
export async function revokeAndForget(): Promise<void> {
  await disable();
  try {
    await supabase?.auth.signOut();
  } catch {
    // The credential is gone either way, which is the part that matters for the next user.
  }
}
