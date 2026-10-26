import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { ScalableText } from "@/components/ScalableText";
import { SourcesLink } from "@/components/SourcesLink";
import { CartExportSheet } from "@/components/CartExportSheet";
import { PlanDishCard } from "@/components/familyPlan/PlanDishCard";
import { PortionSheet } from "@/components/familyPlan/PortionSheet";
import { LogMealSheet } from "@/components/familyPlan/LogMealSheet";
import { PlanDishSheet } from "@/components/familyPlan/PlanDishSheet";
import { PlanShoppingList } from "@/components/familyPlan/PlanShoppingList";
import { PlanSettingsSheet, type PlanSettingsChanges } from "@/components/familyPlan/PlanSettingsSheet";
import { LockedPlanPreview } from "@/components/familyPlan/LockedPlanPreview";
import { dayLabel, planErrorText } from "@/components/familyPlan/labels";
import { colors } from "@/constants/theme";
import { REGEN_LIMIT_PER_WEEK } from "@/constants/portionSizes";
import { useLocale } from "@/hooks/useLocale";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import * as planService from "@/services/familyPlanService";
import { useFamilyPlanStore } from "@/stores/familyPlanStore";
import { useNutritionStore } from "@/stores/nutritionStore";
import { usePantryStore } from "@/stores/pantryStore";
import type { GroceryListItem } from "@/types";
import { shoppingSnapshot } from "@/utils/helperPlan";
import type { PlanDish, PlanMember, PlanResult } from "@/types/familyPlan";
import { addDays, weekStartOf } from "@/utils/dateRange";
import { todayKey } from "@/utils/formatters";
import {
  choiceFor,
  daysToPlan,
  eatersOf,
  mealLogLines,
  planWeekDates,
  servingsFor,
  slotKey,
  weeklyShoppingList,
} from "@/utils/weekPlan";

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * The weekly family meal plan (Max). The planner plans this week or next, swaps dishes, locks the
 * ones to keep, redoes a day, logs 食咗 for everyone and shops the week. Every member sees the plan
 * and sets their own portions. Without Max, and outside a Max family, the locked preview.
 */
export function FamilyPlanScreen() {
  const { t, tl, locale } = useLocale();
  const { hasAccess, triggerPaywall } = useFeatureAccess("family_meal_plan");
  const snapshot = useFamilyPlanStore((s) => s.snapshot);
  const loading = useFamilyPlanStore((s) => s.loading);
  const loadError = useFamilyPlanStore((s) => s.loadError);
  const busy = useFamilyPlanStore((s) => s.busy);
  const refresh = useFamilyPlanStore((s) => s.refresh);
  const run = useFamilyPlanStore((s) => s.run);
  const setPortion = useFamilyPlanStore((s) => s.setPortion);
  const rememberLogged = useFamilyPlanStore((s) => s.rememberLogged);
  const publishShoppingIfChanged = useFamilyPlanStore((s) => s.publishShoppingIfChanged);
  const addEntry = useNutritionStore((s) => s.addEntry);
  const pantry = usePantryStore((s) => s.items);

  const today = todayKey();
  const thisWeek = weekStartOf(today);
  const nextWeek = addDays(thisWeek, 7);
  const [week, setWeek] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [portionTarget, setPortionTarget] = useState<{ dish: PlanDish; member: PlanMember } | null>(null);
  const [logTarget, setLogTarget] = useState<PlanDish | null>(null);
  const [openDish, setOpenDish] = useState<PlanDish | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [storeOpen, setStoreOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  // Open on this week, unless it has no plan and only its last two days are left (Friday and
  // Saturday, as weeks run Sunday to Saturday), when next week is the one to plan.
  useEffect(() => {
    if (!snapshot || week !== null) return;
    const endOfWeek = [5, 6].includes(new Date(`${today}T00:00:00`).getDay());
    const hasThisWeek = snapshot.plans.some((p) => p.weekStart === thisWeek);
    setWeek(!hasThisWeek && endOfWeek ? nextWeek : thisWeek);
  }, [snapshot, week, today, thisWeek, nextWeek]);

  // A helper opening the plan gets helper mode: her language, and nobody's nutrition.
  useEffect(() => {
    if (snapshot?.me.isHelper) router.replace("/helper");
  }, [snapshot?.me.isHelper]);

  // The planner's phone publishes each week's shopping list for the helper, because the pantry it
  // subtracts lives here. Only when the family has a helper, a moment after the list settles, and only
  // when it changed (the store keeps track).
  const hasHelper = !!snapshot?.members.some((m) => m.isHelper);
  useEffect(() => {
    if (!snapshot || !hasHelper || !(snapshot.role === "manager" || snapshot.role === null)) return;
    const timer = setTimeout(() => {
      for (const p of snapshot.plans) {
        const from = p.weekStart > today ? p.weekStart : today;
        const list = weeklyShoppingList(
          { dishes: p.dishes, members: snapshot.members, portions: p.portions, slots: snapshot.slots, fromDate: from },
          pantry,
        );
        void publishShoppingIfChanged(p.id, shoppingSnapshot(list, from, new Date().toISOString()));
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [snapshot, hasHelper, pantry, today, publishShoppingIfChanged]);

  const selected = week ?? thisWeek;
  const plan = snapshot?.plans.find((p) => p.weekStart === selected) ?? null;
  const members = snapshot?.members ?? [];
  const slots = snapshot?.slots ?? [];
  const myUserId = snapshot?.myUserId ?? "";
  const role = snapshot?.role ?? null;
  const planner = role === "manager" || role === null;
  const fromDate = selected > today ? selected : today;

  const shopping = useMemo(
    () =>
      plan && planner
        ? weeklyShoppingList({ dishes: plan.dishes, members, portions: plan.portions, slots, fromDate }, pantry)
        : null,
    [plan, planner, members, slots, fromDate, pantry],
  );
  // The same lines for the store sheet, pieces already rounded up as the list shows them.
  const storeItems = useMemo<GroceryListItem[]>(
    () =>
      (shopping?.groups ?? []).flatMap((g) =>
        g.lines.map((l) => ({
          id: l.key,
          groceryListId: plan?.id ?? "",
          name: l.name,
          nameZh: l.nameZh,
          quantity: l.unit === "piece" ? Math.ceil(l.quantity) : l.quantity,
          unit: l.unit,
          displayUnit: l.unit,
          checked: false,
          sourceRecipeIds: l.dishIds,
          mergedFrom: [],
          inPantry: false,
        })),
      ),
    [shopping, plan?.id],
  );

  const act = async <T,>(busyKey: string, op: () => Promise<PlanResult<T>>) => {
    setError(null);
    const res = await run(busyKey, op);
    if (!res.ok) setError(planErrorText(t, res.reason));
    return res;
  };

  const onGenerate = () => act("generate", () => planService.generateWeek(selected, today, pantry));

  const onPick = async (choice: Parameters<typeof setPortion>[4]) => {
    if (!portionTarget || !plan) return;
    const { dish, member } = portionTarget;
    setPortionTarget(null);
    const res = await setPortion(plan.id, dish.date, dish.slot, member.userId, choice);
    if (!res.ok) setError(planErrorText(t, res.reason));
  };

  // 食咗: everyone else's entries go to the server inbox for their phones; mine goes straight into my
  // diary once the server has marked the dish logged, so a failure logs nobody.
  const onConfirmLog = async () => {
    if (!logTarget || !plan) return;
    const dish = logTarget;
    const lines = mealLogLines(dish, members, plan.portions);
    const mine = lines.find((l) => l.userId === myUserId);
    const others = lines.filter((l) => l.userId !== myUserId).map((l) => ({ userId: l.userId, entry: l.entry }));
    const res = await act(`log:${dish.id}`, () => planService.logFamilyMeal(plan.id, dish.id, others));
    if (!res.ok) return;
    if (mine && !useFamilyPlanStore.getState().loggedDishIds.includes(dish.id)) {
      addEntry({ ...mine.entry, source: "manual" }, dish.date);
      rememberLogged(dish.id);
    }
    setLogTarget(null);
  };

  const onSaveSettings = async (c: PlanSettingsChanges) => {
    if (!snapshot) return;
    setSettingsBusy(true);
    setSettingsError(null);
    try {
      let groupId = snapshot.groupId;
      if (!groupId) {
        const made = await planService.ensureFamily();
        if (!made.ok) {
          setSettingsError(planErrorText(t, made.reason));
          return;
        }
        groupId = made.value;
      }
      const jobs: Array<Promise<PlanResult<true>>> = [];
      if (planner && !sameList(c.slots, snapshot.slots)) jobs.push(planService.setPlanSlots(groupId, c.slots));
      if (c.me.defaultSize !== snapshot.me.defaultSize || !sameList(c.me.exclusions, snapshot.me.exclusions)) {
        jobs.push(planService.saveMySettings(groupId, c.me));
      }
      if (planner) {
        for (const m of members) {
          if (m.userId === myUserId) continue;
          const size = c.sizes[m.userId];
          if (size && size !== m.defaultSize) jobs.push(planService.setMemberSize(m.userId, size));
          const helper = c.helpers[m.userId];
          if (helper && (helper.isHelper !== m.isHelper || helper.language !== m.helperLanguage)) {
            jobs.push(planService.setMemberHelper(m.userId, helper.isHelper, helper.language));
          }
        }
      }
      const failed = (await Promise.all(jobs)).find((r) => !r.ok);
      await refresh();
      if (failed && !failed.ok) setSettingsError(planErrorText(t, failed.reason));
      else setSettingsOpen(false);
    } finally {
      setSettingsBusy(false);
    }
  };

  const locked = snapshot !== null && !hasAccess && role !== "dependent";
  const dates = plan ? planWeekDates(selected).filter((d) => d >= today || plan.dishes.some((x) => x.date === d)) : [];
  const portionDish = portionTarget?.dish;
  const portionKey = portionDish ? slotKey(portionDish) : "";

  return (
    <Screen>
      <View className="flex-row items-center gap-1 px-2 pt-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
          onPress={() => router.back()}
          className="h-11 w-11 items-center justify-center"
        >
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <ScalableText className="flex-1 text-xl font-bold text-ink" numberOfLines={1}>
          {t("familyPlan.title")}
        </ScalableText>
        {snapshot && !locked && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("familyPlan.settingsTitle")}
            onPress={() => {
              setSettingsError(null);
              setSettingsOpen(true);
            }}
            className="h-11 w-11 items-center justify-center"
          >
            <Ionicons name="options-outline" size={24} color={colors.ink} />
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}>
        {!snapshot ? (
          loadError ? (
            <View className="items-center gap-3 py-12">
              <ScalableText className="text-center text-sm text-ink-muted">{planErrorText(t, loadError)}</ScalableText>
              <Pressable accessibilityRole="button" onPress={() => void refresh()} className="min-h-[44px] justify-center px-4">
                <ScalableText className="text-base font-semibold text-brand">{t("familyPlan.retry")}</ScalableText>
              </Pressable>
            </View>
          ) : (
            <ActivityIndicator style={{ marginTop: 48 }} color={colors.brand} />
          )
        ) : locked ? (
          <LockedPlanPreview onUnlock={triggerPaywall} />
        ) : (
          <>
            <View className="flex-row gap-2 rounded-2xl bg-surface-sunken p-1">
              {[thisWeek, nextWeek].map((w) => (
                <Pressable
                  key={w}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: selected === w }}
                  onPress={() => setWeek(w)}
                  className={`min-h-[40px] flex-1 items-center justify-center rounded-xl ${selected === w ? "bg-surface" : ""}`}
                >
                  <ScalableText className={`text-sm font-semibold ${selected === w ? "text-ink" : "text-ink-muted"}`}>
                    {t(w === thisWeek ? "familyPlan.thisWeek" : "familyPlan.nextWeek")}
                  </ScalableText>
                </Pressable>
              ))}
            </View>

            {(error || (loadError && snapshot)) && (
              <View accessibilityLiveRegion="polite" className="flex-row items-start gap-2 rounded-2xl bg-surface-sunken p-3">
                <Ionicons name="alert-circle" size={18} color={colors.inkMuted} />
                <ScalableText className="flex-1 text-sm text-ink">{error ?? planErrorText(t, loadError!)}</ScalableText>
              </View>
            )}

            {!plan ? (
              planner ? (
                <View className="gap-3 rounded-2xl border border-[#E4DCCB] bg-surface p-4">
                  <ScalableText className="text-lg font-bold text-ink">
                    {t(selected === thisWeek ? "familyPlan.generateThis" : "familyPlan.generateNext")}
                  </ScalableText>
                  <ScalableText className="text-sm text-ink-muted">
                    {t("familyPlan.generateHint", { count: daysToPlan(selected, today).length })}
                  </ScalableText>
                  <ScalableText className="text-xs text-ink-faint">{t("familyPlan.oncePerWeek", { count: REGEN_LIMIT_PER_WEEK })}</ScalableText>
                  <ScalableText className="text-xs text-ink-faint">{t("familyPlan.allergyNote")}</ScalableText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t(selected === thisWeek ? "familyPlan.generateThis" : "familyPlan.generateNext")}
                    disabled={busy !== null}
                    onPress={onGenerate}
                    className="min-h-[48px] flex-row items-center justify-center gap-2 rounded-2xl bg-brand active:opacity-80"
                  >
                    {busy === "generate" ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <Ionicons name="sparkles" size={18} color={colors.white} />
                    )}
                    <ScalableText className="text-base font-bold text-white">
                      {t(selected === thisWeek ? "familyPlan.generateThis" : "familyPlan.generateNext")}
                    </ScalableText>
                  </Pressable>
                  {busy === "generate" && <ScalableText className="text-center text-xs text-ink-muted">{t("familyPlan.generating")}</ScalableText>}
                </View>
              ) : (
                <View className="items-center gap-2 rounded-2xl border border-dashed border-[#E4DCCB] px-6 py-8">
                  <Ionicons name="calendar-outline" size={28} color={colors.inkFaint} />
                  <ScalableText className="text-center text-sm text-ink-muted">{t("familyPlan.notPlannedYet")}</ScalableText>
                </View>
              )
            ) : (
              <>
                <View className="gap-1 px-1">
                  {planner && (
                    <ScalableText className="text-xs text-ink-muted">
                      {t("familyPlan.regenLeft", { count: Math.max(0, REGEN_LIMIT_PER_WEEK - plan.regenUsed) })}
                    </ScalableText>
                  )}
                  <ScalableText className="text-xs text-ink-faint">{t("familyPlan.allergyNote")}</ScalableText>
                </View>

                {dates.map((date) => (
                  <View key={date} className="gap-2">
                    <View className="flex-row items-center justify-between px-1">
                      <ScalableText className="text-base font-bold text-ink">
                        {`${dayLabel(date, locale)}${date === today ? ` · ${t("common.today")}` : ""}`}
                      </ScalableText>
                      {planner && date >= today && (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${t("familyPlan.redoDay")}, ${dayLabel(date, locale)}`}
                          disabled={busy !== null}
                          onPress={() => act(`day:${date}`, () => planService.regenerateDay(plan.id, date, pantry))}
                          className="min-h-[44px] flex-row items-center gap-1 px-2 active:opacity-70"
                        >
                          {busy === `day:${date}` ? (
                            <ActivityIndicator size="small" color={colors.brand} />
                          ) : (
                            <Ionicons name="refresh" size={16} color={colors.brand} />
                          )}
                          <ScalableText className="text-sm font-semibold text-brand">{t("familyPlan.redoDay")}</ScalableText>
                        </Pressable>
                      )}
                    </View>
                    {slots.map((slot) => {
                      const dish = plan.dishes.find((d) => d.date === date && d.slot === slot);
                      if (!dish) {
                        return (
                          <View key={slot} className="flex-row items-center gap-2 rounded-2xl border border-dashed border-[#E4DCCB] px-3 py-3">
                            <ScalableText className="text-xs font-semibold uppercase text-ink-muted">{t(`mealType.${slot}`)}</ScalableText>
                            <ScalableText className="text-sm text-ink-faint">{t("familyPlan.noDish")}</ScalableText>
                          </View>
                        );
                      }
                      return (
                        <PlanDishCard
                          key={dish.id}
                          dish={dish}
                          members={members}
                          portions={plan.portions}
                          myUserId={myUserId}
                          role={role}
                          today={today}
                          busy={busy}
                          onOpen={() => setOpenDish(dish)}
                          onPortion={(member) => setPortionTarget({ dish, member })}
                          onSwap={() => act(`swap:${dish.id}`, () => planService.swapDish(plan.id, dish.id, pantry))}
                          onLock={() => act(`lock:${dish.id}`, () => planService.setDishLocked(plan.id, dish.id, !dish.locked))}
                          onLog={() => setLogTarget(dish)}
                        />
                      );
                    })}
                  </View>
                ))}

                <SourcesLink variant="note" />

                {shopping && (
                  <PlanShoppingList shopping={shopping} fromLabel={dayLabel(fromDate, locale)} onStore={() => setStoreOpen(true)} />
                )}
              </>
            )}
          </>
        )}
      </ScrollView>

      {snapshot && plan && (
        <>
          <PortionSheet
            visible={!!portionTarget}
            member={portionTarget?.member ?? null}
            myUserId={myUserId}
            slot={portionDish?.slot ?? "dinner"}
            choice={portionTarget ? choiceFor(portionKey, portionTarget.member, plan.portions) : "medium"}
            overridden={!!portionTarget && plan.portions[portionKey]?.[portionTarget.member.userId] !== undefined}
            perServingKcal={portionDish?.perServing.calories ?? 0}
            onPick={onPick}
            onClose={() => setPortionTarget(null)}
          />
          <LogMealSheet
            visible={!!logTarget}
            dish={logTarget}
            members={members}
            portions={plan.portions}
            myUserId={myUserId}
            busy={!!logTarget && busy === `log:${logTarget.id}`}
            onConfirm={onConfirmLog}
            onClose={() => setLogTarget(null)}
          />
          <PlanDishSheet
            visible={!!openDish}
            dish={openDish}
            servings={openDish ? servingsFor(eatersOf(slotKey(openDish), members, plan.portions)) : 0}
            onClose={() => setOpenDish(null)}
          />
          {planner && (
            <CartExportSheet visible={storeOpen} runKey={`plan:${plan.id}`} items={storeItems} onClose={() => setStoreOpen(false)} />
          )}
        </>
      )}
      {snapshot && (
        <PlanSettingsSheet
          visible={settingsOpen}
          snapshot={snapshot}
          busy={settingsBusy}
          error={settingsError}
          onSave={onSaveSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </Screen>
  );
}
