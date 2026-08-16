import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Encrypted-at-rest storage for the Supabase auth session (a short-lived access JWT plus the
 * rotating refresh token), used as supabase-js's `storage` adapter.
 *
 * WHY THIS EXISTS
 *
 * supabase-js persists the session so a returning user is not asked to sign in on every launch. The
 * documented Expo adapter for that is AsyncStorage, which on native writes PLAINTEXT into the app
 * sandbox. On a healthy, non-jailbroken phone the sandbox already keeps other apps out, so this is
 * not remotely exploitable. The case it closes is the physical one: a rooted / jailbroken device, or
 * one imaged with a forensic tool, where the sandbox no longer holds and the refresh token can be
 * lifted as readable text. A stolen refresh token mints access tokens until it is revoked. Moving
 * the session into the OS keychain (iOS) / Keystore-backed store (Android) makes it hardware
 * encrypted at rest, so there is nothing readable to lift.
 *
 * THE 2048-BYTE LIMIT
 *
 * SecureStore warns above 2048 bytes per value and a future SDK may throw, yet a Supabase session
 * routinely runs several kilobytes. So a value is split into <= 2000-byte UTF-8 chunks stored under
 * `${key}.0`, `${key}.1`, ... with a one-line manifest (the chunk count) under `${key}` itself. The
 * split is measured in UTF-8 bytes and never lands inside a code point, so a display name in Chinese
 * or an emoji in user metadata round-trips byte-for-byte.
 *
 * MIGRATION (so the upgrade signs nobody out)
 *
 * An already-signed-in user has their session under the OLD single AsyncStorage key. The first read
 * that finds nothing in the keychain pulls that legacy value forward into SecureStore and deletes
 * the plaintext copy — the user stays signed in, and the plaintext does not linger. removeItem also
 * clears any not-yet-migrated legacy copy, so a sign-out is a real sign-out either way. That last
 * part is what services/biometricAuth.ts leans on to drop the session locally.
 *
 * WEB
 *
 * expo-secure-store does not exist in a browser, so web keeps using AsyncStorage. There is no
 * keychain to reach for there, and the web build is a preview surface rather than the shipping app.
 */

export interface SessionStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

// Under the 2048-byte SecureStore soft limit, with headroom for any native framing overhead.
const CHUNK_BYTES = 2000;

// The session should survive the screen locking (so a foreground token refresh still reads it) but
// must never leave the device: no iCloud / Google backup, no restore onto a different phone.
// AFTER_FIRST_UNLOCK + THIS_DEVICE_ONLY is the accepted keychain posture for exactly that.
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/** UTF-8 byte length of a single Unicode code point. */
function codePointBytes(cp: number): number {
  if (cp < 0x80) return 1;
  if (cp < 0x800) return 2;
  if (cp < 0x10000) return 3;
  return 4;
}

/**
 * Split a string into pieces that each encode to at most CHUNK_BYTES UTF-8 bytes, without ever
 * cutting through a code point. `for..of` walks by code point, so a surrogate pair (an emoji, say)
 * is measured and placed whole. Concatenating the pieces back in order reproduces the input exactly.
 * Always returns at least one piece, so an empty string stores as a single empty chunk.
 */
export function splitIntoChunks(value: string): string[] {
  const chunks: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const ch of value) {
    const bytes = codePointBytes(ch.codePointAt(0) as number);
    if (current !== "" && currentBytes + bytes > CHUNK_BYTES) {
      chunks.push(current);
      current = "";
      currentBytes = 0;
    }
    current += ch;
    currentBytes += bytes;
  }
  chunks.push(current);
  return chunks;
}

function chunkKey(key: string, index: number): string {
  return `${key}.${index}`;
}

/** The stored chunk count for `key`, or 0 when nothing (usable) is stored. */
async function readManifest(key: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(key, OPTIONS);
  if (raw === null) return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

async function nativeGetItem(key: string): Promise<string | null> {
  try {
    const count = await readManifest(key);
    if (count === 0) return migrateLegacy(key);
    let out = "";
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i), OPTIONS);
      // A missing chunk means a torn write or a partly-cleared item. Report "no session" rather
      // than hand supabase-js a truncated token — the worst case is a re-login, never another
      // user's session, because a mangled value cannot deserialise into a valid one.
      if (part === null) return null;
      out += part;
    }
    return out;
  } catch {
    // Keychain read refused, or the item was invalidated by the OS. Treat as signed out; the user
    // can sign in again. Never throw: this runs while the Supabase client is being constructed.
    return null;
  }
}

async function nativeSetItem(key: string, value: string): Promise<void> {
  const parts = splitIntoChunks(value);
  const previous = await readManifest(key);
  for (let i = 0; i < parts.length; i++) {
    await SecureStore.setItemAsync(chunkKey(key, i), parts[i], OPTIONS);
  }
  // Drop any chunks left over from a longer previous value before the manifest starts pointing past
  // them.
  for (let i = parts.length; i < previous; i++) {
    await SecureStore.deleteItemAsync(chunkKey(key, i), OPTIONS).catch(() => {});
  }
  // The manifest is the commit point, written last. Any interruption before this leaves the read
  // path landing on "no / invalid session" (a re-login) rather than on a mismatched account.
  await SecureStore.setItemAsync(key, String(parts.length), OPTIONS);
}

async function nativeRemoveItem(key: string): Promise<void> {
  const count = await readManifest(key);
  const deletions: Promise<void>[] = [];
  for (let i = 0; i < count; i++) {
    deletions.push(SecureStore.deleteItemAsync(chunkKey(key, i), OPTIONS).catch(() => {}));
  }
  await Promise.all(deletions);
  await SecureStore.deleteItemAsync(key, OPTIONS).catch(() => {});
  // Clear any pre-migration plaintext copy too, so a sign-out is a real sign-out even for a user who
  // has not been migrated yet. signOutPreservingBiometrics depends on this.
  await AsyncStorage.removeItem(key).catch(() => {});
}

/**
 * Pull a session written by the old AsyncStorage adapter forward into the keychain, once. Returns
 * the legacy value (so the user stays signed in) and, on a successful move, deletes the plaintext.
 * A failed move keeps the plaintext and retries on the next read rather than losing the session.
 */
async function migrateLegacy(key: string): Promise<string | null> {
  let legacy: string | null = null;
  try {
    legacy = await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
  if (legacy === null) return null;
  try {
    await nativeSetItem(key, legacy);
    await AsyncStorage.removeItem(key);
  } catch {
    // Keychain unavailable this launch. Leave the legacy copy in place and try again next time.
  }
  return legacy;
}

const nativeStorage: SessionStorage = {
  getItem: nativeGetItem,
  setItem: nativeSetItem,
  removeItem: nativeRemoveItem,
};

const webStorage: SessionStorage = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};

/**
 * The session-storage adapter for a given platform. Exposed as a factory so both branches are
 * unit-testable without a real device; the app uses the default `secureSessionStorage` below.
 */
export function createSecureSessionStorage(os: typeof Platform.OS = Platform.OS): SessionStorage {
  return os === "web" ? webStorage : nativeStorage;
}

export const secureSessionStorage: SessionStorage = createSecureSessionStorage();
