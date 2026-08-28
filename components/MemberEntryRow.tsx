import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScalableText } from "./ScalableText";
import { colors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";
import { formatCalories, shortTime } from "@/utils/formatters";
import { effectiveMacros } from "@/utils/customizations";
import { FoodEntry, LogSource, MealCustomization } from "@/types";

// The read-only twin of FoodEntryRow: same visual language, but no delete button and no
// customization toggles (a manager views, never edits). Effective calories come from the shared
// effectiveMacros so the number matches the dependent's own screen exactly.
const SOURCE_ICON: Record<LogSource, keyof typeof Ionicons.glyphMap> = {
  photo: "camera-outline",
  voice: "mic-outline",
  barcode: "barcode-outline",
  label: "document-text-outline",
  manual: "create-outline",
};

const CUSTOM_LABEL: Record<MealCustomization, string> = {
  less_sugar: "custom.lessSugar",
  less_rice: "custom.lessRice",
};

export function MemberEntryRow({ entry }: { entry: FoodEntry }) {
  const { t, tl, locale } = useLocale();
  const active = entry.customizations ?? [];
  const eff = effectiveMacros(entry, active);
  const saved = entry.calories - eff.calories;

  return (
    <View className="flex-row items-center gap-3 border-b border-[#E8E1D2] py-3">
      <View className="h-10 w-10 items-center justify-center rounded-full bg-surface-sunken">
        <Ionicons name={SOURCE_ICON[entry.source]} size={18} color={colors.inkMuted} />
      </View>
      <View className="flex-1">
        <ScalableText className="text-base font-semibold text-ink" numberOfLines={1}>
          {tl(entry.name, entry.nameZh)}
        </ScalableText>
        <ScalableText className="text-xs text-ink-muted">
          {t(`mealType.${entry.mealType}`)} · {shortTime(entry.loggedAt, locale)}
          {active.length > 0 ? ` · ${active.map((c) => t(CUSTOM_LABEL[c])).join(" · ")}` : ""}
        </ScalableText>
      </View>
      <View className="items-end">
        {saved > 0 && (
          <ScalableText className="text-xs text-ink-faint line-through">
            {formatCalories(entry.calories)}
          </ScalableText>
        )}
        <ScalableText
          className="text-base font-bold"
          style={{ color: saved > 0 ? colors.jade : colors.ink }}
        >
          {formatCalories(eff.calories)}
        </ScalableText>
        <ScalableText className="text-xs text-ink-faint">kcal</ScalableText>
      </View>
    </View>
  );
}
