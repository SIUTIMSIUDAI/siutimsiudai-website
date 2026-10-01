import { type ComponentProps } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScalableText } from "./ScalableText";
import { colors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";
import { TargetStatus } from "@/utils/nutritionReport";

// On target, over or under, always as an icon plus a word so colour is never the only signal. The
// icon carries the theme's meaning (jade for healthy, egg-tart gold for over, as on the calorie
// ring); the word stays in ink.
export function TargetStatusLabel({ status }: { status: TargetStatus | null }) {
  const { tl } = useLocale();
  if (!status) return null;
  const spec: { icon: ComponentProps<typeof Ionicons>["name"]; color: string; text: string } =
    status === "on"
      ? { icon: "checkmark-circle", color: colors.jade, text: tl("On target", "達標") }
      : status === "over"
        ? { icon: "arrow-up-circle", color: colors.accentDark, text: tl("Over", "超標") }
        : { icon: "arrow-down-circle", color: colors.inkFaint, text: tl("Under", "唔夠") };
  return (
    <View className="flex-row items-center gap-1">
      <Ionicons name={spec.icon} size={14} color={spec.color} />
      <ScalableText className="text-xs font-semibold text-ink-muted">{spec.text}</ScalableText>
    </View>
  );
}
