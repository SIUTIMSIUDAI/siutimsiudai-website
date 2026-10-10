import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DailyLog,
  EntryMicronutrients,
  FoodEntry,
  HealthProfile,
  LogSource,
  MacroNutrients,
  MealCustomization,
  MealType,
  NutritionTargets,
} from "@/types";
import { todayKey } from "@/utils/formatters";
import { loggedAtFor } from "@/utils/entryTime";
import { sumEntryMacros, toggledCustomizations } from "@/utils/customizations";
import { computeNutritionTargets } from "@/utils/nutritionTargets";
import { MicroTotals, sumMicroTotals } from "@/utils/micros";
import { newId } from "@/utils/id";
import { persistStorage } from "./persistStorage";
import { isPaidTier, SubscriptionTier, useSubscriptionStore } from "./useSubscriptionStore";
import { scheduleSync } from "@/services/nutritionSyncService";

const GUEST_USER = "guest";

export interface NewFoodEntryInput extends MacroNutrients {
  name: string;
  nameZh: string;
  mealType: MealType;
  quantity?: number;
  unit?: string;
  source?: LogSource;
  imageUri?: string | null;
  barcode?: string | null;
  // Optional per-meal vitamins & minerals. Gated on save: kept for paid tiers, dropped for free.
  micros?: EntryMicronutrients | null;
  // The AI's added-sugar estimate (g) for 少甜 / 走甜; 0 for packaged products. See FoodEntry.
  addedSugar?: number;
}

// Premium policy at the single daily-log save path: only paid tiers keep per-meal micronutrients
// in history; free users store macros + calories only, so their micros are dropped to null. Pure
// and exported so the gate can be unit-tested without a store. A no-op in practice until a logging
// flow actually captures micros, but codifying it here means free micro history can never leak in.
export function retainMicrosForTier(
  tier: SubscriptionTier,
  micros: EntryMicronutrients | null | undefined,
): EntryMicronutrients | null {
  return isPaidTier(tier) ? micros ?? null : null;
}

interface NutritionState {
  logsByDate: Record<string, DailyLog>;
  dailyCalorieTarget: number;
  // Body metrics the user entered, or null before they set them up. Drives the macro and
  // micro targets and, on save, the calorie target too.
  healthProfile: HealthProfile | null;

  addEntry: (input: NewFoodEntryInput, date?: string) => void;
  editEntry: (date: string, entryId: string, patch: Partial<FoodEntry>) => void;
  removeEntry: (date: string, entryId: string) => void;
  // Tick 少甜 / 少底 on a logged item on or off. Reversible: the base macros are untouched.
  toggleCustomization: (date: string, entryId: string, customization: MealCustomization) => void;
  repeatMeal: (meal: NewFoodEntryInput, date?: string) => void;
  setCalorieTarget: (target: number) => void;
  setHealthProfile: (profile: HealthProfile) => void;
  clearHealthProfile: () => void;

  entriesForDate: (date: string) => FoodEntry[];
  totalsForDate: (date: string) => MacroNutrients;
  // Running totals of the five premium micronutrients for the day. Free-tier entries never carry
  // micros (dropped at the save path), so their totals are all zero — this is premium-only by
  // construction, matching the gated tracker widget.
  microTotalsForDate: (date: string) => MicroTotals;
  remainingForDate: (date: string) => number;
  // Full computed target set, or null when no health profile has been entered yet.
  targets: () => NutritionTargets | null;
}

function ensureLog(logs: Record<string, DailyLog>, date: string): DailyLog {
  const existing = logs[date];
  if (existing) return existing;
  return { id: newId("log"), userId: GUEST_USER, logDate: date, entries: [] };
}

export const useNutritionStore = create<NutritionState>()(
  persist(
    (set, get) => ({
      logsByDate: {},
      dailyCalorieTarget: 2000,
      healthProfile: null,

      addEntry: (input, date = todayKey()) => {
        set((state) => {
          const log = ensureLog(state.logsByDate, date);
          // Free users' history holds macros + calories only; paid tiers also retain micros.
          const tier = useSubscriptionStore.getState().activeTier;
          const entry: FoodEntry = {
            id: newId("fe"),
            dailyLogId: log.id,
            name: input.name,
            nameZh: input.nameZh,
            mealType: input.mealType,
            calories: input.calories,
            protein: input.protein,
            carbs: input.carbs,
            fat: input.fat,
            fiber: input.fiber,
            quantity: input.quantity ?? 1,
            unit: input.unit ?? "serving",
            source: input.source ?? "manual",
            imageUri: input.imageUri ?? null,
            barcode: input.barcode ?? null,
            // Today's meals keep the real clock; a forgotten meal added to a past day is stamped on
            // that day at its meal's typical time, so History and family sync show when it was eaten.
            loggedAt: loggedAtFor(date, input.mealType, new Date(), todayKey()),
            micros: retainMicrosForTier(tier, input.micros),
            ...(input.addedSugar !== undefined ? { addedSugar: input.addedSugar } : {}),
          };
          return {
            logsByDate: {
              ...state.logsByDate,
              [date]: { ...log, entries: [...log.entries, entry] },
            },
          };
        });
        scheduleSync(date);
      },

      editEntry: (date, entryId, patch) => {
        set((state) => {
          const log = state.logsByDate[date];
          if (!log) return state;
          // A re-estimate (correcting the name) can carry fresh micros; run them through the SAME
          // free/paid gate as the log path so a free user can never edit premium micros into
          // history that addEntry would have stripped. Only when the patch actually carries micros
          // ("micros" in patch): a macro-only edit leaves an existing paid entry's micros intact.
          const gated: Partial<FoodEntry> =
            "micros" in patch
              ? {
                  ...patch,
                  micros: retainMicrosForTier(
                    useSubscriptionStore.getState().activeTier,
                    patch.micros,
                  ),
                }
              : patch;
          return {
            logsByDate: {
              ...state.logsByDate,
              [date]: {
                ...log,
                entries: log.entries.map((e) => (e.id === entryId ? { ...e, ...gated } : e)),
              },
            },
          };
        });
        scheduleSync(date);
      },

      removeEntry: (date, entryId) => {
        set((state) => {
          const log = state.logsByDate[date];
          if (!log) return state;
          return {
            logsByDate: {
              ...state.logsByDate,
              [date]: { ...log, entries: log.entries.filter((e) => e.id !== entryId) },
            },
          };
        });
        scheduleSync(date);
      },

      toggleCustomization: (date, entryId, customization) => {
        set((state) => {
          const log = state.logsByDate[date];
          if (!log) return state;
          return {
            logsByDate: {
              ...state.logsByDate,
              [date]: {
                ...log,
                entries: log.entries.map((e) => {
                  if (e.id !== entryId) return e;
                  // 少甜 and 走甜 replace each other rather than stacking.
                  return { ...e, customizations: toggledCustomizations(e.customizations, customization) };
                }),
              },
            },
          };
        });
        scheduleSync(date);
      },

      repeatMeal: (meal, date = todayKey()) =>
        get().addEntry({ ...meal, source: "manual" }, date),

      setCalorieTarget: (dailyCalorieTarget) => set({ dailyCalorieTarget }),

      setHealthProfile: (profile) =>
        set({ healthProfile: profile, dailyCalorieTarget: computeNutritionTargets(profile).calories }),

      clearHealthProfile: () => set({ healthProfile: null }),

      entriesForDate: (date) => get().logsByDate[date]?.entries ?? [],

      totalsForDate: (date) => sumEntryMacros(get().logsByDate[date]?.entries ?? []),

      microTotalsForDate: (date) => sumMicroTotals(get().logsByDate[date]?.entries ?? []),

      remainingForDate: (date) => get().dailyCalorieTarget - get().totalsForDate(date).calories,

      targets: () => {
        const profile = get().healthProfile;
        return profile ? computeNutritionTargets(profile) : null;
      },
    }),
    {
      name: "siutimsiudai-nutrition",
      storage: persistStorage,
      partialize: (s) => ({
        logsByDate: s.logsByDate,
        dailyCalorieTarget: s.dailyCalorieTarget,
        healthProfile: s.healthProfile,
      }),
    },
  ),
);
