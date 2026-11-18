import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScalableText } from "./ScalableText";
import { colors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";
import { humanizeAmount } from "@/utils/cartExport";
import { GroceryListItem } from "@/types";

interface Props {
  // The recipe's still-missing ingredients: recipe need minus pantry stock, already merged and
  // filtered to a positive shortfall. This is the exact list the "Buy missing ingredients" sheet
  // sends to a store, so the callout and that list can never disagree.
  items: GroceryListItem[];
}

// A warm-tinted summary that sits on the recipe screen just above the full ingredient list: the
// items the pantry is short of, each crossed out with an X and tagged with the amount still to buy.
// Renders nothing when the pantry already covers the dish, so a fully-stocked recipe shows no empty
// box. Shares the egg-tart-gold "missing" tint with the per-row badges so the two read as one idea.
export function MissingIngredientsCallout({ items }: Props) {
  const { tl } = useLocale();
  if (items.length === 0) return null;

  return (
    <View className="gap-2 rounded-2xl p-3" style={{ backgroundColor: "#FBEAC4" }}>
      <View className="flex-row items-center gap-1.5">
        <Ionicons name="close-circle" size={16} color={colors.accentDark} />
        <ScalableText className="text-sm font-bold" style={{ color: colors.accentDark }}>
          {tl(
            `Missing ${items.length} ${items.length === 1 ? "item" : "items"}`,
            `仲爭 ${items.length} 樣`,
          )}
        </ScalableText>
      </View>

      {items.map((item) => {
        const amount = humanizeAmount(item.quantity, item.unit);
        return (
          <View
            key={item.id}
            accessible
            // The X is decorative; the row's label carries the meaning so a screen reader announces
            // "<ingredient>, short <amount>" rather than reading a bare cross.
            accessibilityLabel={tl(
              `${item.name}, short ${amount}`,
              `${item.nameZh}，爭 ${amount}`,
            )}
            className="flex-row items-center gap-2"
          >
            <Ionicons name="close" size={14} color={colors.accentDark} />
            <ScalableText className="flex-1 text-sm font-medium text-ink" numberOfLines={1}>
              {tl(item.name, item.nameZh)}
            </ScalableText>
            <ScalableText className="text-sm font-semibold text-ink-muted">{amount}</ScalableText>
          </View>
        );
      })}
    </View>
  );
}
