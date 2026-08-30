// Pure core of the dependent-side diary sync. No store or Supabase imports, so it is fully
// unit-testable. The side-effecting orchestration (RPC call, debounce, persistence, backfill)
// lives in services/nutritionSyncService.ts and calls into these.

import { DailyLog, EntryMicronutrients, MealCustomization } from "@/types";
import { sumEntryMacros } from "./customizations";
import { isWithinHistoryWindow } from "./historyWindow";

// One entry as the sync_daily_log RPC expects it. Field names and order mirror the
// jsonb_to_recordset column list in database/0005_family_log_sync.sql. Macros are the UNTWEAKED
// base; customizations travel alongside so the server (and the manager) can recompute effective.
export interface SyncEntryPayload {
  name: string;
  name_zh: string;
  meal_type: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  quantity: number;
  unit: string;
  source: string;
  image_url: string | null;
  barcode: string | null;
  logged_at: string;
  customizations: MealCustomization[];
  micros: EntryMicronutrients | null;
}

// The full argument object handed to supabase.rpc("sync_daily_log", ...).
export interface SyncDailyLogArgs {
  p_log_date: string;
  p_total_calories: number;
  p_total_protein: number;
  p_total_carbs: number;
  p_total_fat: number;
  p_entries: SyncEntryPayload[];
}

export function buildDailyLogPayload(log: DailyLog): SyncDailyLogArgs {
  const totals = sumEntryMacros(log.entries); // EFFECTIVE totals (matches the dependent's dashboard)
  return {
    p_log_date: log.logDate,
    p_total_calories: totals.calories,
    p_total_protein: totals.protein,
    p_total_carbs: totals.carbs,
    p_total_fat: totals.fat,
    p_entries: log.entries.map((e) => ({
      name: e.name,
      name_zh: e.nameZh,
      meal_type: e.mealType,
      calories: e.calories,
      protein: e.protein,
      carbs: e.carbs,
      fat: e.fat,
      // Pre-fibre entries rehydrate without `fiber`; publish 0 so the server stores a real number.
      // The RPC coalesces too, so this is belt-and-braces.
      fiber: e.fiber ?? 0,
      quantity: e.quantity,
      unit: e.unit,
      source: e.source,
      image_url: e.imageUri,
      barcode: e.barcode,
      logged_at: e.loggedAt,
      customizations: e.customizations ?? [],
      micros: e.micros ?? null,
    })),
  };
}

// Scope a date to the dependent's retention window. isPaid is computed by the caller from the live
// subscription tier; a free dependent therefore only ever publishes today.
export function shouldSyncDate(isPaid: boolean, date: string, today?: string): boolean {
  return isPaid || isWithinHistoryWindow(date, today);
}

export function addDirty(set: readonly string[], date: string): string[] {
  return set.includes(date) ? [...set] : [...set, date];
}

export function removeDirty(set: readonly string[], date: string): string[] {
  return set.filter((d) => d !== date);
}
