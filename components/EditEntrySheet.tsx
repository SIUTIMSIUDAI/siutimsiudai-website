import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScalableText } from "./ScalableText";
import { Button } from "./Button";
import { MealTypePicker } from "./MealTypePicker";
import { SourcesLink } from "./SourcesLink";
import { colors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";
import { applyTimeOfDay, formatTimeOfDay, parseTimeOfDay } from "@/utils/entryTime";
import { FoodEntry, MealType } from "@/types";

interface Props {
  visible: boolean;
  // The entry being edited, or null when the sheet is closed. Kept as a prop (not copied on open)
  // so the parent owns "which entry"; this sheet only owns the draft fields.
  entry: FoodEntry | null;
  onClose: () => void;
  // The caller applies the patch (store.editEntry) and closes the sheet. Only changed-by-design
  // fields are sent; customizations and micros are omitted so a merge preserves them.
  onSave: (patch: Partial<FoodEntry>) => void;
}

const INPUT = "rounded-xl border border-[#E4DCCB] bg-surface px-3 py-2 text-base text-ink";

// Parse a typed macro/calorie string to a non-negative number. Blank or junk means zero (e.g.
// clearing the fibre field), so a stray character never writes NaN into the ledger.
function toNum(raw: string): number {
  const n = parseFloat(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// One labelled numeric field with a trailing unit, laid out to share a row. Macros are whole grams
// on screen (rounded on prefill), but decimal-pad is allowed so a careful user can still type a
// fraction.
function NumField({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View className="flex-1 gap-1">
      <ScalableText className="text-xs font-semibold text-ink-muted">{label}</ScalableText>
      <View className="flex-row items-center gap-1 rounded-xl border border-[#E4DCCB] bg-surface px-3">
        <TextInput
          className="flex-1 py-2 text-base text-ink"
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={colors.inkFaint}
        />
        <ScalableText className="text-xs text-ink-faint">{unit}</ScalableText>
      </View>
    </View>
  );
}

// Slide-up editor for a single logged item. Opened by tapping a row on the dashboard; lets the user
// correct the name (EN + 中文), the four macros + fibre, the meal type and the time of day. The
// calorie/macro values shown are the entry's BASE figures (before any 少甜 / 少底 tweak), which is
// what the row's chips deduct from — editing here changes the base and the chips still apply.
export function EditEntrySheet({ visible, entry, onClose, onSave }: Props) {
  const { t, tl } = useLocale();

  const [name, setName] = useState("");
  const [nameZh, setNameZh] = useState("");
  const [mealType, setMealType] = useState<MealType>("lunch");
  const [time, setTime] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [fiber, setFiber] = useState("");

  // Prefill from the entry whenever the sheet opens on a new item. Keyed on id + visible (not the
  // whole entry object) so re-renders don't clobber what the user is typing.
  useEffect(() => {
    if (!entry) return;
    setName(entry.name);
    setNameZh(entry.nameZh);
    setMealType(entry.mealType);
    setTime(formatTimeOfDay(entry.loggedAt));
    setCalories(String(Math.round(entry.calories)));
    setProtein(String(Math.round(entry.protein)));
    setCarbs(String(Math.round(entry.carbs)));
    setFat(String(Math.round(entry.fat)));
    setFiber(String(Math.round(entry.fiber)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id, visible]);

  // At least one name, and a time the clock can actually be (parseTimeOfDay guards range + shape).
  const hasName = name.trim().length > 0 || nameZh.trim().length > 0;
  const canSave = hasName && parseTimeOfDay(time) !== null;

  function handleSave() {
    if (!entry || !canSave) return;
    const en = name.trim();
    const zh = nameZh.trim();
    const patch: Partial<FoodEntry> = {
      // Mirror the manual-log rule: neither language is left blank if the other is filled.
      name: en || zh,
      nameZh: zh || en,
      mealType,
      calories: toNum(calories),
      protein: toNum(protein),
      carbs: toNum(carbs),
      fat: toNum(fat),
      fiber: toNum(fiber),
      // canSave already proved the time parses; the ?? keeps the original instant belt-and-braces.
      loggedAt: applyTimeOfDay(entry.loggedAt, time) ?? entry.loggedAt,
    };
    onSave(patch);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-end bg-black/40"
      >
        <Pressable
          className="flex-1"
          accessibilityRole="button"
          accessibilityLabel={t("common.cancel")}
          onPress={onClose}
        />
        <View className="rounded-t-3xl bg-surface px-4 pb-8 pt-3" style={{ maxHeight: "88%" }}>
          <View className="mb-3 h-1.5 w-10 self-center rounded-full bg-surface-sunken" />
          <View className="mb-3 flex-row items-center justify-between">
            <ScalableText className="text-xl font-bold text-ink">
              {tl("Edit meal", "改記錄")}
            </ScalableText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common.cancel")}
              onPress={onClose}
              className="h-11 w-11 items-center justify-center"
            >
              <Ionicons name="close" size={24} color={colors.inkMuted} />
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 12, paddingBottom: 8 }}
          >
            <MealTypePicker value={mealType} onChange={setMealType} />

            <View className="gap-1">
              <ScalableText className="text-xs font-semibold text-ink-muted">
                {tl("Name (English)", "名稱（英文）")}
              </ScalableText>
              <TextInput
                className={INPUT}
                value={name}
                onChangeText={setName}
                placeholder={tl("Name (English)", "名稱（英文）")}
                placeholderTextColor={colors.inkFaint}
              />
            </View>

            <View className="gap-1">
              <ScalableText className="text-xs font-semibold text-ink-muted">
                {tl("Name (中文)", "名稱（中文）")}
              </ScalableText>
              <TextInput
                className={INPUT}
                value={nameZh}
                onChangeText={setNameZh}
                placeholder={tl("Name (中文)", "名稱（中文）")}
                placeholderTextColor={colors.inkFaint}
              />
            </View>

            <View className="gap-1">
              <ScalableText className="text-xs font-semibold text-ink-muted">
                {tl("Time", "時間")}
              </ScalableText>
              <TextInput
                className={INPUT}
                value={time}
                onChangeText={setTime}
                keyboardType="numbers-and-punctuation"
                placeholder="08:30"
                placeholderTextColor={colors.inkFaint}
              />
              {!canSave && time.trim().length > 0 && parseTimeOfDay(time) === null && (
                <ScalableText className="text-xs text-ink-faint">
                  {tl("Use 24-hour time, like 08:30.", "用 24 小時制，例如 08:30。")}
                </ScalableText>
              )}
            </View>

            <NumField
              label={tl("Calories", "卡路里")}
              unit="kcal"
              value={calories}
              onChange={setCalories}
            />

            <View className="flex-row gap-2">
              <NumField label={t("dashboard.protein")} unit="g" value={protein} onChange={setProtein} />
              <NumField label={t("dashboard.carbs")} unit="g" value={carbs} onChange={setCarbs} />
            </View>
            <View className="flex-row gap-2">
              <NumField label={t("dashboard.fat")} unit="g" value={fat} onChange={setFat} />
              <NumField label={t("dashboard.fibre")} unit="g" value={fiber} onChange={setFiber} />
            </View>

            <Button
              label={t("common.save")}
              icon="checkmark"
              disabled={!canSave}
              onPress={handleSave}
            />

            {/* The macros above are health figures on screen, so the sources link travels with
                them (Guideline 1.4.1), same as the log sheet's order slips. */}
            <SourcesLink />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
