// The property that matters here is not "can it store a string" but the reason the module exists:
// the Supabase session must end up in the OS keychain in pieces that each stay under SecureStore's
// 2048-byte limit, must reconstruct byte-for-byte (including a Chinese display name or an emoji in
// user metadata), and must migrate an already-signed-in user off the old plaintext AsyncStorage key
// without signing them out. A regression in any of those turns this back into either a broken login
// or the plaintext-token-at-rest problem it was written to close.

// In-memory stand-in for the native keychain. The state lives INSIDE the factory (jest hoists
// jest.mock above the imports, so the factory may not close over outer-scope variables) and is
// reached from the tests through the __mem handle it exposes.
jest.mock("expo-secure-store", () => {
  const mem = new Map<string, string>();
  return {
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "afterFirstUnlockThisDeviceOnly",
    getItemAsync: jest.fn(async (key: string) => (mem.has(key) ? mem.get(key)! : null)),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      mem.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      mem.delete(key);
    }),
    __mem: mem,
  };
});

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import {
  createSecureSessionStorage,
  secureSessionStorage,
  splitIntoChunks,
} from "../secureSessionStorage";

// The mocked keychain's backing map, for asserting exactly what was stored and how big each piece is.
const keychain = (SecureStore as unknown as { __mem: Map<string, string> }).__mem;
const utf8 = (s: string) => Buffer.byteLength(s, "utf8");

// The real Supabase storageKey shape (sb-<ref>-auth-token), so the tests exercise a genuine key.
const KEY = "sb-exlivmsklktzvrvdxlrc-auth-token";
const LIMIT = 2048;

const native = createSecureSessionStorage("ios");

beforeEach(async () => {
  jest.clearAllMocks();
  keychain.clear();
  await AsyncStorage.clear();
});

describe("what lands in the keychain", () => {
  it("round-trips a small value as a single chunk", async () => {
    await native.setItem(KEY, "hello");

    expect(await native.getItem(KEY)).toBe("hello");
    // Manifest under the bare key, the one chunk under `.0`.
    expect(keychain.get(KEY)).toBe("1");
    expect(keychain.get(`${KEY}.0`)).toBe("hello");
  });

  it("splits a large session and keeps every stored piece under the 2048-byte limit", async () => {
    // A realistic session is a few kilobytes; 5000 chars forces a multi-chunk write.
    const big = "A".repeat(5000);

    await native.setItem(KEY, big);

    expect(await native.getItem(KEY)).toBe(big);
    expect(Number(keychain.get(KEY))).toBeGreaterThan(1);
    // The whole point of the module: nothing written to SecureStore exceeds the limit.
    for (const value of keychain.values()) {
      expect(utf8(value)).toBeLessThanOrEqual(LIMIT);
    }
  });

  it("preserves multibyte characters and never splits a code point", async () => {
    const unicode = "少甜少底🍜".repeat(1200); // Chinese (3 bytes) + an emoji (4 bytes, surrogate pair)

    await native.setItem(KEY, unicode);

    expect(await native.getItem(KEY)).toBe(unicode);
    for (const value of keychain.values()) {
      expect(utf8(value)).toBeLessThanOrEqual(LIMIT);
    }
  });
});

describe("updating and clearing", () => {
  it("removes leftover chunks when a later value is shorter", async () => {
    await native.setItem(KEY, "X".repeat(5000));
    const wideCount = Number(keychain.get(KEY));
    expect(wideCount).toBeGreaterThan(2);

    await native.setItem(KEY, "small");

    expect(await native.getItem(KEY)).toBe("small");
    expect(keychain.get(KEY)).toBe("1");
    // No stale tail chunks left pointing at the old, longer value.
    for (let i = 1; i < wideCount; i++) {
      expect(keychain.has(`${KEY}.${i}`)).toBe(false);
    }
  });

  it("removeItem deletes every chunk and the manifest", async () => {
    await native.setItem(KEY, "Y".repeat(5000));

    await native.removeItem(KEY);

    expect(await native.getItem(KEY)).toBeNull();
    expect(keychain.size).toBe(0);
  });

  it("returns null when nothing is stored", async () => {
    expect(await native.getItem(KEY)).toBeNull();
  });

  it("returns null on a torn write rather than a truncated token", async () => {
    await native.setItem(KEY, "Z".repeat(5000));
    keychain.delete(`${KEY}.1`); // simulate a lost middle chunk

    // A mangled value can never deserialise into another user's session; the worst case is re-login.
    expect(await native.getItem(KEY)).toBeNull();
  });
});

describe("migration off the old AsyncStorage session", () => {
  it("pulls a legacy plaintext session into the keychain and deletes the plaintext", async () => {
    const legacy = JSON.stringify({ access_token: "jwt", refresh_token: "r".repeat(3000) });
    await AsyncStorage.setItem(KEY, legacy);

    const got = await native.getItem(KEY);

    expect(got).toBe(legacy);
    // Now in SecureStore...
    expect(Number(keychain.get(KEY))).toBeGreaterThanOrEqual(1);
    expect(await native.getItem(KEY)).toBe(legacy);
    // ...and the plaintext copy is gone.
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });

  it("prefers the keychain over any legacy copy (migration is a miss-only path)", async () => {
    await native.setItem(KEY, "fresh");
    await AsyncStorage.setItem(KEY, "stale-legacy");

    expect(await native.getItem(KEY)).toBe("fresh");
    // The legacy key is only ever consulted when the keychain is empty, so it stays untouched here.
    expect(await AsyncStorage.getItem(KEY)).toBe("stale-legacy");
  });

  it("removeItem also clears a not-yet-migrated legacy copy", async () => {
    // This is the guarantee services/biometricAuth.ts leans on to drop the session locally.
    await AsyncStorage.setItem(KEY, "legacy");

    await native.removeItem(KEY);

    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });

  it("keeps the legacy value when the keychain write fails, to retry next launch", async () => {
    const legacy = JSON.stringify({ refresh_token: "keep-me" });
    await AsyncStorage.setItem(KEY, legacy);
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(new Error("keychain unavailable"));

    const got = await native.getItem(KEY);

    expect(got).toBe(legacy); // user stays signed in
    expect(await AsyncStorage.getItem(KEY)).toBe(legacy); // plaintext left in place for a retry
  });
});

describe("secondary keys (the PKCE code verifier)", () => {
  it("stores a short secondary key as a single chunk", async () => {
    // supabase-js also stores `${storageKey}-code-verifier`; the generic adapter must handle it.
    const verifierKey = `${KEY}-code-verifier`;

    await native.setItem(verifierKey, "verifier-abc123");

    expect(await native.getItem(verifierKey)).toBe("verifier-abc123");
    expect(keychain.get(verifierKey)).toBe("1");
  });
});

describe("the web adapter", () => {
  it("uses AsyncStorage and never reaches for the keychain", async () => {
    const web = createSecureSessionStorage("web");

    await web.setItem(KEY, "web-session");

    expect(await web.getItem(KEY)).toBe("web-session");
    expect(await AsyncStorage.getItem(KEY)).toBe("web-session");
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(keychain.size).toBe(0);

    await web.removeItem(KEY);
    expect(await web.getItem(KEY)).toBeNull();
  });
});

describe("the shipped default adapter", () => {
  it("is the native SecureStore adapter on a native platform (jest-expo reports ios)", async () => {
    await secureSessionStorage.setItem(KEY, "default");

    expect(SecureStore.setItemAsync).toHaveBeenCalled();
    expect(await secureSessionStorage.getItem(KEY)).toBe("default");
  });
});

describe("splitIntoChunks", () => {
  it("returns a single empty chunk for an empty string", () => {
    expect(splitIntoChunks("")).toEqual([""]);
  });

  it("keeps every chunk within the byte budget and rejoins to the original", () => {
    const s = "少甜少底a🍜".repeat(1500);

    const parts = splitIntoChunks(s);

    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(utf8(part)).toBeLessThanOrEqual(LIMIT);
    }
    // Rejoining in order reproduces the input exactly — the proof no code point was cut.
    expect(parts.join("")).toBe(s);
  });
});
