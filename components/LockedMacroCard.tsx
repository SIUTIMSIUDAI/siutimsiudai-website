import { Pressable, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { ScalableText } from "./ScalableText";
import { colors, macroColors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";

interface Props {
  // Route to the paywall. Wired to useFeatureAccess("macro_drawer").triggerPaywall by the screen.
  onUnlock: () => void;
}

// Invented fill fractions for the four decoy macro bars (carbs / protein / fat / fibre), in the
// same order the real card renders them. Deliberately NOT derived from any logged day, so a free
// user sees the SHAPE of a macro breakdown behind the blur but no real gram figure ever enters the
// tree. The blur is aesthetic; the security is the fake data.
const DECOY_BARS: { frac: number; color: string }[] = [
  { frac: 0.72, color: macroColors.carbs },
  { frac: 0.54, color: macroColors.protein },
  { frac: 0.4, color: macroColors.fat },
  { frac: 0.28, color: macroColors.fiber },
];

// One decoy macro bar: placeholder label + value pills over a part-filled coloured track. Mirrors
// MacroProgressBar's proportions so the blurred skeleton reads as the real card beneath it.
function DecoyBar({ frac, color }: { frac: number; color: string }) {
  return (
    <View className="mb-3">
      <View className="mb-1 flex-row items-end justify-between">
        <View className="h-3 w-16 rounded-full bg-surface-sunken" />
        <View className="h-3 w-12 rounded-full bg-surface-sunken" />
      </View>
      <View className="h-2.5 overflow-hidden rounded-full bg-surface-sunken">
        <View
          style={{ width: `${frac * 100}%`, backgroundColor: color }}
          className="h-full rounded-full"
        />
      </View>
    </View>
  );
}

// The locked macro-breakdown state for free users on the History tab. The four macro bars are
// blurred and dimmed under a charcoal scrim, with a compact upsell card floated on top. Calories
// stay visible in the hero above this; only the carbs / protein / fat / fibre split is Pro. Mirrors
// LockedTrendCard so the two History locks feel like one system.
export function LockedMacroCard({ onUnlock }: Props) {
  const { tl } = useLocale();

  return (
    <View className="relative overflow-hidden rounded-2xl border border-[#E4DCCB] bg-surface p-4">
      {DECOY_BARS.map((bar, i) => (
        <DecoyBar key={i} frac={bar.frac} color={bar.color} />
      ))}

      {/* Native blur (expo-blur, works in Expo Go + web) plus a guaranteed charcoal tint. */}
      <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={StyleSheet.absoluteFill} className="bg-charcoal/40" />

      <View className="absolute inset-0 items-center justify-center p-5">
        <View className="h-12 w-12 items-center justify-center rounded-full bg-brand/10">
          <Ionicons name="lock-closed" size={22} color={colors.brand} />
        </View>
        <ScalableText className="mt-2 text-center text-base font-bold text-ink">
          {tl("See your macro breakdown", "睇你嘅營養分佈")}
        </ScalableText>
        <ScalableText className="mt-1 text-center text-xs leading-5 text-ink-muted">
          {tl(
            "Upgrade to Pro to track carbs, protein, fat and fibre.",
            "升級 Pro，追蹤碳水、蛋白質、脂肪同纖維。",
          )}
        </ScalableText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tl("Unlock macro breakdown", "解鎖營養分佈")}
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
