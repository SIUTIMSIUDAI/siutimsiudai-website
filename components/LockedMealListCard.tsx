import { DimensionValue, Pressable, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { ScalableText } from "./ScalableText";
import { colors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";

interface Props {
  // Route to the paywall. Wired to useFeatureAccess("meal_history").triggerPaywall by the screen.
  onUnlock: () => void;
}

// One decoy meal row: an icon disc, a name/subtitle skeleton and a trailing value pill. The widths
// are hard-coded, NOT derived from any logged entry, so a free user sees the SHAPE of a meal list
// behind the blur but no real dish name or calorie figure ever enters the tree. The blur is
// aesthetic; the security is the fake data. Mirrors MemberEntryRow's proportions.
function DecoyRow({ nameW }: { nameW: DimensionValue }) {
  return (
    <View className="flex-row items-center gap-3 border-b border-[#E8E1D2] py-3">
      <View className="h-10 w-10 rounded-full bg-surface-sunken" />
      <View className="flex-1 gap-1.5">
        <View className="h-3.5 rounded-full bg-surface-sunken" style={{ width: nameW }} />
        <View className="h-3 w-20 rounded-full bg-surface-sunken" />
      </View>
      <View className="h-4 w-10 rounded-full bg-surface-sunken" />
    </View>
  );
}

// The locked per-day meal list for free users on the History tab. The rows are blurred and dimmed
// under a charcoal scrim, with a compact upsell floated on top. Calories and the macro split sit
// above this; only the "what you ate" list is Pro. Mirrors LockedMacroCard so the History locks
// feel like one system.
export function LockedMealListCard({ onUnlock }: Props) {
  const { tl } = useLocale();

  return (
    <View className="relative overflow-hidden rounded-2xl border border-[#E4DCCB] bg-surface px-4 py-1">
      <DecoyRow nameW="60%" />
      <DecoyRow nameW="45%" />
      <DecoyRow nameW="52%" />

      {/* Native blur (expo-blur, works in Expo Go + web) plus a guaranteed charcoal tint. */}
      <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={StyleSheet.absoluteFill} className="bg-charcoal/40" />

      <View className="absolute inset-0 items-center justify-center p-5">
        <View className="h-12 w-12 items-center justify-center rounded-full bg-brand/10">
          <Ionicons name="lock-closed" size={22} color={colors.brand} />
        </View>
        <ScalableText className="mt-2 text-center text-base font-bold text-ink">
          {tl("See what you ate", "睇返你食過啲乜")}
        </ScalableText>
        <ScalableText className="mt-1 text-center text-xs leading-5 text-ink-muted">
          {tl(
            "Upgrade to Pro to see every meal in your history, not just the totals, and add any you forgot to log.",
            "升級 Pro，睇返歷史入面每一餐，唔淨係總數，漏咗記嘅都可以補返。",
          )}
        </ScalableText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tl("Unlock meal history", "解鎖飲食記錄")}
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
