import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { TFunction } from "i18next";
import { ScalableText } from "@/components/ScalableText";
import { colors } from "@/constants/theme";
import type { HelperDish, HelperLanguage, PlanMember, WeekPlan } from "@/types/familyPlan";
import { localiseDish } from "@/utils/helperPlan";
import { choiceFor, eatersOf, servingsFor, slotKey } from "@/utils/weekPlan";
import { helperChoiceLabel, helperMemberName } from "./helperText";
import { servingsText } from "@/components/familyPlan/labels";

interface Props {
  ht: TFunction;
  lang: HelperLanguage;
  dish: HelperDish;
  members: PlanMember[];
  portions: WeekPlan["portions"];
  myUserId: string;
  onOpen: () => void;
}

/**
 * One meal for the helper to cook: the dish in her language with its Chinese name, how many servings,
 * and who is eating which size. Sizes only, never calories.
 */
export function HelperDishCard({ ht, lang, dish, members, portions, myUserId, onOpen }: Props) {
  const local = localiseDish(dish, lang);
  const key = slotKey(dish);
  const servings = servingsFor(eatersOf(key, members, portions));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${ht(`helper.meal.${dish.slot}`)}: ${local.title}, ${local.titleZh}`}
      accessibilityHint={ht("helper.openDish")}
      onPress={onOpen}
      className="gap-2 rounded-2xl border border-[#E4DCCB] bg-surface p-3 active:opacity-80"
    >
      <View className="flex-row items-start gap-2">
        <View className="flex-1 gap-0.5">
          <ScalableText className="text-xs font-semibold uppercase text-ink-muted">{ht(`helper.meal.${dish.slot}`)}</ScalableText>
          <ScalableText className="text-base font-bold text-ink">{local.title}</ScalableText>
          <ScalableText className="text-sm text-ink-muted">{local.titleZh}</ScalableText>
          <ScalableText className="text-xs text-ink-muted">
            {`${ht("helper.cookFor", { n: servingsText(servings) })} · ${ht("helper.minutes", { count: dish.totalMinutes })}`}
          </ScalableText>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.inkFaint} />
      </View>
      <View className="flex-row flex-wrap gap-1.5">
        {members.map((m) => {
          const choice = choiceFor(key, m, portions);
          return (
            <View
              key={m.userId}
              className={`flex-row items-center gap-1 rounded-full px-3 py-1 ${choice === "skip" ? "bg-surface-sunken" : "bg-surface-subtle"}`}
            >
              <ScalableText className={`text-xs font-semibold ${choice === "skip" ? "text-ink-faint" : "text-ink"}`}>
                {helperMemberName(ht, m, myUserId)}
              </ScalableText>
              <ScalableText className={`text-xs font-bold ${choice === "skip" ? "text-ink-faint" : "text-brand"}`}>
                {helperChoiceLabel(ht, choice)}
              </ScalableText>
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}
