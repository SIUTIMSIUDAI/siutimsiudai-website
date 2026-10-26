import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { ScalableText } from "@/components/ScalableText";
import { HelperDishCard } from "@/components/helper/HelperDishCard";
import { HelperSettingsSheet } from "@/components/helper/HelperSettingsSheet";
import { helperDayLabel, useHelperT } from "@/components/helper/helperText";
import { colors } from "@/constants/theme";
import { saveMySettings } from "@/services/familyPlanService";
import { useFamilyPlanStore } from "@/stores/familyPlanStore";
import type { HelperSnapshot, MyPlanSettings } from "@/types/familyPlan";
import { addDays, weekStartOf } from "@/utils/dateRange";
import { todayKey } from "@/utils/formatters";
import { localiseDish } from "@/utils/helperPlan";
import { planWeekDates } from "@/utils/weekPlan";

type Tab = "today" | "thisWeek" | "nextWeek";

/**
 * Helper mode (姐姐煮飯模式): what to cook today and this week, in the helper's language, with the
 * Chinese names beside. It shows sizes, never calories, and nothing about anyone's health.
 */
export function HelperHomeScreen() {
  const helper = useFamilyPlanStore((s) => s.helper);
  const error = useFamilyPlanStore((s) => s.helperError);
  const translating = useFamilyPlanStore((s) => s.translating);
  const translateFailed = useFamilyPlanStore((s) => s.translateFailed);
  const refreshHelper = useFamilyPlanStore((s) => s.refreshHelper);
  const lang = helper?.me.helperLanguage ?? "en";
  const ht = useHelperT(lang);

  const [tab, setTab] = useState<Tab>("today");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void refreshHelper();
    }, [refreshHelper]),
  );

  const today = todayKey();
  const thisWeek = weekStartOf(today);
  const weekOf = (h: HelperSnapshot, start: string) => h.plans.find((p) => p.weekStart === start) ?? null;
  const plan = helper ? weekOf(helper, tab === "nextWeek" ? addDays(thisWeek, 7) : thisWeek) : null;

  const onSave = async (me: MyPlanSettings) => {
    if (!helper) return;
    setSaving(true);
    setSaveError(null);
    const res = await saveMySettings(helper.groupId, me);
    setSaving(false);
    if (!res.ok) {
      setSaveError(ht("helper.errSave"));
      return;
    }
    setSettingsOpen(false);
    await refreshHelper();
  };

  const openDish = (id: string) => router.push({ pathname: "/helper/dish/[id]", params: { id } });

  const todays = plan?.dishes.filter((d) => d.date === today) ?? [];
  const days = plan ? planWeekDates(plan.weekStart).filter((d) => plan.dishes.some((x) => x.date === d)) : [];

  return (
    <Screen>
      <View className="flex-row items-center gap-1 px-2 pt-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ht("helper.back")}
          onPress={() => router.back()}
          className="h-11 w-11 items-center justify-center"
        >
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <ScalableText className="flex-1 text-xl font-bold text-ink" numberOfLines={1}>
          {ht("helper.title")}
        </ScalableText>
        {helper && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={ht("helper.settingsTitle")}
            onPress={() => {
              setSaveError(null);
              setSettingsOpen(true);
            }}
            className="h-11 w-11 items-center justify-center"
          >
            <Ionicons name="options-outline" size={24} color={colors.ink} />
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}>
        {!helper ? (
          error ? (
            <View className="items-center gap-3 py-12">
              <ScalableText className="text-center text-sm text-ink-muted">{ht("helper.errUnavailable")}</ScalableText>
              <Pressable accessibilityRole="button" onPress={() => void refreshHelper()} className="min-h-[44px] justify-center px-4">
                <ScalableText className="text-base font-semibold text-brand">{ht("helper.retry")}</ScalableText>
              </Pressable>
            </View>
          ) : (
            <ActivityIndicator style={{ marginTop: 48 }} color={colors.brand} />
          )
        ) : (
          <>
            <View className="flex-row gap-1 rounded-2xl bg-surface-sunken p-1">
              {(["today", "thisWeek", "nextWeek"] as Tab[]).map((t) => (
                <Pressable
                  key={t}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === t }}
                  onPress={() => setTab(t)}
                  className={`min-h-[40px] flex-1 items-center justify-center rounded-xl px-1 ${tab === t ? "bg-surface" : ""}`}
                >
                  <ScalableText
                    className={`text-center text-sm font-semibold ${tab === t ? "text-ink" : "text-ink-muted"}`}
                    numberOfLines={2}
                  >
                    {ht(`helper.${t}`)}
                  </ScalableText>
                </Pressable>
              ))}
            </View>

            {(translating || translateFailed) && (
              <View accessibilityLiveRegion="polite" className="flex-row items-center gap-2 rounded-2xl bg-surface-sunken p-3">
                {translating ? (
                  <ActivityIndicator size="small" color={colors.brand} />
                ) : (
                  <Ionicons name="alert-circle" size={18} color={colors.inkMuted} />
                )}
                <ScalableText className="flex-1 text-sm text-ink">
                  {translating ? ht("helper.translating") : ht("helper.translateFailed")}
                </ScalableText>
              </View>
            )}

            {!plan ? (
              <View className="items-center gap-2 rounded-2xl border border-dashed border-[#E4DCCB] px-6 py-8">
                <Ionicons name="calendar-outline" size={28} color={colors.inkFaint} />
                <ScalableText className="text-center text-sm text-ink-muted">{ht("helper.noPlan")}</ScalableText>
              </View>
            ) : tab === "today" ? (
              <View className="gap-3">
                <ScalableText className="px-1 text-base font-bold text-ink">{helperDayLabel(ht, today)}</ScalableText>
                {todays.length === 0 ? (
                  <ScalableText className="px-1 text-sm text-ink-muted">{ht("helper.nothingToday")}</ScalableText>
                ) : (
                  todays.map((dish) => (
                    <HelperDishCard
                      key={dish.id}
                      ht={ht}
                      lang={lang}
                      dish={dish}
                      members={helper.members}
                      portions={plan.portions}
                      myUserId={helper.myUserId}
                      onOpen={() => openDish(dish.id)}
                    />
                  ))
                )}
              </View>
            ) : (
              days.map((date) => (
                <View key={date} className="gap-2">
                  <ScalableText className="px-1 text-base font-bold text-ink">
                    {`${helperDayLabel(ht, date)}${date === today ? ` · ${ht("helper.today")}` : ""}`}
                  </ScalableText>
                  {plan.dishes
                    .filter((d) => d.date === date)
                    .map((dish) => {
                      const local = localiseDish(dish, lang);
                      return (
                        <Pressable
                          key={dish.id}
                          accessibilityRole="button"
                          accessibilityLabel={`${ht(`helper.meal.${dish.slot}`)}: ${local.title}, ${local.titleZh}`}
                          accessibilityHint={ht("helper.openDish")}
                          onPress={() => openDish(dish.id)}
                          className="flex-row items-center gap-3 rounded-2xl border border-[#E4DCCB] bg-surface px-3 py-2.5 active:opacity-80"
                        >
                          <ScalableText className="w-24 text-xs font-semibold uppercase text-ink-muted" numberOfLines={1}>
                            {ht(`helper.meal.${dish.slot}`)}
                          </ScalableText>
                          <View className="flex-1">
                            <ScalableText className="text-sm font-semibold text-ink">{local.title}</ScalableText>
                            <ScalableText className="text-xs text-ink-muted">{local.titleZh}</ScalableText>
                          </View>
                          <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
                        </Pressable>
                      );
                    })}
                </View>
              ))
            )}

            {plan && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={ht("helper.shopping")}
                onPress={() => router.push("/helper/shopping")}
                className="min-h-[48px] flex-row items-center justify-center gap-2 rounded-2xl bg-brand active:opacity-80"
              >
                <Ionicons name="basket-outline" size={18} color={colors.white} />
                <ScalableText className="text-base font-bold text-white">{ht("helper.shopping")}</ScalableText>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>

      {helper && (
        <HelperSettingsSheet
          visible={settingsOpen}
          ht={ht}
          me={helper.me}
          busy={saving}
          error={saveError}
          onSave={onSave}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </Screen>
  );
}
