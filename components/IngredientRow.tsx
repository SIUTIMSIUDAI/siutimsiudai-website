import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScalableText } from "./ScalableText";
import { colors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";
import { formatQuantity } from "@/utils/formatters";
import { displayInSystem } from "@/utils/unitConverter";
import { MeasurementSystem, RecipeIngredient } from "@/types";

interface Props {
  ingredient: RecipeIngredient;
  system: MeasurementSystem;
  onSwap: () => void;
  // True when this ingredient is not on hand in the pantry, so the row carries a "Missing" badge
  // that matches exactly what the cart-export sheet would send to a store (see missingCanonicalKeys).
  missing?: boolean;
}

export function IngredientRow({ ingredient, system, onSwap, missing }: Props) {
  const { t, tl, locale } = useLocale();
  const measure = displayInSystem(ingredient.quantity, ingredient.unit, system);
  const unitLabel = locale === "zh-Hant" ? measure.unitZh : measure.unit;

  return (
    <View className="flex-row items-center gap-3 border-b border-[#E8E1D2] py-3">
      <View className="flex-1">
        <ScalableText className="text-base font-semibold text-ink">
          {tl(ingredient.name, ingredient.nameZh)}
        </ScalableText>
        {ingredient.substitutedFrom && (
          <ScalableText className="text-xs font-medium text-accent-600">
            {tl(`was ${ingredient.substitutedFrom}`, `原為 ${ingredient.substitutedFrom}`)}
          </ScalableText>
        )}
        {missing && (
          <View
            className="mt-1 flex-row items-center gap-1 self-start rounded-full px-2 py-0.5"
            style={{ backgroundColor: "#FBEAC4" }}
          >
            <Ionicons name="basket-outline" size={11} color={colors.accentDark} />
            <ScalableText className="text-[11px] font-semibold" style={{ color: colors.accentDark }}>
              {tl("Missing", "欠缺")}
            </ScalableText>
          </View>
        )}
      </View>
      {measure.quantity > 0 && (
        <ScalableText className="text-base text-ink">
          {formatQuantity(measure.quantity)} {unitLabel}
        </ScalableText>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t("recipes.substitute")} ${tl(ingredient.name, ingredient.nameZh)}`}
        onPress={onSwap}
        className="h-11 w-11 items-center justify-center"
      >
        <Ionicons name="swap-horizontal" size={20} color={colors.brand} />
      </Pressable>
    </View>
  );
}
