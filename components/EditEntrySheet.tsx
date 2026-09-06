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
import { nlpMealService } from "@/services";
import type { InvokeFailure } from "@/services/functionError";
import { useSavedMealsStore } from "@/stores/savedMealsStore";
import { EntryMicronutrients, FoodEntry, MealType } from "@/types";

interface Props {
  visible: boolean;
  // The entry being edited, or null when the sheet is closed. Kept as a prop (not copied on open)
  // so the parent owns "which entry"; this sheet only owns the draft fields.
  entry: FoodEntry | null;
  onClose: () => void;
  // The caller applies the patch (store.editEntry) and closes the sheet. Changed-by-design fields
  // are always sent; customizations are omitted so a merge preserves them. Micros ride along ONLY
  // after a re-estimate, so a plain edit preserves the entry's micros and a re-estimate refreshes
  // them (editEntry then applies the free/paid gate).
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

  // "The usual" one-tap row is backed by this store; pinning the meal being edited puts it there.
  // Subscribing to `meals` keeps `alreadyUsual` below reactive, so the button flips to its done
  // state the moment a save lands.
  const savedMeals = useSavedMealsStore((s) => s.meals);
  const saveMeal = useSavedMealsStore((s) => s.saveMeal);
  const isSaved = useSavedMealsStore((s) => s.isSaved);

  const [name, setName] = useState("");
  const [nameZh, setNameZh] = useState("");
  const [mealType, setMealType] = useState<MealType>("lunch");
  const [time, setTime] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [fiber, setFiber] = useState("");

  // Re-estimate ("recalculate from the corrected name") state. reMicros stays `undefined` until a
  // re-estimate actually returns; that is what tells handleSave to send a micros patch, so a plain
  // macro edit never disturbs the entry's existing micros.
  const [estimating, setEstimating] = useState(false);
  const [aiError, setAiError] = useState<InvokeFailure | null>(null);
  const [aiMiss, setAiMiss] = useState(false);
  const [reMicros, setReMicros] = useState<EntryMicronutrients | null | undefined>(undefined);

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
    // A fresh item clears any prior re-estimate result and its banners.
    setEstimating(false);
    setAiError(null);
    setAiMiss(false);
    setReMicros(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id, visible]);

  // At least one name, and a time the clock can actually be (parseTimeOfDay guards range + shape).
  const hasName = name.trim().length > 0 || nameZh.trim().length > 0;
  const canSave = hasName && parseTimeOfDay(time) !== null;

  // The name we would pin (mirrors handleSave's en||zh rule). `void savedMeals` documents that the
  // subscription above is what makes this recompute when the row changes.
  void savedMeals;
  const effectiveName = name.trim() || nameZh.trim();
  const alreadyUsual = effectiveName.length > 0 && isSaved(effectiveName);

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
    // Send micros ONLY when a re-estimate ran (reMicros !== undefined). editEntry keys off
    // "micros" in patch: omitting it preserves the entry's existing micros, while sending it (the
    // AI's micros or null) lets the store apply the same free/paid gate as the log path.
    if (reMicros !== undefined) {
      patch.micros = reMicros;
    }
    onSave(patch);
  }

  // Pin the meal being edited into "The usual" quick-add row: saves the current (possibly corrected)
  // name and macros as a reusable one-tap template. Micros are not part of a usual, matching the row
  // itself, which logs macros only. The button's disabled state already blocks a second pin, so this
  // is a no-op when the meal is there; saveMeal dedupes as a further backstop.
  function saveToUsual() {
    if (!hasName || alreadyUsual) return;
    const en = name.trim();
    const zh = nameZh.trim();
    saveMeal({
      name: en || zh,
      nameZh: zh || en,
      calories: toNum(calories),
      protein: toNum(protein),
      carbs: toNum(carbs),
      fat: toNum(fat),
      fiber: toNum(fiber),
      defaultMealType: mealType,
    });
  }

  // Recalculate macros + micros from the corrected name via the logging AI (text path). That path
  // is FREE on every tier, so there is no paywall or quota gate here; the server's per-user daily
  // cap is the only backstop and surfaces as the rate-limited banner. On success we overwrite the
  // macro fields and stash the micros for handleSave; a miss or an outage says so and leaves what
  // the user typed untouched.
  async function reestimate() {
    const en = name.trim();
    const zh = nameZh.trim();
    const query = `${en} ${zh}`.trim().replace(/\s+/g, " ");
    if (!query || estimating) return;
    setEstimating(true);
    setAiError(null);
    setAiMiss(false);
    const outcome = await nlpMealService.parse(query);
    setEstimating(false);
    if (!outcome.ok) {
      // Backend could not answer (an outage or the daily cap): never silently invent numbers.
      setAiError(outcome.error);
      return;
    }
    const best = outcome.meals[0];
    if (!best) {
      // The AI looked and had nothing. A miss spends nothing, so nudge a rename and change nothing.
      setAiMiss(true);
      return;
    }
    setCalories(String(Math.round(best.calories)));
    setProtein(String(Math.round(best.protein)));
    setCarbs(String(Math.round(best.carbs)));
    setFat(String(Math.round(best.fat)));
    setFiber(String(Math.round(best.fiber)));
    // A successful re-estimate always sets reMicros to a defined value (the AI's micros, or null
    // when it returned none): that defined value is what makes handleSave send the micros patch.
    setReMicros(best.micros ?? null);
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

            {/* Recalculate the nutrients from the corrected name. This is the free text logging AI,
                so there's no lock; disabled until there is a name to send, and while it runs. */}
            <Button
              label={
                estimating
                  ? tl("Recalculating...", "重新計算緊...")
                  : tl("Re-estimate from name", "按名稱重新估算")
              }
              icon="sparkles-outline"
              variant="secondary"
              loading={estimating}
              disabled={!hasName}
              onPress={reestimate}
            />

            {/* "Could not ask" (outage or the daily cap), distinct from a miss below. The
                alternative is showing invented macros, and these land in someone's calorie ring. */}
            {aiError && (
              <View
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                className="flex-row items-start gap-2 rounded-xl bg-surface-sunken p-3"
              >
                <Ionicons name="alert-circle-outline" size={18} color={colors.inkMuted} />
                <ScalableText className="flex-1 text-sm leading-5 text-ink">
                  {t(aiError === "rate_limited" ? "log.aiRateLimited" : "log.aiUnavailable")}
                </ScalableText>
              </View>
            )}

            {/* "We asked, the answer was nothing": a miss spends nothing and changes no fields. */}
            {aiMiss && (
              <View
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                className="flex-row items-start gap-2 rounded-xl bg-surface-sunken p-3"
              >
                <Ionicons name="help-circle-outline" size={18} color={colors.inkMuted} />
                <ScalableText className="flex-1 text-sm leading-5 text-ink">
                  {t("log.aiNoResult")}
                </ScalableText>
              </View>
            )}

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

            {/* Pin this meal into "The usual" one-tap row so it can be re-logged without retyping.
                Flips to a done state (driven by the store) once it is in, so a duplicate can't be
                added. Kept below Save so the primary action stays first. */}
            <Button
              label={
                alreadyUsual
                  ? tl("In The usual", "已加入老規矩")
                  : tl("Save to The usual", "加入老規矩")
              }
              icon={alreadyUsual ? "checkmark-circle" : "star-outline"}
              variant="secondary"
              disabled={!hasName || alreadyUsual}
              onPress={saveToUsual}
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
