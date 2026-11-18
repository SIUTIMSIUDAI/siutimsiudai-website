import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { ScalableText } from "@/components/ScalableText";
import { helperChoiceLabel, helperMemberName, useHelperT } from "@/components/helper/helperText";
import { servingsText } from "@/components/familyPlan/labels";
import { colors } from "@/constants/theme";
import { useFamilyPlanStore } from "@/stores/familyPlanStore";
import { localiseDish } from "@/utils/helperPlan";
import { choiceFor, eatersOf, formatPlanAmount, scaledIngredients, servingsFor, slotKey } from "@/utils/weekPlan";

interface Props {
  dishId: string;
}

/**
 * One dish to cook from, in the helper's language: who is eating which size, every ingredient for
 * everyone eating it with its Chinese name and its amount in grams plus 斤／兩, then the steps.
 */
export function HelperDishScreen({ dishId }: Props) {
  const helper = useFamilyPlanStore((s) => s.helper);
  const lang = helper?.me.helperLanguage ?? "en";
  const ht = useHelperT(lang);
  const plan = helper?.plans.find((p) => p.dishes.some((d) => d.id === dishId));
  const dish = plan?.dishes.find((d) => d.id === dishId);

  const header = (title: string) => (
    <View className="flex-row items-center gap-1 px-2 pt-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={ht("helper.back")}
        onPress={() => router.back()}
        className="h-11 w-11 items-center justify-center"
      >
        <Ionicons name="chevron-back" size={26} color={colors.ink} />
      </Pressable>
      <ScalableText className="flex-1 text-xl font-bold text-ink" numberOfLines={2}>
        {title}
      </ScalableText>
    </View>
  );

  if (!helper || !plan || !dish) {
    return (
      <Screen>
        {header(ht("helper.title"))}
        <View className="items-center px-6 py-12">
          <ScalableText className="text-center text-sm text-ink-muted">{ht("helper.errUnavailable")}</ScalableText>
        </View>
      </Screen>
    );
  }

  const local = localiseDish(dish, lang);
  const key = slotKey(dish);
  const servings = servingsFor(eatersOf(key, helper.members, plan.portions));
  const amounts = scaledIngredients(dish, servings);

  return (
    <Screen>
      {header(local.title)}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 18 }}>
        <View className="gap-1">
          <ScalableText className="text-base text-ink-muted">{local.titleZh}</ScalableText>
          <ScalableText className="text-sm text-ink-muted">
            {`${ht(`helper.meal.${dish.slot}`)} · ${ht("helper.cookFor", { n: servingsText(servings) })} · ${ht("helper.minutes", { count: dish.totalMinutes })}`}
          </ScalableText>
        </View>

        <View className="gap-2">
          <ScalableText className="text-sm font-semibold text-ink-muted">{ht("helper.whoEats")}</ScalableText>
          <View className="flex-row flex-wrap gap-1.5">
            {helper.members.map((m) => {
              const choice = choiceFor(key, m, plan.portions);
              return (
                <View
                  key={m.userId}
                  className={`flex-row items-center gap-1 rounded-full border border-[#E4DCCB] px-3 py-1.5 ${choice === "skip" ? "bg-surface-sunken" : "bg-surface"}`}
                >
                  <ScalableText className={`text-sm font-semibold ${choice === "skip" ? "text-ink-faint" : "text-ink"}`}>
                    {helperMemberName(ht, m, helper.myUserId)}
                  </ScalableText>
                  <ScalableText className={`text-sm font-bold ${choice === "skip" ? "text-ink-faint" : "text-brand"}`}>
                    {helperChoiceLabel(ht, choice)}
                  </ScalableText>
                </View>
              );
            })}
          </View>
        </View>

        <View className="gap-2">
          <ScalableText className="text-sm font-semibold text-ink-muted">{ht("helper.ingredients")}</ScalableText>
          <View className="rounded-2xl border border-[#E4DCCB] bg-surface">
            {amounts.map((i, n) => {
              const amount = formatPlanAmount(i.quantity, i.unit, "cook");
              return (
                <View key={`${i.name}-${n}`} className={`flex-row items-center gap-2 px-3 py-2.5 ${n > 0 ? "border-t border-[#E8E1D2]" : ""}`}>
                  <View className="flex-1">
                    <ScalableText className="text-base font-semibold text-ink">{local.ingredients[n].local}</ScalableText>
                    <ScalableText className="text-sm text-ink-muted">{i.nameZh}</ScalableText>
                  </View>
                  <View className="items-end">
                    <ScalableText className="text-base font-semibold text-ink">{amount.metric}</ScalableText>
                    {amount.market && <ScalableText className="text-sm text-ink-muted">{amount.market}</ScalableText>}
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        <View className="gap-3">
          <ScalableText className="text-sm font-semibold text-ink-muted">{ht("helper.steps")}</ScalableText>
          {local.steps.map((s) => (
            <View key={s.stepNumber} className="flex-row gap-3">
              <View className="h-8 w-8 items-center justify-center rounded-full bg-surface-sunken">
                <ScalableText className="text-sm font-bold text-ink">{s.stepNumber}</ScalableText>
              </View>
              <ScalableText className="flex-1 text-base leading-6 text-ink">{s.text}</ScalableText>
            </View>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}
