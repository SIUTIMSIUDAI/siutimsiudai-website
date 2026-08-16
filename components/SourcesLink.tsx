import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScalableText } from "./ScalableText";
import { colors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";

// The one affordance that takes a user from a health number to the source behind it (app/sources).
//
// Guideline 1.4.1 does not just ask for citations, it asks that they be EASY TO FIND. That is a
// placement problem, not a content problem, so this lives in one component and gets dropped on
// every surface that states a health figure: the calorie ring, the nutrient panel, the profile
// health card, profile setup, and the healthy-swap recipe screen. One implementation means the
// wording, the target and the tap area cannot drift apart between five screens, and adding a sixth
// health surface later is one line.
//
// Three shapes, same destination:
//   link — a bare underlined line, for tucking under a figure that already has context.
//   note — the same link under a one-line "estimates, not medical advice" caveat, for the surfaces
//          where we hand someone a personalised number they might act on.
//   row  — a settings-list row with a chevron, for the profile tab where everything is a row.

interface Props {
  variant?: "link" | "note" | "row";
  /** Centre the text (e.g. under the calorie ring). The row variant is always full width. */
  align?: "start" | "center";
}

export function SourcesLink({ variant = "link", align = "start" }: Props) {
  const { tl } = useLocale();
  const label = tl("Where our numbers come from", "我們的數字從何而來");
  const open = () => router.push("/sources");

  if (variant === "row") {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={open}
        className="min-h-[44px] flex-row items-center gap-3 rounded-xl bg-surface-sunken px-3 py-2.5 active:opacity-70"
      >
        <Ionicons name="document-text-outline" size={18} color={colors.inkMuted} />
        <ScalableText className="flex-1 text-sm font-semibold text-ink">{label}</ScalableText>
        <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
      </Pressable>
    );
  }

  const link = (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint={tl(
        "Opens the list of sources behind these figures",
        "開啟呢啲數字的資料來源",
      )}
      onPress={open}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      className={`min-h-[44px] flex-row items-center gap-1.5 active:opacity-70 ${
        align === "center" ? "justify-center" : ""
      }`}
    >
      <Ionicons name="information-circle-outline" size={15} color={colors.brand} />
      <ScalableText className="text-sm font-medium text-brand underline">{label}</ScalableText>
    </Pressable>
  );

  if (variant === "note") {
    return (
      <View
        className={`gap-0.5 rounded-xl bg-surface-subtle px-3 py-2 ${
          align === "center" ? "items-center" : ""
        }`}
      >
        {/* Short by design. The full caveat (conditions, medication, pregnancy, allergies) is at
            the top of the sources screen; repeating all of it on every surface would train the
            user to scroll past it. */}
        <ScalableText className="text-xs text-ink-muted">
          {tl(
            "These are general estimates, not medical advice.",
            "呢啲係一般估算，並非醫療建議。",
          )}
        </ScalableText>
        {link}
      </View>
    );
  }

  return link;
}
