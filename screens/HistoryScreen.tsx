import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { ScalableText } from "@/components/ScalableText";
import { HistoryDateStrip } from "@/components/HistoryDateStrip";
import { MacroProgressBar } from "@/components/MacroProgressBar";
import { WeeklyMacroChart, WeeklyMacroDatum } from "@/components/WeeklyMacroChart";
import { MicroHistoryChart, MicroHistoryDatum } from "@/components/MicroHistoryChart";
import { LockedMacroCard } from "@/components/LockedMacroCard";
import { LockedTrendCard } from "@/components/LockedTrendCard";
import { LockedMicroTrendCard } from "@/components/LockedMicroTrendCard";
import { LockedMealListCard } from "@/components/LockedMealListCard";
import { MemberEntryRow } from "@/components/MemberEntryRow";
import { QuickAddRow } from "@/components/QuickAddRow";
import { LogInputSheet } from "@/components/LogInputSheet";
import { colors, macroColors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { todayKey, weekdayShort } from "@/utils/formatters";
import { effectiveMacros } from "@/utils/customizations";
import { sumMicroTotals } from "@/utils/micros";
import { computeNutritionTargets } from "@/utils/nutritionTargets";
import { HISTORY_STRIP_DAYS, isBackfillableDate } from "@/utils/historyWindow";
import { sortByLoggedAt } from "@/utils/entryTime";
import { useNutritionStore } from "@/stores/nutritionStore";
import { useSubscriptionStore } from "@/stores/useSubscriptionStore";
import { DailyLog, MacroNutrients } from "@/types";

const EMPTY: MacroNutrients = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

// Effective day totals after any 少甜 / 少底 tweaks, computed off the persisted logs so the
// history view reacts to edits exactly like the live dashboard.
function totalsFor(logsByDate: Record<string, DailyLog>, date: string): MacroNutrients {
  const entries = logsByDate[date]?.entries ?? [];
  return entries.reduce<MacroNutrients>(
    (acc, e) => {
      const m = effectiveMacros(e, e.customizations);
      return {
        calories: acc.calories + m.calories,
        protein: acc.protein + m.protein,
        carbs: acc.carbs + m.carbs,
        fat: acc.fat + m.fat,
        fiber: acc.fiber + m.fiber,
      };
    },
    { ...EMPTY },
  );
}

// `count` calendar day keys ending today, oldest first.
function buildDayRange(count: number, today: string): string[] {
  const base = new Date(`${today}T00:00:00`);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    out.push(todayKey(d));
  }
  return out;
}

// The logbook: pick a past day from the strip, read its calorie hero + macro bars, and scan
// the last seven days as a stacked trend. For free users every past day and the weekly trend are
// sealed behind the paywall; only today is free to browse.
export function HistoryScreen() {
  const { t, tl, locale } = useLocale();
  const today = todayKey();
  const [selected, setSelected] = useState(today);

  const logsByDate = useNutritionStore((s) => s.logsByDate);
  const healthProfile = useNutritionStore((s) => s.healthProfile);
  const dailyCalorieTarget = useNutritionStore((s) => s.dailyCalorieTarget);
  const activeTier = useSubscriptionStore((s) => s.activeTier);

  // Calories are free for every tier and every past day; only the macro split is Pro. So the day
  // gate is the macro-drawer feature flag, not a date window — past days stay browsable for free.
  const { hasAccess: canViewMacros, triggerPaywall } = useFeatureAccess("macro_drawer");
  // The per-day "what you ate" list is its own Pro perk. Same paywall opener as the macro drawer,
  // so a free user tapping either lock lands on the same subscription screen.
  const { hasAccess: canViewMeals } = useFeatureAccess("meal_history");
  // Adding a forgotten meal to a past day. Pro too, and only on days the strip shows before today.
  const { hasAccess: canBackfill } = useFeatureAccess("backfill_log");
  const [backfillOpen, setBackfillOpen] = useState(false);
  const isPaid = activeTier !== "free";

  const targets = useMemo(
    () => (healthProfile ? computeNutritionTargets(healthProfile) : null),
    [healthProfile],
  );

  const days = useMemo(() => buildDayRange(HISTORY_STRIP_DAYS, today), [today]);
  const showBackfill = canBackfill && isBackfillableDate(selected, today);

  const dayTotals = useMemo(() => totalsFor(logsByDate, selected), [logsByDate, selected]);
  const macroTotal = dayTotals.protein + dayTotals.carbs + dayTotals.fat;

  // The individual meals booked for the selected day, in the order they were eaten, so a backfilled
  // breakfast reads before that afternoon's snack. Drives the Pro "what you ate" list; on an empty
  // day the section is skipped entirely so a blank day stays clean.
  const dayEntries = useMemo(
    () => sortByLoggedAt(logsByDate[selected]?.entries ?? []),
    [logsByDate, selected],
  );

  // Real weekly figures are Pro-only. For free users this returns nothing and the screen renders
  // a locked decoy instead, so no historical number ever enters the tree.
  const weekly: WeeklyMacroDatum[] = useMemo(() => {
    if (!isPaid) return [];
    return days.slice(-7).map((dateKey) => {
      const totals = totalsFor(logsByDate, dateKey);
      return {
        dateKey,
        label: weekdayShort(dateKey, locale),
        protein: totals.protein,
        carbs: totals.carbs,
        fat: totals.fat,
        isToday: dateKey === today,
      };
    });
  }, [days, logsByDate, locale, today, isPaid]);

  // Seven days of tracked-micro totals for the premium micro trend. Same Pro-only gate: free users
  // get [] and see a locked decoy, so no real micronutrient figure reaches the tree.
  const microWeekly: MicroHistoryDatum[] = useMemo(() => {
    if (!isPaid) return [];
    return days.slice(-7).map((dateKey) => ({
      dateKey,
      label: weekdayShort(dateKey, locale),
      micros: sumMicroTotals(logsByDate[dateKey]?.entries ?? []),
      isToday: dateKey === today,
    }));
  }, [days, logsByDate, locale, today, isPaid]);

  const prettyDate = new Date(`${selected}T00:00:00`).toLocaleDateString(
    locale === "zh-Hant" ? "zh-HK" : "en-US",
    { weekday: "long", month: "short", day: "numeric" },
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 16 }}>
        <View>
          <ScalableText className="text-2xl font-bold text-ink">{t("history.title")}</ScalableText>
          <ScalableText className="text-sm text-ink-muted">{t("history.subtitle")}</ScalableText>
        </View>

        <HistoryDateStrip days={days} selected={selected} onSelect={setSelected} />

        <View className="gap-4">
          {/* Hero: total calories booked for the selected day. Calories are free on every tier and
              for every past day, so this always renders. */}
          <View className="items-center rounded-3xl border border-[#E4DCCB] bg-surface py-6">
            <ScalableText className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              {prettyDate}
            </ScalableText>
            <ScalableText className="mt-1 text-5xl font-extrabold text-ink">
              {Math.round(dayTotals.calories).toLocaleString("en-US")}
            </ScalableText>
            <ScalableText className="text-sm text-ink-muted">{t("history.booked")}</ScalableText>
            <ScalableText className="mt-0.5 text-xs text-ink-faint">
              {t("history.targetLine", { count: dailyCalorieTarget })}
            </ScalableText>
          </View>

          {/* The macro split (carbs / protein / fat / fibre) is a Pro perk. Paid tiers see the real
              bars; free users get a locked decoy in its place while the calorie hero stays visible. */}
          {canViewMacros ? (
            <View className="rounded-2xl border border-[#E4DCCB] bg-surface p-4">
              <MacroProgressBar
                label={t("dashboard.carbs")}
                grams={dayTotals.carbs}
                target={targets?.carbs}
                total={macroTotal}
                color={macroColors.carbs}
              />
              <MacroProgressBar
                label={t("dashboard.protein")}
                grams={dayTotals.protein}
                target={targets?.protein}
                total={macroTotal}
                color={macroColors.protein}
              />
              <MacroProgressBar
                label={t("dashboard.fat")}
                grams={dayTotals.fat}
                target={targets?.fat}
                total={macroTotal}
                color={macroColors.fat}
              />
              {/* Fibre sits below the big three. It stays OUT of macroTotal (subset of carbs), so its
                  no-target share reads against protein+carbs+fat like the dashboard panel. */}
              <MacroProgressBar
                label={t("dashboard.fibre")}
                grams={dayTotals.fiber}
                target={targets?.fiber}
                total={macroTotal}
                color={macroColors.fiber}
              />
            </View>
          ) : (
            <LockedMacroCard onUnlock={triggerPaywall} />
          )}

          {/* "What you ate": the per-day meal list. Only shown on days that actually have entries, so
              an empty day stays clean. Paid tiers get the real read-only rows (same MemberEntryRow the
              family manager view uses); free users get a blurred decoy that routes to the paywall. */}
          {dayEntries.length > 0 && (
            <View className="gap-2">
              <ScalableText className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                {tl("What you ate", "食咗啲乜")}
              </ScalableText>
              {canViewMeals ? (
                <View className="rounded-2xl border border-[#E4DCCB] bg-surface px-4 py-1">
                  {dayEntries.map((e) => (
                    <MemberEntryRow key={e.id} entry={e} />
                  ))}
                </View>
              ) : (
                <LockedMealListCard onUnlock={triggerPaywall} />
              )}
            </View>
          )}

          {/* Forgot to log? Pro and Max can add a missed meal to any past day on the strip, through
              the usual logging sheet or a one-tap usual. It shows on empty days too, since those are
              the days most likely to be missing a meal. Today is left to the Log tab. */}
          {showBackfill && (
            <View className="gap-3">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={tl(`Add a missed meal to ${prettyDate}`, `為${prettyDate}補記一餐`)}
                onPress={() => setBackfillOpen(true)}
                className="min-h-[44px] flex-row items-center justify-center gap-2 rounded-2xl border border-dashed border-brand bg-surface py-3 active:opacity-80"
              >
                <Ionicons name="add-circle-outline" size={20} color={colors.brand} />
                <ScalableText className="text-sm font-bold text-brand">
                  {tl("Add a missed meal", "補記一餐")}
                </ScalableText>
              </Pressable>
              <QuickAddRow date={selected} />
            </View>
          )}
        </View>

        {/* Weekly trend is a Pro perk: paid tiers get the real chart, free sees a locked decoy. */}
        {isPaid ? (
          <WeeklyMacroChart
            data={weekly}
            title={t("history.weeklyTrend")}
            legend={{
              carbs: t("dashboard.carbs"),
              fat: t("dashboard.fat"),
              protein: t("dashboard.protein"),
            }}
          />
        ) : (
          <LockedTrendCard onUnlock={triggerPaywall} />
        )}

        {/* Micronutrient trend: one toggleable 7-day chart (Pro), or a locked decoy for free. */}
        {isPaid ? (
          <MicroHistoryChart
            data={microWeekly}
            targets={targets?.micros ?? null}
            title={tl("Micronutrient trend", "微量營養走勢")}
          />
        ) : (
          <LockedMicroTrendCard onUnlock={triggerPaywall} />
        )}
      </ScrollView>

      {/* Mounted for tiers that can backfill only; it files the meal under the selected past day. */}
      {canBackfill && (
        <LogInputSheet visible={backfillOpen} date={selected} onClose={() => setBackfillOpen(false)} />
      )}
    </Screen>
  );
}
