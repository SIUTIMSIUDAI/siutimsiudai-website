import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScalableText } from "./ScalableText";
import { colors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";
import { TargetCoverage } from "@/utils/nutritionTargets";

// Shown in place of daily targets to anyone the Hong Kong reference doesn't cover: under-18s, and
// anyone pregnant or breastfeeding (section 2.6 of the reference). Renders nothing for adults.
export function TargetCoverageNote({ coverage }: { coverage: TargetCoverage }) {
  const { t } = useLocale();
  if (coverage === "adult") return null;
  return (
    <View className="flex-row items-start gap-3 rounded-2xl bg-brand/10 px-4 py-3">
      <Ionicons name="information-circle-outline" size={20} color={colors.brand} />
      <ScalableText className="flex-1 text-sm leading-5 text-ink">
        {t(coverage === "under_18" ? "health.under18Note" : "health.pregnancyNote")}
      </ScalableText>
    </View>
  );
}
