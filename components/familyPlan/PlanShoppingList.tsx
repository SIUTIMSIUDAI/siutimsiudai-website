import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScalableText } from "@/components/ScalableText";
import { colors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";
import { formatPlanAmount, type WeeklyShopping } from "@/utils/weekPlan";

interface Props {
  shopping: WeeklyShopping;
  /** The first day it shops for, already worded ("10月26日 週一"). */
  fromLabel: string;
  onStore: () => void;
}

/** The week's missing ingredients, combined and grouped, in grams plus 斤／兩, and a way to a store. */
export function PlanShoppingList({ shopping, fromLabel, onStore }: Props) {
  const { t, tl } = useLocale();
  const empty = shopping.groups.length === 0;

  return (
    <View className="gap-3 rounded-2xl border border-[#E4DCCB] bg-surface p-4">
      <View className="gap-1">
        <ScalableText className="text-lg font-bold text-ink">{t("familyPlan.shoppingTitle")}</ScalableText>
        <ScalableText className="text-xs text-ink-muted">{t("familyPlan.shoppingFrom", { date: fromLabel })}</ScalableText>
      </View>

      {empty ? (
        <View className="flex-row items-center gap-2">
          <Ionicons name="checkmark-circle" size={18} color={colors.jade} />
          <ScalableText className="flex-1 text-sm text-ink-muted">{t("familyPlan.shoppingEmpty")}</ScalableText>
        </View>
      ) : (
        shopping.groups.map((group) => (
          <View key={group.category} className="gap-1">
            <ScalableText className="text-xs font-semibold uppercase text-ink-muted">
              {t(`familyPlan.category.${group.category}`)}
            </ScalableText>
            {group.lines.map((line) => {
              const amount = formatPlanAmount(line.quantity, line.unit, "shop");
              return (
                <View key={line.key} className="flex-row items-center gap-2 border-b border-[#E8E1D2] py-2">
                  <ScalableText className="flex-1 text-base text-ink">{tl(line.name, line.nameZh)}</ScalableText>
                  <ScalableText className="text-sm font-semibold text-ink">{amount.metric}</ScalableText>
                  {amount.market && <ScalableText className="text-sm text-ink-muted">{amount.market}</ScalableText>}
                </View>
              );
            })}
          </View>
        ))
      )}

      {shopping.coveredCount > 0 && (
        <ScalableText className="text-xs text-ink-faint">{t("familyPlan.shoppingCovered", { count: shopping.coveredCount })}</ScalableText>
      )}

      {!empty && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("familyPlan.shoppingStore")}
          onPress={onStore}
          className="min-h-[44px] flex-row items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 active:opacity-80"
        >
          <Ionicons name="storefront-outline" size={18} color={colors.white} />
          <ScalableText className="text-base font-semibold text-white">{t("familyPlan.shoppingStore")}</ScalableText>
        </Pressable>
      )}
    </View>
  );
}
