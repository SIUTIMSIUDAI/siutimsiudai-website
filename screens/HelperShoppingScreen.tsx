import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { ScalableText } from "@/components/ScalableText";
import { helperDayLabel, helperTimeLabel, useHelperT } from "@/components/helper/helperText";
import { colors } from "@/constants/theme";
import { useFamilyPlanStore } from "@/stores/familyPlanStore";
import { addDays, weekStartOf } from "@/utils/dateRange";
import { todayKey } from "@/utils/formatters";
import { localiseShopping } from "@/utils/helperPlan";
import { formatPlanAmount } from "@/utils/weekPlan";

/**
 * The week's shopping list in the helper's language, with the Chinese name of every item for the
 * market, in grams plus 斤／兩. It is the list the planner's phone last worked out (the pantry it
 * subtracts lives there), with when that was.
 */
export function HelperShoppingScreen() {
  const helper = useFamilyPlanStore((s) => s.helper);
  const lang = helper?.me.helperLanguage ?? "en";
  const ht = useHelperT(lang);
  const thisWeek = weekStartOf(todayKey());
  const nextWeek = addDays(thisWeek, 7);
  const [week, setWeek] = useState(thisWeek);

  const plans = helper?.plans ?? [];
  const weeks = [thisWeek, nextWeek].filter((w) => plans.some((p) => p.weekStart === w));
  const plan = plans.find((p) => p.weekStart === week) ?? plans.find((p) => p.weekStart === weeks[0]);
  const allDishes = plans.flatMap((p) => p.dishes);
  const groups = plan?.shopping ? localiseShopping(plan.shopping, allDishes, lang) : null;

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
          {ht("helper.shopping")}
        </ScalableText>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}>
        {weeks.length > 1 && (
          <View className="flex-row gap-1 rounded-2xl bg-surface-sunken p-1">
            {weeks.map((w) => (
              <Pressable
                key={w}
                accessibilityRole="tab"
                accessibilityState={{ selected: plan?.weekStart === w }}
                onPress={() => setWeek(w)}
                className={`min-h-[40px] flex-1 items-center justify-center rounded-xl ${plan?.weekStart === w ? "bg-surface" : ""}`}
              >
                <ScalableText className={`text-sm font-semibold ${plan?.weekStart === w ? "text-ink" : "text-ink-muted"}`}>
                  {ht(w === thisWeek ? "helper.thisWeek" : "helper.nextWeek")}
                </ScalableText>
              </Pressable>
            ))}
          </View>
        )}

        {!plan?.shopping || !groups ? (
          <View className="items-center gap-2 rounded-2xl border border-dashed border-[#E4DCCB] px-6 py-8">
            <Ionicons name="basket-outline" size={28} color={colors.inkFaint} />
            <ScalableText className="text-center text-sm text-ink-muted">{ht("helper.shoppingNone")}</ScalableText>
          </View>
        ) : (
          <View className="gap-3 rounded-2xl border border-[#E4DCCB] bg-surface p-4">
            <ScalableText className="text-xs text-ink-muted">
              {ht("helper.shoppingFrom", {
                date: helperDayLabel(ht, plan.shopping.fromDate),
                time: helperTimeLabel(ht, plan.shopping.updatedAt),
              })}
            </ScalableText>
            {groups.length === 0 ? (
              <View className="flex-row items-center gap-2">
                <Ionicons name="checkmark-circle" size={18} color={colors.jade} />
                <ScalableText className="flex-1 text-sm text-ink-muted">{ht("helper.shoppingEmpty")}</ScalableText>
              </View>
            ) : (
              groups.map((g) => (
                <View key={g.category} className="gap-1">
                  <ScalableText className="text-xs font-semibold uppercase text-ink-muted">{ht(`helper.category.${g.category}`)}</ScalableText>
                  {g.lines.map((l) => {
                    const amount = formatPlanAmount(l.quantity, l.unit, "shop");
                    return (
                      <View key={`${l.name}-${l.unit}`} className="flex-row items-center gap-2 border-b border-[#E8E1D2] py-2">
                        <View className="flex-1">
                          <ScalableText className="text-base text-ink">{l.local}</ScalableText>
                          <ScalableText className="text-sm text-ink-muted">{l.nameZh}</ScalableText>
                        </View>
                        <View className="items-end">
                          <ScalableText className="text-base font-semibold text-ink">{amount.metric}</ScalableText>
                          {amount.market && <ScalableText className="text-sm text-ink-muted">{amount.market}</ScalableText>}
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
