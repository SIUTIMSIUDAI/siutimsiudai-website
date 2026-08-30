import type { StoreApi } from "zustand";
import { adoptBareDataIfFirst, persistStorage, setPersistUserScope } from "./persistStorage";
import { PERSONAL_DATA_KEYS } from "@/utils/persistScope";
import { useNutritionStore } from "./nutritionStore";
import { useRecipeStore } from "./recipeStore";
import { usePantryStore } from "./pantryStore";
import { useMealPlanStore } from "./mealPlanStore";
import { useGroceryStore } from "./groceryStore";
import { useSavedMealsStore } from "./savedMealsStore";
import { useFamilyStore } from "./familyStore";

// The scope orchestrator: the single owner of "whose data is live on this device". authStore calls
// reconcileDataScope() on every auth transition (cold start, sign-in, sign-out, account switch). It
// points the storage layer at the account (persistStorage scope), folds any pre-scoping data into
// the first account (adoptBareDataIfFirst), then reloads every personal store from that account's
// scoped keys. This is what stops two accounts on one device from sharing a diary/pantry/recipe box,
// and — because it runs BEFORE the diary sync — stops the previous account's leftover in-memory
// entries from uploading under the new account's id.

// Every persisted personal store paired with the storage key it uses. Each `name` is constrained to
// PERSONAL_DATA_KEYS, so a typo or a key the storage layer would not scope fails the build. MUST stay
// in lockstep with PERSONAL_DATA_KEYS and each store's persist `name`.
interface PersonalStore {
  name: (typeof PERSONAL_DATA_KEYS)[number];
  store: StoreApi<any>;
}

const PERSONAL_STORES: PersonalStore[] = [
  { name: "siutimsiudai-nutrition", store: useNutritionStore },
  { name: "siutimsiudai-recipes", store: useRecipeStore },
  { name: "siutimsiudai-pantry", store: usePantryStore },
  { name: "siutimsiudai-meal-plan", store: useMealPlanStore },
  { name: "siutimsiudai-grocery", store: useGroceryStore },
  { name: "siutimsiudai-saved-meals", store: useSavedMealsStore },
  { name: "siutimsiudai-family", store: useFamilyStore },
];

// Reset one store to the signed-in account's data. Reads that account's scoped copy FIRST, then
// replaces in-memory state in a SINGLE write, so the previous account's data is gone and no
// default-state write can race the read. A fresh account (no scoped copy) falls back to the store's
// initial state and re-runs first-launch seeding (recipes / pantry / saved meals) so it starts like
// a new install rather than empty.
async function reloadStoreFromScope({ name, store }: PersonalStore): Promise<void> {
  const initial = store.getInitialState();
  const stored = await persistStorage.getItem(name);
  const next = stored && stored.state ? { ...initial, ...stored.state } : initial;
  store.setState(next, true);
  const seed = (store.getState() as { seedIfEmpty?: () => void }).seedIfEmpty;
  if (typeof seed === "function") seed();
}

// The scope the stores are currently loaded for. `undefined` means "never reconciled", so the first
// call always runs; afterwards a repeat of the same scope is a no-op (auth re-emits the same user on
// token refresh, and reloading then would needlessly churn every store).
let currentScope: string | null | undefined = undefined;

/**
 * Point every personal store at `userId`'s data (or the signed-out guest scope for null). Idempotent
 * per scope. authStore awaits this on every auth transition; it MUST resolve before the diary sync
 * runs, or the sync would read the previous account's leftover entries.
 */
export async function reconcileDataScope(userId: string | null): Promise<void> {
  if (userId === currentScope) return;
  currentScope = userId;
  setPersistUserScope(userId);
  // The first account to sign in after this update inherits the device's existing (bare-key) data;
  // every later account starts from its own scoped copy. No-op for the guest scope.
  if (userId) await adoptBareDataIfFirst(userId);
  await Promise.all(PERSONAL_STORES.map(reloadStoreFromScope));
}
