import { View } from "react-native";
import { ScalableText } from "@/components/ScalableText";
import { useLocale } from "@/hooks/useLocale";
import type { PlanDish } from "@/types/familyPlan";
import { formatPlanAmount, scaledIngredients } from "@/utils/weekPlan";
import { PlanSheet } from "./PlanSheet";
import { servingsText } from "./labels";

interface Props {
  visible: boolean;
  dish: PlanDish | null;
  /** Standard servings to cook for the people eating it. */
  servings: number;
  onClose: () => void;
}

/** A planned dish to cook from: ingredients for everyone eating, in grams plus 斤／兩, then the steps. */
export function PlanDishSheet({ visible, dish, servings, onClose }: Props) {
  const { t, tl } = useLocale();
  if (!dish) return null;
  const ingredients = scaledIngredients(dish, servings);

  return (
    <PlanSheet visible={visible} title={tl(dish.title, dish.titleZh)} onClose={onClose}>
      <View className="gap-4 pb-2">
        <View className="gap-1">
          <ScalableText className="text-sm font-semibold text-ink-muted">
            {t("familyPlan.ingredientsFor", { n: servingsText(servings) })}
          </ScalableText>
          <View className="rounded-2xl border border-[#E4DCCB]">
            {ingredients.map((i, index) => {
              const amount = formatPlanAmount(i.quantity, i.unit, "cook");
              return (
                <View
                  key={`${i.name}-${index}`}
                  className={`flex-row items-center gap-2 px-3 py-2.5 ${index > 0 ? "border-t border-[#E8E1D2]" : ""}`}
                >
                  <ScalableText className="flex-1 text-base text-ink">{tl(i.name, i.nameZh)}</ScalableText>
                  <ScalableText className="text-sm font-semibold text-ink">{amount.metric}</ScalableText>
                  {amount.market && <ScalableText className="text-sm text-ink-muted">{amount.market}</ScalableText>}
                </View>
              );
            })}
          </View>
        </View>

        <View className="gap-2">
          <ScalableText className="text-sm font-semibold text-ink-muted">{t("familyPlan.steps")}</ScalableText>
          {dish.steps.map((s) => (
            <View key={s.stepNumber} className="flex-row gap-3">
              <View className="h-7 w-7 items-center justify-center rounded-full bg-surface-sunken">
                <ScalableText className="text-sm font-bold text-ink">{s.stepNumber}</ScalableText>
              </View>
              <ScalableText className="flex-1 text-base leading-6 text-ink">{tl(s.instruction, s.instructionZh)}</ScalableText>
            </View>
          ))}
        </View>
      </View>
    </PlanSheet>
  );
}
