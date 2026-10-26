import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScalableText } from "./ScalableText";
import { colors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useFamilyPlanStore } from "@/stores/familyPlanStore";

// The way into the weekly family meal plan, on the Recipes tab. Everyone sees it; without Max it
// carries the Max badge and the plan screen shows its locked preview. A member of a Max family gets
// the real plan whatever their own plan, so once the app knows they're one, the badge goes.
export function FamilyPlanCard() {
  const { t } = useLocale();
  const { hasAccess } = useFeatureAccess("family_meal_plan");
  const familyMember = useFamilyPlanStore((s) => s.snapshot?.role === "dependent" || !!s.helper);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t("familyPlan.cardTitle")}. ${t("familyPlan.cardBody")}`}
      onPress={() => router.push("/family/plan")}
      className="flex-row items-center gap-3 rounded-2xl border border-[#E4DCCB] bg-surface p-4 active:opacity-80"
    >
      <View className="h-11 w-11 items-center justify-center rounded-full bg-brand/10">
        <Ionicons name="people" size={22} color={colors.brand} />
      </View>
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <ScalableText className="text-base font-bold text-ink">{t("familyPlan.cardTitle")}</ScalableText>
          {!hasAccess && !familyMember && (
            <View className="rounded-full bg-brand px-2 py-0.5">
              <ScalableText className="text-xs font-bold text-white">Max</ScalableText>
            </View>
          )}
        </View>
        <ScalableText className="text-sm text-ink-muted">{t("familyPlan.cardBody")}</ScalableText>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.inkFaint} />
    </Pressable>
  );
}
