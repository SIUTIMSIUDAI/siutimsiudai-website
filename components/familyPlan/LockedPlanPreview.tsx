import { DimensionValue, Pressable, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { ScalableText } from "@/components/ScalableText";
import { colors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";

interface Props {
  onUnlock: () => void;
}

// One decoy meal row. Hard-coded shapes, no dish or number, like LockedMealListCard: the blur is for
// looks, and nothing real sits under it.
function DecoyRow({ titleW }: { titleW: DimensionValue }) {
  return (
    <View className="gap-2 border-b border-[#E8E1D2] py-3">
      <View className="h-3 w-16 rounded-full bg-surface-sunken" />
      <View className="h-4 rounded-full bg-surface-sunken" style={{ width: titleW }} />
      <View className="flex-row gap-1.5">
        <View className="h-6 w-20 rounded-full bg-surface-sunken" />
        <View className="h-6 w-20 rounded-full bg-surface-sunken" />
        <View className="h-6 w-16 rounded-full bg-surface-sunken" />
      </View>
    </View>
  );
}

const POINTS = ["familyPlan.lockedPoint1", "familyPlan.lockedPoint2", "familyPlan.lockedPoint3", "familyPlan.lockedPoint4"];

/** What Free and Pro see: the shape of a week's plan behind a blur, what Max adds, and 升級 Max. */
export function LockedPlanPreview({ onUnlock }: Props) {
  const { t } = useLocale();
  return (
    <View className="gap-4">
      <View className="relative overflow-hidden rounded-2xl border border-[#E4DCCB] bg-surface px-4 py-1">
        <DecoyRow titleW="62%" />
        <DecoyRow titleW="48%" />
        <DecoyRow titleW="55%" />
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={StyleSheet.absoluteFill} className="bg-charcoal/40" />
        <View className="absolute inset-0 items-center justify-center">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-surface">
            <Ionicons name="lock-closed" size={22} color={colors.brand} />
          </View>
        </View>
      </View>

      <View className="gap-3 rounded-2xl border border-[#E4DCCB] bg-surface p-4">
        <ScalableText className="text-lg font-bold text-ink">{t("familyPlan.lockedTitle")}</ScalableText>
        {POINTS.map((key) => (
          <View key={key} className="flex-row items-start gap-2">
            <Ionicons name="checkmark-circle" size={18} color={colors.jade} />
            <ScalableText className="flex-1 text-sm leading-5 text-ink">{t(key)}</ScalableText>
          </View>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("familyPlan.upgradeMax")}
          onPress={onUnlock}
          className="mt-1 min-h-[48px] items-center justify-center rounded-2xl bg-brand active:opacity-80"
        >
          <ScalableText className="text-base font-bold text-white">{t("familyPlan.upgradeMax")}</ScalableText>
        </Pressable>
      </View>
    </View>
  );
}
