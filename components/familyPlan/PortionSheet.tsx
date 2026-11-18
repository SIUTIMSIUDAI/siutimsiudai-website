import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScalableText } from "@/components/ScalableText";
import { colors } from "@/constants/theme";
import { PORTION_FACTOR, PORTION_SIZES } from "@/constants/portionSizes";
import { useLocale } from "@/hooks/useLocale";
import type { MealType } from "@/types";
import type { PlanMember, PortionChoice } from "@/types/familyPlan";
import { personKcal } from "@/utils/weekPlan";
import { PlanSheet } from "./PlanSheet";
import { choiceLabel, memberName } from "./labels";

interface Props {
  visible: boolean;
  member: PlanMember | null;
  myUserId: string;
  slot: MealType;
  /** The current choice, and whether it was set for this slot (rather than being their usual). */
  choice: PortionChoice;
  overridden: boolean;
  perServingKcal: number;
  onPick: (choice: PortionChoice | null) => void;
  onClose: () => void;
}

/** 細 / 中 / 大 or 唔食呢餐 for one member at one meal, with what each size is worth. */
export function PortionSheet({ visible, member, myUserId, slot, choice, overridden, perServingKcal, onPick, onClose }: Props) {
  const { t } = useLocale();
  if (!member) return null;
  const options: PortionChoice[] = [...PORTION_SIZES, "skip"];

  return (
    <PlanSheet
      visible={visible}
      title={t("familyPlan.portionTitle", { name: memberName(t, member, myUserId), meal: t(`mealType.${slot}`) })}
      onClose={onClose}
    >
      <View className="gap-2 pb-2">
        {options.map((option) => {
          const selected = option === choice;
          const kcal = option === "skip" ? null : personKcal(perServingKcal, PORTION_FACTOR[option]);
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${choiceLabel(t, option, true)}${kcal !== null ? `, ${kcal} kcal` : ""}`}
              onPress={() => onPick(option)}
              className={`min-h-[52px] flex-row items-center gap-3 rounded-2xl border px-4 ${
                selected ? "border-brand bg-surface-subtle" : "border-[#E4DCCB]"
              } active:opacity-80`}
            >
              <ScalableText className="flex-1 text-base font-semibold text-ink">{choiceLabel(t, option, true)}</ScalableText>
              {kcal !== null && (
                <ScalableText className="text-sm text-ink-muted">{`${kcal} ${t("familyPlan.kcalEst")}`}</ScalableText>
              )}
              {selected && <Ionicons name="checkmark" size={20} color={colors.brand} />}
            </Pressable>
          );
        })}
        {overridden && (
          <Pressable
            accessibilityRole="button"
            onPress={() => onPick(null)}
            className="min-h-[44px] items-center justify-center active:opacity-70"
          >
            <ScalableText className="text-sm font-semibold text-brand">
              {t("familyPlan.backToUsual", { size: choiceLabel(t, member.defaultSize, true) })}
            </ScalableText>
          </Pressable>
        )}
      </View>
    </PlanSheet>
  );
}
