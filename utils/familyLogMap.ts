// Pure mapping of a fetched dependent day (snake_case Postgres rows) into the app's camelCase
// DailyLog, including jsonb customizations / micros validation. No Supabase import, so it is
// unit-testable; services/familyLogService.ts does the fetching and calls this.

import { DailyLog, FoodEntry, LogSource, MealCustomization, MealType } from "@/types";
import { sanitizeMicros } from "./micros";

export interface DailyLogRow {
  id: string;
  user_id: string;
  log_date: string;
}

export interface FoodEntryRow {
  id: string;
  daily_log_id: string;
  name: string;
  name_zh: string;
  meal_type: MealType;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  quantity: number;
  unit: string;
  source: LogSource;
  image_url: string | null;
  barcode: string | null;
  logged_at: string;
  customizations: unknown; // jsonb; validated below
  micros: unknown; // jsonb; validated below
}

const VALID_CUSTOMIZATIONS: readonly MealCustomization[] = ["less_sugar", "less_rice"];

function parseCustomizations(raw: unknown): MealCustomization[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is MealCustomization =>
    VALID_CUSTOMIZATIONS.includes(v as MealCustomization),
  );
}

function mapEntryRow(r: FoodEntryRow): FoodEntry {
  return {
    id: r.id,
    dailyLogId: r.daily_log_id,
    name: r.name,
    nameZh: r.name_zh,
    mealType: r.meal_type,
    calories: Number(r.calories),
    protein: Number(r.protein),
    carbs: Number(r.carbs),
    fat: Number(r.fat),
    fiber: Number(r.fiber),
    quantity: Number(r.quantity),
    unit: r.unit,
    source: r.source,
    imageUri: r.image_url,
    barcode: r.barcode,
    loggedAt: r.logged_at,
    customizations: parseCustomizations(r.customizations),
    micros: sanitizeMicros(r.micros) ?? null,
  };
}

export function mapDayFromRows(log: DailyLogRow, entries: FoodEntryRow[]): DailyLog {
  return {
    id: log.id,
    userId: log.user_id,
    logDate: log.log_date,
    entries: entries.map(mapEntryRow),
  };
}
