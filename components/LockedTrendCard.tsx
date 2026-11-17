import { Pressable, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { ScalableText } from "./ScalableText";
import { colors, macroColors, microColors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";

interface Props {
  // Route to the paywall. Wired to the screen's triggerPaywall (useFeatureAccess).
  onUnlock: () => void;
}

// Invented report rows (colour + how full the bar is). Deliberately NOT derived from any logged day,
// so a free user sees the SHAPE of the report behind the blur but no real figure ever enters the
// tree. The blur is aesthetic; the security is the fake data.
const DECOY: { color: string; fill: number }[] = [
  { color: microColors.vitaminD, fill: 0.15 },
  { color: macroColors.fiber, fill: 0.42 },
  { color: macroColors.protein, fill: 0.56 },
  { color: colors.brand, fill: 0.62 },
  { color: macroColors.carbs, fill: 0.7 },
];

function DecoyRow({ color, fill }: { color: string; fill: number }) {
  return (
    <View className="gap-2 border-t border-[#E4DCCB] py-3">
      <View className="flex-row items-center gap-2">
        <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        <View className="h-2.5 w-20 rounded-full bg-surface-sunken" />
        <View className="flex-1" />
        <View className="h-2.5 w-16 rounded-full bg-surface-sunken" />
      </View>
      <View className="h-2 overflow-hidden rounded-full bg-surface-sunken">
        <View className="h-2 rounded-full" style={{ width: `${fill * 100}%`, backgroundColor: color }} />
      </View>
    </View>
  );
}

// The locked report state for free users. A decoy report card is blurred and dimmed under a
// charcoal scrim, with a compact upsell card floated on top. Mirrors LockedMealListCard so the
// History locks feel like one system.
export function LockedTrendCard({ onUnlock }: Props) {
  const { tl } = useLocale();

  return (
    <View className="relative overflow-hidden rounded-2xl border border-[#E4DCCB] bg-surface p-4">
      {/* Decoy report skeleton: placeholder header and summary, then invented rows. */}
      <View className="mb-3 flex-row items-center justify-between">
        <View className="h-3 w-24 rounded-full bg-surface-sunken" />
        <View className="h-8 w-28 rounded-full bg-surface-sunken" />
      </View>
      <View className="mb-2 h-2.5 w-48 rounded-full bg-surface-sunken" />
      {DECOY.map((row, i) => (
        <DecoyRow key={i} color={row.color} fill={row.fill} />
      ))}

      {/* Native blur (expo-blur, works in Expo Go + web) plus a guaranteed charcoal tint. */}
      <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={StyleSheet.absoluteFill} className="bg-charcoal/40" />

      <View className="absolute inset-0 items-center justify-center p-5">
        <View className="h-12 w-12 items-center justify-center rounded-full bg-brand/10">
          <Ionicons name="lock-closed" size={22} color={colors.brand} />
        </View>
        <ScalableText className="mt-2 text-center text-base font-bold text-ink">
          {tl("See how you did", "睇你食得點")}
        </ScalableText>
        <ScalableText className="mt-1 text-center text-xs leading-5 text-ink-muted">
          {tl(
            "Upgrade to Pro to compare your days with your targets, over any dates.",
            "升級 Pro，睇吓你每日同目標比較，日子任你揀。",
          )}
        </ScalableText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tl("Unlock your report", "解鎖報告")}
          onPress={onUnlock}
          className="mt-3 min-h-[44px] flex-row items-center justify-center gap-2 rounded-2xl bg-brand px-5 py-2.5 active:opacity-90"
        >
          <Ionicons name="sparkles" size={15} color={colors.white} />
          <ScalableText className="text-sm font-bold text-white">{tl("Unlock", "解鎖")}</ScalableText>
        </Pressable>
      </View>
    </View>
  );
}
