import { DailyLog } from "@/types";
import { isSupabaseConfigured, supabase } from "./supabase";
import { DailyLogRow, FoodEntryRow, mapDayFromRows } from "@/utils/familyLogMap";

// Manager-facing read of a linked dependent's diary. Authorisation is entirely the 0002 RLS
// (manager_manage_daily_logs / manager_manage_food_entries via is_family_manager_of): these queries
// only succeed for a manager reading a dependent in their own family. The screen passes the
// dependent's user id straight from the roster it already fetched.
//
// Offline / unconfigured Supabase (Expo Go, web, tests): no cloud rows exist, so both calls degrade
// to "nothing to show", consistent with the mock posture elsewhere in services/.

const ENTRY_COLUMNS =
  "id, daily_log_id, name, name_zh, meal_type, calories, protein, carbs, fat, fiber, quantity, unit, source, image_url, barcode, logged_at, customizations, micros";

export async function getDependentDates(dependentUserId: string): Promise<string[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from("daily_logs")
    .select("log_date")
    .eq("user_id", dependentUserId)
    .order("log_date", { ascending: false });
  if (error || !data) return [];
  return data.map((r: { log_date: string }) => r.log_date);
}

export async function getDependentDay(
  dependentUserId: string,
  date: string,
): Promise<DailyLog | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  const { data: logRows, error: logErr } = await supabase
    .from("daily_logs")
    .select("id, user_id, log_date")
    .eq("user_id", dependentUserId)
    .eq("log_date", date)
    .limit(1);
  if (logErr || !logRows || logRows.length === 0) return null;
  const logRow = logRows[0] as DailyLogRow;

  const { data: entryRows, error: entErr } = await supabase
    .from("food_entries")
    .select(ENTRY_COLUMNS)
    .eq("daily_log_id", logRow.id)
    .order("logged_at", { ascending: true });
  if (entErr) return null;

  return mapDayFromRows(logRow, (entryRows ?? []) as FoodEntryRow[]);
}
