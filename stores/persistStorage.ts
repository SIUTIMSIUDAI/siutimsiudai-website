import AsyncStorage from "@react-native-async-storage/async-storage";
import { createJSONStorage, PersistStorage, StateStorage } from "zustand/middleware";
import { PERSONAL_DATA_KEYS, resolveScopedKey, scopedKeyFor } from "@/utils/persistScope";

// The app was renamed from "sikfan" to "siutimsiudai" (少甜少底). Persisted stores keyed their
// data under the old prefix, so the first time a new-prefixed key is read we pull any legacy
// value forward and delete the stale copy — keeping every already-logged meal, recipe, and
// pantry item across the rename. Once migrated, no legacy keys remain and this is a plain
// pass-through. Every store shares the `<prefix>-<store>` key shape, so one generic hook covers
// them all.
const LEGACY_PREFIX = "sikfan-";
const CURRENT_PREFIX = "siutimsiudai-";

// The active account scope. Personal stores read and write under `<key>__u_<userId>` while a user
// is signed in, so two accounts on one device never share a diary; `null` is the signed-out "guest"
// scope, which uses the bare keys. authStore/dataScope own this: they flip it and then reload the
// personal stores on every sign-in, sign-out and account switch (see stores/dataScope.ts).
let activeUserScope: string | null = null;

/** Point the storage layer at an account (or null for the signed-out guest scope). */
export function setPersistUserScope(userId: string | null): void {
  activeUserScope = userId;
}

// Records which account has already absorbed the device's pre-scoping (bare-key) data, so ONLY the
// first account to sign in after this update inherits the existing on-device history; every later
// account on the same device starts from its own clean, scoped copy.
const SCOPE_OWNER_KEY = "siutimsiudai-scope-owner";

/**
 * One-time migration for the installed base: fold any pre-scoping data still sitting on the bare
 * keys into the first signed-in account's scoped keys, then clear the bare copies. Idempotent and
 * best-effort — a failure just leaves the bare data in place to retry next launch. MUST run before
 * the personal stores reload for that account, so the reload reads the just-adopted data.
 */
export async function adoptBareDataIfFirst(userId: string): Promise<void> {
  try {
    const owner = await AsyncStorage.getItem(SCOPE_OWNER_KEY);
    if (owner != null) return; // an account already claimed the device's pre-scoping data
    for (const name of PERSONAL_DATA_KEYS) {
      const scoped = scopedKeyFor(name, userId);
      const existingScoped = await AsyncStorage.getItem(scoped);
      if (existingScoped != null) continue; // never overwrite an account's own scoped copy
      const bare = await AsyncStorage.getItem(name);
      if (bare == null) continue; // nothing on the bare key to adopt
      await AsyncStorage.setItem(scoped, bare);
      await AsyncStorage.removeItem(name);
    }
    await AsyncStorage.setItem(SCOPE_OWNER_KEY, userId);
  } catch {
    // Best-effort: leave the bare data untouched; the next launch retries the adoption.
  }
}

const migratingStorage: StateStorage = {
  getItem: async (name) => {
    // Resolve the store's logical name to the account-scoped physical key first, so a signed-in
    // read only ever sees that account's copy.
    const physical = resolveScopedKey(name, activeUserScope);
    const current = await AsyncStorage.getItem(physical);
    if (current != null) return current;
    // The sikfan->siutimsiudai rename only ever wrote bare keys, so only chase the legacy value when
    // the resolved key IS the bare key (a non-personal store, or the signed-out guest scope).
    if (physical !== name || !name.startsWith(CURRENT_PREFIX)) return null;
    const legacyName = LEGACY_PREFIX + name.slice(CURRENT_PREFIX.length);
    const legacy = await AsyncStorage.getItem(legacyName);
    if (legacy == null) return null;
    await AsyncStorage.setItem(name, legacy);
    await AsyncStorage.removeItem(legacyName);
    return legacy;
  },
  setItem: (name, value) => AsyncStorage.setItem(resolveScopedKey(name, activeUserScope), value),
  removeItem: (name) => AsyncStorage.removeItem(resolveScopedKey(name, activeUserScope)),
};

// Shared AsyncStorage-backed JSON storage for every persisted store. Swapping in a
// different driver later (e.g. expo-secure-store for the session) is a one-line change.
// JSON storage is shape-agnostic at runtime, so a single instance serves every store;
// the PersistStorage<any> annotation lets it slot into stores of any persisted shape.
export const persistStorage = createJSONStorage(() => migratingStorage) as PersistStorage<any>;
