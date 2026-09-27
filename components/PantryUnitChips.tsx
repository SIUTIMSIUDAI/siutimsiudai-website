import { useMemo } from "react";
import { Pressable, ScrollView } from "react-native";
import { ScalableText } from "./ScalableText";
import { useLocale } from "@/hooks/useLocale";
import { unitAfterTap, unitChipOptions } from "@/utils/pantryUnits";
import { PantryUnit } from "@/types";

interface Props {
  value: PantryUnit;
  // The unit this row started with: the AI's pick, or piece for a hand-added row. Its chip leads the
  // row and the order never changes while the user taps, so chips don't jump under a finger.
  lead: PantryUnit;
  onChange: (unit: PantryUnit) => void;
}

// The pantry's unit picker, shared by the scan's Review & edit screen and the Add item sheet so both
// behave the same: one sideways-scrolling row with the lead unit first. In Chinese, box and carton
// share 盒 and bottle and jar share 樽; the ordering and tap rules live in utils/pantryUnits.ts.
export function PantryUnitChips({ value, lead, onChange }: Props) {
  const { locale } = useLocale();
  const chips = useMemo(() => unitChipOptions(lead, locale), [lead, locale]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // A tap on a chip lands even while the quantity keyboard is still up.
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: 6 }}
    >
      {chips.map((chip) => {
        const selected = chip.units.includes(value);
        return (
          <Pressable
            key={chip.key}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={chip.label}
            onPress={() => onChange(unitAfterTap(chip, value))}
            className={`min-h-[44px] min-w-[44px] items-center justify-center rounded-xl px-4 ${
              selected ? "bg-ink" : "bg-surface-sunken"
            }`}
          >
            <ScalableText className={`text-sm font-semibold ${selected ? "text-white" : "text-ink-muted"}`}>
              {chip.label}
            </ScalableText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
