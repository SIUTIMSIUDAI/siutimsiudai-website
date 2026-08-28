import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { useAuthStore } from "@/stores/authStore";
import { isPaidTier, useSubscriptionStore } from "@/stores/useSubscriptionStore";
import { useNutritionStore } from "@/stores/nutritionStore";
import { todayKey } from "@/utils/formatters";
import { addDirty, buildDailyLogPayload, removeDirty, shouldSyncDate } from "@/utils/nutritionSync";
import { DailyLog } from "@/types";

// Best-effort mirror of the local food diary to Supabase so a linked manager can read it (RLS in
// 0002). The local Zustand store is the source of truth; this is write-through backup, exactly like
// pantrySyncService. It never throws and quietly no-ops when there is nothing to do: no Supabase
// (Expo Go / web / tests), or a signed-out/guest user whose diary stays on-device.

const DEBOUNCE_MS = 1500;
const DIRTY_KEY = "siutimsiudai-nutrition-dirty";
const timers = new Map<string, ReturnType<typeof setTimeout>>();

// Dirty-date set: dates whose last sync failed. Persisted so an offline edit still reaches the
// cloud on a later foreground / sign-in, without a general sync queue (YAGNI, per spec A4).
let dirty: string[] = [];
let dirtyLoaded = false;

async function loadDirty(): Promise<void> {
  if (dirtyLoaded) return;
  dirtyLoaded = true;
  try {
    const raw = await AsyncStorage.getItem(DIRTY_KEY);
    dirty = raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    dirty = [];
  }
}

async function persistDirty(): Promise<void> {
  try {
    await AsyncStorage.setItem(DIRTY_KEY, JSON.stringify(dirty));
  } catch {
    // Best-effort: a failed persist only costs a retry opportunity, never correctness.
  }
}

async function markDirty(date: string): Promise<void> {
  await loadDirty();
  dirty = addDirty(dirty, date);
  await persistDirty();
}

async function clearDirty(date: string): Promise<void> {
  await loadDirty();
  const next = removeDirty(dirty, date);
  if (next.length !== dirty.length) {
    dirty = next;
    await persistDirty();
  }
}

// Publish exactly one date. Reads auth + tier itself (keeps the store pure). Returns quietly for
// guests and for dates outside the dependent's window.
export async function syncDay(date: string): Promise<void> {
  if (!supabase) return;
  const userId = useAuthStore.getState().session?.user?.id;
  if (!userId) return; // guest / signed-out: diary stays local
  const tier = useSubscriptionStore.getState().activeTier;
  if (!shouldSyncDate(isPaidTier(tier), date)) return; // outside the dependent's retention window

  const log: DailyLog =
    useNutritionStore.getState().logsByDate[date] ??
    { id: "", userId, logDate: date, entries: [] };
  const payload = buildDailyLogPayload(log);

  try {
    const { error } = await supabase.rpc("sync_daily_log", payload);
    if (error) {
      await markDirty(date);
      return;
    }
    await clearDirty(date);
  } catch {
    await markDirty(date);
  }
}

// Debounce per date so a burst of edits to the same day makes one RPC call.
export function scheduleSync(date: string): void {
  const existing = timers.get(date);
  if (existing) clearTimeout(existing);
  timers.set(
    date,
    setTimeout(() => {
      timers.delete(date);
      void syncDay(date);
    }, DEBOUNCE_MS),
  );
}

// Backfill: push every locally-kept day that is in scope. Called on sign-in and on app foreground,
// so an already-kept diary appears for the manager without waiting for the next edit.
export async function syncAllWindowedDays(): Promise<void> {
  if (!supabase) return;
  if (!useAuthStore.getState().session?.user?.id) return;
  const tier = useSubscriptionStore.getState().activeTier;
  const today = todayKey();
  for (const date of Object.keys(useNutritionStore.getState().logsByDate)) {
    if (shouldSyncDate(isPaidTier(tier), date, today)) {
      await syncDay(date);
    }
  }
}

// Retry any dates whose last sync failed. syncDay clears them from the set on success.
export async function flushDirtyDates(): Promise<void> {
  if (!supabase) return;
  await loadDirty();
  for (const date of [...dirty]) {
    await syncDay(date);
  }
}
