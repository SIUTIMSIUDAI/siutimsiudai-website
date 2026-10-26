import { ActivityIndicator, Pressable, View } from "react-native";
import { ScalableText } from "@/components/ScalableText";
import { colors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";
import type { PlanDish, PlanMember, WeekPlan } from "@/types/familyPlan";
import { choiceFor, mealLogLines, slotKey } from "@/utils/weekPlan";
import { PlanSheet } from "./PlanSheet";
import { choiceLabel, memberName } from "./labels";

interface Props {
  visible: boolean;
  dish: PlanDish | null;
  members: PlanMember[];
  portions: WeekPlan["portions"];
  myUserId: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * The 食咗 confirm step: exactly what will go into whose diary (each eater's own portion and its
 * estimated calories), who is left out because they weren't eating, and when the others will see it.
 */
export function LogMealSheet({ visible, dish, members, portions, myUserId, busy, onConfirm, onClose }: Props) {
  const { t, tl } = useLocale();
  if (!dish) return null;
  const lines = mealLogLines(dish, members, portions);
  const byId = new Map(members.map((m) => [m.userId, m]));
  const skipped = members.filter((m) => choiceFor(slotKey(dish), m, portions) === "skip").map((m) => memberName(t, m, myUserId));
  const othersEating = lines.some((l) => l.userId !== myUserId);

  return (
    <PlanSheet
      visible={visible}
      title={t("familyPlan.logTitle", { dish: tl(dish.title, dish.titleZh) })}
      onClose={onClose}
      footer={
        lines.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("familyPlan.logConfirm")}
            disabled={busy}
            onPress={onConfirm}
            className="mt-3 min-h-[48px] flex-row items-center justify-center gap-2 rounded-2xl bg-jade active:opacity-80"
          >
            {busy && <ActivityIndicator size="small" color={colors.white} />}
            <ScalableText className="text-base font-bold text-white">{t("familyPlan.logConfirm")}</ScalableText>
          </Pressable>
        ) : null
      }
    >
      <View className="gap-3 pb-1">
        {lines.length === 0 ? (
          <ScalableText className="text-sm text-ink-muted">{t("familyPlan.logNobody")}</ScalableText>
        ) : (
          <>
            <ScalableText className="text-sm text-ink-muted">{t("familyPlan.logBody")}</ScalableText>
            <View className="rounded-2xl border border-[#E4DCCB]">
              {lines.map((l, i) => {
                const m = byId.get(l.userId)!;
                return (
                  <View
                    key={l.userId}
                    className={`flex-row items-center gap-2 px-3 py-2.5 ${i > 0 ? "border-t border-[#E8E1D2]" : ""}`}
                  >
                    <ScalableText className="flex-1 text-base font-semibold text-ink">{memberName(t, m, myUserId)}</ScalableText>
                    <ScalableText className="text-sm font-bold text-brand">{choiceLabel(t, l.size, true)}</ScalableText>
                    <ScalableText className="w-24 text-right text-sm text-ink-muted">{`${l.entry.calories} kcal`}</ScalableText>
                  </View>
                );
              })}
            </View>
            <ScalableText className="text-[11px] text-ink-faint">{t("familyPlan.kcalEst")}</ScalableText>
          </>
        )}
        {skipped.length > 0 && (
          <ScalableText className="text-sm text-ink-muted">{t("familyPlan.logSkipped", { names: skipped.join(t("familyPlan.listSep")) })}</ScalableText>
        )}
        {othersEating && <ScalableText className="text-xs text-ink-faint">{t("familyPlan.logOthersNote")}</ScalableText>}
      </View>
    </PlanSheet>
  );
}
