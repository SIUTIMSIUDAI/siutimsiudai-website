import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScalableText } from "./ScalableText";
import { colors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";
import { formatPantryAmount } from "@/utils/pantryUnits";
import { MeasurementSystem, PantryItem } from "@/types";

interface Props {
  item: PantryItem;
  system: MeasurementSystem;
  onToggle: () => void;
  onRemove: () => void;
}

// One pantry line. The left circle is the in-stock toggle (drives the "cook now" highlight
// and grocery deduction); quantity shows only when tracked by amount.
export function PantryItemRow({ item, system, onToggle, onRemove }: Props) {
  const { t, tl, locale } = useLocale();
  // "3 boxes" / "3 盒"; null for an item marked in stock without an amount.
  const amount = formatPantryAmount(item.quantity, item.unit, system, locale);

  return (
    <View className="flex-row items-center gap-2 border-b border-[#E8E1D2] py-2">
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.inStock }}
        accessibilityLabel={`${t("pantry.inStock")} ${tl(item.name, item.nameZh)}`}
        onPress={onToggle}
        className="h-11 w-11 items-center justify-center"
      >
        <Ionicons
          name={item.inStock ? "checkmark-circle" : "ellipse-outline"}
          size={26}
          color={item.inStock ? colors.jade : colors.inkFaint}
        />
      </Pressable>
      <View className="flex-1">
        <ScalableText
          className={`text-base font-semibold ${item.inStock ? "text-ink" : "text-ink-faint"}`}
        >
          {tl(item.name, item.nameZh)}
        </ScalableText>
        {amount && <ScalableText className="text-xs text-ink-muted">{amount}</ScalableText>}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t("common.delete")} ${tl(item.name, item.nameZh)}`}
        onPress={onRemove}
        className="h-11 w-11 items-center justify-center"
      >
        <Ionicons name="trash-outline" size={18} color={colors.inkFaint} />
      </Pressable>
    </View>
  );
}
