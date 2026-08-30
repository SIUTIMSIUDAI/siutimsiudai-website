import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { ScalableText } from "@/components/ScalableText";
import { MemberEntryRow } from "@/components/MemberEntryRow";
import { SourcesLink } from "@/components/SourcesLink";
import { colors, macroColors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";
import { getDependentDates, getDependentDay } from "@/services/familyLogService";
import { sumEntryMacros } from "@/utils/customizations";
import { sumMicroTotals, TRACKED_MICRO_KEYS, TRACKED_MICRO_META } from "@/utils/micros";
import { formatCalories } from "@/utils/formatters";
import { DailyLog } from "@/types";

interface Props {
  memberId: string;
  name: string | null;
}

// Read-only view of a linked dependent's day. Shows INTAKE amounts (calories, macro grams, micro
// amounts) and the entry list — never targets or progress bars, because the manager does not hold
// the dependent's health profile (honesty rule: no invented numbers). Amounts are recomputed from
// the entry list via the shared helpers, so they match the dependent's own screen.
export function FamilyMemberLogScreen({ memberId, name }: Props) {
  const { tl } = useLocale();
  const [dates, setDates] = useState<string[] | null>(null); // null = still loading the list
  const [index, setIndex] = useState(0);
  const [day, setDay] = useState<DailyLog | null>(null);
  const [dayLoading, setDayLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    getDependentDates(memberId)
      .then((d) => alive && setDates(d))
      .catch(() => alive && setDates([]));
    return () => {
      alive = false;
    };
  }, [memberId]);

  const activeDate = dates && dates.length > 0 ? dates[index] : null;

  useEffect(() => {
    if (!activeDate) {
      setDay(null);
      return;
    }
    let alive = true;
    setDayLoading(true);
    getDependentDay(memberId, activeDate)
      .then((d) => alive && setDay(d))
      .catch(() => alive && setDay(null))
      .finally(() => alive && setDayLoading(false));
    return () => {
      alive = false;
    };
  }, [memberId, activeDate]);

  const goOlder = useCallback(() => {
    setIndex((i) => (dates && i < dates.length - 1 ? i + 1 : i));
  }, [dates]);
  const goNewer = useCallback(() => setIndex((i) => (i > 0 ? i - 1 : i)), []);

  const title = name || tl("Family member", "家庭成員");
  const entries = day?.entries ?? [];
  const totals = sumEntryMacros(entries);
  const micros = sumMicroTotals(entries);
  const hasMicros = TRACKED_MICRO_KEYS.some((k) => micros[k] > 0);

  return (
    <Screen edges={["top", "bottom"]}>
      <View className="flex-row items-center gap-1 px-3 pb-2 pt-1">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={tl("Back", "返回")}
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
        >
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <ScalableText className="text-2xl font-bold text-ink" numberOfLines={1}>
          {tl(`${title}'s log`, `${title}嘅記錄`)}
        </ScalableText>
      </View>

      {dates === null ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : dates.length === 0 ? (
        // Linked but nothing synced yet (dependent has not opened the app since linking, or is a
        // free tier whose past days never leave the device).
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <Ionicons name="fast-food-outline" size={32} color={colors.inkFaint} />
          <ScalableText className="text-center text-base text-ink-muted">
            {tl("No log to show yet.", "暫時未有記錄。")}
          </ScalableText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 40, gap: 16 }}>
          {/* Date navigator */}
          <View className="flex-row items-center justify-between rounded-2xl border border-[#E4DCCB] bg-surface px-2 py-2">
            <Pressable
              onPress={goOlder}
              disabled={index >= dates.length - 1}
              accessibilityRole="button"
              accessibilityLabel={tl("Older day", "較舊")}
              className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
              style={{ opacity: index >= dates.length - 1 ? 0.3 : 1 }}
            >
              <Ionicons name="chevron-back" size={20} color={colors.ink} />
            </Pressable>
            <ScalableText className="text-base font-semibold text-ink">
              {activeDate ?? ""}
            </ScalableText>
            <Pressable
              onPress={goNewer}
              disabled={index <= 0}
              accessibilityRole="button"
              accessibilityLabel={tl("Newer day", "較新")}
              className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
              style={{ opacity: index <= 0 ? 0.3 : 1 }}
            >
              <Ionicons name="chevron-forward" size={20} color={colors.ink} />
            </Pressable>
          </View>

          {dayLoading ? (
            <View className="items-center justify-center py-10">
              <ActivityIndicator color={colors.brand} />
            </View>
          ) : entries.length === 0 ? (
            <View className="items-center gap-2 rounded-2xl border border-[#E4DCCB] bg-surface px-4 py-10">
              <Ionicons name="cafe-outline" size={26} color={colors.inkFaint} />
              <ScalableText className="text-center text-sm text-ink-muted">
                {tl("Nothing logged on this day.", "呢日冇記錄。")}
              </ScalableText>
            </View>
          ) : (
            <>
              {/* Calorie total (recomputed from entries — never a stored figure). */}
              <View className="items-center gap-1 rounded-2xl border border-[#E4DCCB] bg-surface p-5">
                <ScalableText className="text-5xl font-extrabold leading-none text-ink">
                  {formatCalories(totals.calories)}
                </ScalableText>
                <ScalableText className="text-sm text-ink-muted">
                  {tl("kcal eaten", "千卡攝取")}
                </ScalableText>
              </View>

              {/* Macro grams (amounts, not targets). */}
              <View className="flex-row gap-2">
                {(
                  [
                    ["protein", tl("Protein", "蛋白質"), macroColors.protein],
                    ["carbs", tl("Carbs", "碳水"), macroColors.carbs],
                    ["fat", tl("Fat", "脂肪"), macroColors.fat],
                    ["fiber", tl("Fibre", "纖維"), macroColors.fiber],
                  ] as const
                ).map(([key, label, color]) => (
                  <View
                    key={key}
                    className="flex-1 items-center gap-1 rounded-2xl border border-[#E4DCCB] bg-surface p-3"
                  >
                    <ScalableText className="text-lg font-bold" style={{ color }}>
                      {Math.round(totals[key])}g
                    </ScalableText>
                    <ScalableText className="text-xs text-ink-muted">{label}</ScalableText>
                  </View>
                ))}
              </View>

              {/* Micros (Max manager only, and only when the dependent's entries carry them). */}
              {hasMicros && (
                <View className="gap-2 rounded-2xl border border-[#E4DCCB] bg-surface p-4">
                  <ScalableText className="text-[11px] font-bold uppercase tracking-widest text-ink-faint">
                    {tl("Vitamins & minerals", "維他命同礦物質")}
                  </ScalableText>
                  {TRACKED_MICRO_KEYS.filter((k) => micros[k] > 0).map((k) => (
                    <View key={k} className="flex-row items-center justify-between">
                      <ScalableText className="text-sm font-semibold text-ink">
                        {tl(TRACKED_MICRO_META[k].label, TRACKED_MICRO_META[k].labelZh)}
                      </ScalableText>
                      <ScalableText className="text-sm text-ink-muted">
                        {Math.round(micros[k] * 10) / 10} {TRACKED_MICRO_META[k].unit}
                      </ScalableText>
                    </View>
                  ))}
                </View>
              )}

              {/* Entry list, read-only. */}
              <View className="rounded-2xl border border-[#E4DCCB] bg-surface px-4 py-1">
                {entries.map((e) => (
                  <MemberEntryRow key={e.id} entry={e} />
                ))}
              </View>

              {/* Health figures on screen -> citations link (Guideline 1.4.1). */}
              <SourcesLink />
            </>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}
