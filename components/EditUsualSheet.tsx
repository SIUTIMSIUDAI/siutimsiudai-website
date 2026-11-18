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
import type { SavedMeal, MealType } from "@/types";
import type { UpdateMealResult, UpdateSavedMealInput } from "@/stores/savedMealsStore";

interface Props {
  visible: boolean;
  // The usual being edited, or null when the sheet is closed. Kept as a prop (not copied on open)
  // so the parent owns "which usual"; this sheet only owns the draft fields.
  meal: SavedMeal | null;
  onClose: () => void;
  // The caller applies the patch (store.updateMeal) and returns its result. A "duplicate" means the
  // new name collides with another usual, so the sheet stays open and warns instead of closing.
  onSave: (patch: UpdateSavedMealInput) => UpdateMealResult;
}

const INPUT = "rounded-xl border border-[#E4DCCB] bg-surface px-3 py-2 text-base text-ink";

// Parse a typed macro/calorie string to a non-negative number. Blank or junk means zero (e.g.
// clearing the fibre field), so a stray character never writes NaN into a usual. Mirrors the same
// helper in EditEntrySheet; kept local so that shipped sheet stays untouched.
function toNum(raw: string): number {
  const n = parseFloat(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// One labelled numeric field with a trailing unit, laid out to share a row. Macros are whole grams
// on screen but decimal-pad is allowed so a careful user can still type a fraction.
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

// Slide-up editor for one "usual" (a saved quick-add template). Lets the user correct the name
// (EN + 中文), the default meal type and the four macros + fibre. Unlike EditEntrySheet there is no
// time, no micros and no AI re-estimate: a usual is a plain reusable macro template, matching what
// QuickAddRow logs.
export function EditUsualSheet({ visible, meal, onClose, onSave }: Props) {
  const { t, tl } = useLocale();

  const [name, setName] = useState("");
  const [nameZh, setNameZh] = useState("");
  const [mealType, setMealType] = useState<MealType>("snack");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [fiber, setFiber] = useState("");
  // Set when a save is blocked because the new name is already another usual. Cleared on any edit.
  const [nameTaken, setNameTaken] = useState(false);

  // Prefill from the meal whenever the sheet opens on a new item. Keyed on id + visible (not the
  // whole object) so re-renders don't clobber what the user is typing.
  useEffect(() => {
    if (!meal) return;
    setName(meal.name);
    setNameZh(meal.nameZh);
    setMealType(meal.defaultMealType);
    setCalories(String(Math.round(meal.calories)));
    setProtein(String(Math.round(meal.protein)));
    setCarbs(String(Math.round(meal.carbs)));
    setFat(String(Math.round(meal.fat)));
    setFiber(String(Math.round(meal.fiber)));
    setNameTaken(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meal?.id, visible]);

  const hasName = name.trim().length > 0 || nameZh.trim().length > 0;

  function handleSave() {
    if (!meal || !hasName) return;
    const en = name.trim();
    const zh = nameZh.trim();
    const result = onSave({
      // Mirror the manual-log rule: neither language is left blank if the other is filled.
      name: en || zh,
      nameZh: zh || en,
      defaultMealType: mealType,
      calories: toNum(calories),
      protein: toNum(protein),
      carbs: toNum(carbs),
      fat: toNum(fat),
      fiber: toNum(fiber),
    });
    // A clash keeps the sheet open with a warning; the parent closes only on a real update.
    if (result === "duplicate") setNameTaken(true);
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
              {tl("Edit usual", "改老規矩")}
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
                onChangeText={(v) => {
                  setName(v);
                  setNameTaken(false);
                }}
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
                onChangeText={(v) => {
                  setNameZh(v);
                  setNameTaken(false);
                }}
                placeholder={tl("Name (中文)", "名稱（中文）")}
                placeholderTextColor={colors.inkFaint}
              />
            </View>

            {/* Name clash with another usual: keep the sheet open and say so rather than silently
                dropping the edit. */}
            {nameTaken && (
              <View
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                className="flex-row items-start gap-2 rounded-xl bg-surface-sunken p-3"
              >
                <Ionicons name="alert-circle-outline" size={18} color={colors.inkMuted} />
                <ScalableText className="flex-1 text-sm leading-5 text-ink">
                  {tl(
                    "That name is already one of your usuals. Pick another name.",
                    "呢個名已經係你嘅老規矩，揀第二個名啦。",
                  )}
                </ScalableText>
              </View>
            )}

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
              disabled={!hasName}
              onPress={handleSave}
            />

            {/* The macros above are health figures on screen, so the sources link travels with
                them (Guideline 1.4.1), same as the edit-entry sheet. */}
            <SourcesLink />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
