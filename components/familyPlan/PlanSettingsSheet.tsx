import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScalableText } from "@/components/ScalableText";
import { colors } from "@/constants/theme";
import { PLAN_SLOTS, PORTION_SIZES } from "@/constants/portionSizes";
import { useLocale } from "@/hooks/useLocale";
import type { MealType } from "@/types";
import type { FamilyPlanSnapshot, HelperLanguage, MyPlanSettings, PortionSize } from "@/types/familyPlan";
import { HELPER_LANGUAGE_NAMES } from "@/components/helper/helperText";
import { PlanSheet } from "./PlanSheet";
import { choiceLabel, memberName } from "./labels";

export interface PlanSettingsChanges {
  slots: MealType[];
  me: MyPlanSettings;
  /** Other members' usual sizes, as the planner set them. */
  sizes: Record<string, PortionSize>;
  /** Who is the family's helper, and in which language helper mode speaks to her. */
  helpers: Record<string, { isHelper: boolean; language: HelperLanguage }>;
}

interface Props {
  visible: boolean;
  snapshot: FamilyPlanSnapshot;
  busy: boolean;
  error: string | null;
  onSave: (changes: PlanSettingsChanges) => void;
  onClose: () => void;
}

const MAX_EXCLUSIONS = 40;
const HELPER_LANGUAGES: HelperLanguage[] = ["en", "fil", "id"];
const MAX_TERM = 40;

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      className={`min-h-[40px] items-center justify-center rounded-full border px-4 ${
        selected ? "border-brand bg-brand" : "border-[#E4DCCB] bg-surface"
      } active:opacity-80`}
    >
      <ScalableText className={`text-sm font-semibold ${selected ? "text-white" : "text-ink"}`}>{label}</ScalableText>
    </Pressable>
  );
}

/**
 * The plan's settings. The planner picks which meals to plan (remembered for next week) and
 * everyone's usual portion; each member sets their own usual portion and the foods they don't eat,
 * a list only they can see.
 */
export function PlanSettingsSheet({ visible, snapshot, busy, error, onSave, onClose }: Props) {
  const { t } = useLocale();
  const planner = snapshot.role === "manager" || snapshot.role === null;
  const others = snapshot.members.filter((m) => m.userId !== snapshot.myUserId);

  const [slots, setSlots] = useState<MealType[]>(snapshot.slots);
  const [mySize, setMySize] = useState<PortionSize>(snapshot.me.defaultSize);
  const [exclusions, setExclusions] = useState<string[]>(snapshot.me.exclusions);
  const [sizes, setSizes] = useState<Record<string, PortionSize>>({});
  const [helpers, setHelpers] = useState<PlanSettingsChanges["helpers"]>({});
  const [draft, setDraft] = useState("");

  // Start from what's saved every time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setSlots(snapshot.slots);
    setMySize(snapshot.me.defaultSize);
    setExclusions(snapshot.me.exclusions);
    setSizes(Object.fromEntries(snapshot.members.map((m) => [m.userId, m.defaultSize])));
    setHelpers(Object.fromEntries(snapshot.members.map((m) => [m.userId, { isHelper: m.isHelper, language: m.helperLanguage }])));
    setDraft("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const toggleSlot = (slot: MealType) =>
    setSlots((current) => {
      if (!current.includes(slot)) return PLAN_SLOTS.filter((s) => s === slot || current.includes(s));
      return current.length > 1 ? current.filter((s) => s !== slot) : current;
    });

  const addExclusion = () => {
    const term = draft.trim().slice(0, MAX_TERM);
    setDraft("");
    if (!term || exclusions.length >= MAX_EXCLUSIONS) return;
    if (exclusions.some((e) => e.toLowerCase() === term.toLowerCase())) return;
    setExclusions([...exclusions, term]);
  };

  return (
    <PlanSheet
      visible={visible}
      title={t("familyPlan.settingsTitle")}
      onClose={onClose}
      footer={
        <View className="mt-3 gap-2">
          {error && <ScalableText className="text-sm text-[#B4442E]">{error}</ScalableText>}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.save")}
            disabled={busy}
            onPress={() => onSave({ slots, me: { ...snapshot.me, defaultSize: mySize, exclusions }, sizes, helpers })}
            className="min-h-[48px] flex-row items-center justify-center gap-2 rounded-2xl bg-brand active:opacity-80"
          >
            {busy && <ActivityIndicator size="small" color={colors.white} />}
            <ScalableText className="text-base font-bold text-white">{t("common.save")}</ScalableText>
          </Pressable>
        </View>
      }
    >
      <View className="gap-5 pb-2">
        {planner && (
          <View className="gap-2">
            <ScalableText className="text-sm font-semibold text-ink">{t("familyPlan.slotsLabel")}</ScalableText>
            <View className="flex-row flex-wrap gap-2">
              {PLAN_SLOTS.map((slot) => (
                <Chip key={slot} label={t(`mealType.${slot}`)} selected={slots.includes(slot)} onPress={() => toggleSlot(slot)} />
              ))}
            </View>
            <ScalableText className="text-xs text-ink-faint">
              {slots.length === 1 ? t("familyPlan.slotsMin") : t("familyPlan.slotsHint")}
            </ScalableText>
          </View>
        )}

        <View className="gap-2">
          <ScalableText className="text-sm font-semibold text-ink">{t("familyPlan.mySizeLabel")}</ScalableText>
          <View className="flex-row flex-wrap gap-2">
            {PORTION_SIZES.map((size) => (
              <Chip key={size} label={choiceLabel(t, size, true)} selected={mySize === size} onPress={() => setMySize(size)} />
            ))}
          </View>
        </View>

        <View className="gap-2">
          <ScalableText className="text-sm font-semibold text-ink">{t("familyPlan.exclusionsLabel")}</ScalableText>
          <ScalableText className="text-xs text-ink-muted">{t("familyPlan.exclusionsHint")}</ScalableText>
          {exclusions.length > 0 && (
            <View className="flex-row flex-wrap gap-2">
              {exclusions.map((e) => (
                <Pressable
                  key={e}
                  accessibilityRole="button"
                  accessibilityLabel={t("familyPlan.removeExclusion", { food: e })}
                  onPress={() => setExclusions(exclusions.filter((x) => x !== e))}
                  className="min-h-[36px] flex-row items-center gap-1 rounded-full bg-surface-sunken px-3 active:opacity-70"
                >
                  <ScalableText className="text-sm text-ink">{e}</ScalableText>
                  <Ionicons name="close" size={14} color={colors.inkMuted} />
                </Pressable>
              ))}
            </View>
          )}
          <View className="flex-row items-center gap-2">
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={addExclusion}
              placeholder={t("familyPlan.exclusionPlaceholder")}
              placeholderTextColor={colors.inkFaint}
              maxLength={MAX_TERM}
              returnKeyType="done"
              accessibilityLabel={t("familyPlan.exclusionsLabel")}
              className="min-h-[44px] flex-1 rounded-xl border border-[#E4DCCB] bg-surface px-3 text-base text-ink"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common.add")}
              onPress={addExclusion}
              className="min-h-[44px] items-center justify-center rounded-xl border border-[#E4DCCB] px-4 active:opacity-70"
            >
              <ScalableText className="text-sm font-semibold text-brand">{t("common.add")}</ScalableText>
            </Pressable>
          </View>
        </View>

        {planner && others.length > 0 && (
          <View className="gap-3">
            <ScalableText className="text-sm font-semibold text-ink">{t("familyPlan.membersLabel")}</ScalableText>
            {others.map((m) => {
              const helper = helpers[m.userId] ?? { isHelper: m.isHelper, language: m.helperLanguage };
              const setHelper = (next: Partial<typeof helper>) => setHelpers({ ...helpers, [m.userId]: { ...helper, ...next } });
              return (
                <View key={m.userId} className="gap-1.5">
                  <ScalableText className="text-sm text-ink-muted">{memberName(t, m, snapshot.myUserId)}</ScalableText>
                  <View className="flex-row flex-wrap gap-2">
                    {PORTION_SIZES.map((size) => (
                      <Chip
                        key={size}
                        label={choiceLabel(t, size, true)}
                        selected={(sizes[m.userId] ?? m.defaultSize) === size}
                        onPress={() => setSizes({ ...sizes, [m.userId]: size })}
                      />
                    ))}
                  </View>
                  <View className="flex-row flex-wrap gap-2">
                    <Chip label={t("familyPlan.helperToggle")} selected={helper.isHelper} onPress={() => setHelper({ isHelper: !helper.isHelper })} />
                  </View>
                  {helper.isHelper && (
                    <View className="gap-1.5">
                      <ScalableText className="text-xs text-ink-muted">{t("familyPlan.helperLanguage")}</ScalableText>
                      <View className="flex-row flex-wrap gap-2">
                        {HELPER_LANGUAGES.map((l) => (
                          <Chip key={l} label={HELPER_LANGUAGE_NAMES[l]} selected={helper.language === l} onPress={() => setHelper({ language: l })} />
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
            <ScalableText className="text-xs leading-5 text-ink-muted">{t("familyPlan.helperHint")}</ScalableText>
          </View>
        )}
      </View>
    </PlanSheet>
  );
}
