import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScalableText } from "./ScalableText";
import { Button } from "./Button";
import { colors } from "@/constants/theme";
import { PANTRY_UNIT_LABELS } from "@/constants/pantryUnits";
import { useLocale } from "@/hooks/useLocale";
import { useAppStore } from "@/stores/appStore";
import { usePantryStore } from "@/stores/pantryStore";
import { formatPantryAmount } from "@/utils/pantryUnits";
import {
  AmountDecision,
  AmountRow,
  ChoiceAnswer,
  DeductionPlan,
  DeductionRow,
  defaultDecision,
  pantryUpdateFor,
  PantryUpdate,
  PantryUseLine,
  planPantryDeduction,
  RowDecision,
} from "@/utils/pantryDeduction";
import { PantryUnit } from "@/types";

interface Props {
  visible: boolean;
  // The dish just cooked, at the servings shown.
  ingredients: PantryUseLine[];
  onClose: () => void;
  // Runs once the sheet has fully closed, whichever way it was closed (cook mode leaves the screen here).
  afterClose?: () => void;
}

const INPUT = "h-11 w-20 rounded-xl border border-[#E4DCCB] bg-surface px-3 text-base text-ink";
const NO_PLAN: DeductionPlan = { rows: [], notInPantry: 0 };

// After cooking: what the dish took out of the pantry, ready to confirm. Amounts the app can work out
// are pre-filled and can be changed or unticked; packages and items without an amount are a quick
// choice that defaults to leaving them alone. Running out marks the item out of stock but keeps it,
// so it can go on the next shopping list.
export function PantryUpdateSheet({ visible, ingredients, onClose, afterClose }: Props) {
  const { t, tl, locale } = useLocale();
  const system = useAppStore((s) => s.measurementSystem);
  const applyUpdates = usePantryStore((s) => s.applyUpdates);
  const { height } = useWindowDimensions();

  // The plan is taken once, as the sheet opens, and kept while it slides away, so updating the
  // pantry never reshuffles the rows on screen.
  const [captured, setCaptured] = useState(false);
  const [plan, setPlan] = useState<DeductionPlan>(NO_PLAN);
  const [decisions, setDecisions] = useState<Record<string, RowDecision>>({});
  const [amountText, setAmountText] = useState<Record<string, string>>({});
  if (visible && !captured) {
    const next = planPantryDeduction(ingredients, usePantryStore.getState().items);
    setCaptured(true);
    setPlan(next);
    setDecisions(Object.fromEntries(next.rows.map((row) => [row.item.id, defaultDecision(row)])));
    setAmountText(
      Object.fromEntries(
        next.rows.flatMap((row) => (row.kind === "amount" ? [[row.item.id, String(row.used)]] : [])),
      ),
    );
  }
  if (!visible && captured) setCaptured(false);

  // iOS won't let the screen underneath go away while a modal is still animating out, and Modal only
  // reports the end of that (onDismiss) on iOS. Same approach as ActionSheet.
  const pending = useRef<(() => void) | null>(null);
  function runPending() {
    const action = pending.current;
    pending.current = null;
    action?.();
  }

  // One close per opening: a quick double tap must not take the amounts off twice, or leave cook
  // mode and then the recipe behind it too.
  const closing = useRef(false);
  useEffect(() => {
    if (visible) closing.current = false;
  }, [visible]);

  function close() {
    if (closing.current) return;
    closing.current = true;
    onClose();
    if (!afterClose) return;
    if (Platform.OS !== "ios") {
      afterClose();
      return;
    }
    pending.current = afterClose;
    setTimeout(runPending, 700);
  }

  const decisionOf = (row: DeductionRow) => decisions[row.item.id] ?? defaultDecision(row);

  function update() {
    if (closing.current) return;
    const updates: PantryUpdate[] = [];
    for (const row of plan.rows) {
      const change = pantryUpdateFor(row, decisionOf(row));
      if (change) updates.push(change);
    }
    if (updates.length > 0) applyUpdates(updates);
    close();
  }

  function setAmount(id: string, text: string) {
    setAmountText((prev) => ({ ...prev, [id]: text }));
    setDecisions((prev) => {
      const current = prev[id];
      if (current?.kind !== "amount") return prev;
      return { ...prev, [id]: { ...current, used: Number.parseFloat(text) } };
    });
  }

  function toggleInclude(id: string) {
    setDecisions((prev) => {
      const current = prev[id];
      if (current?.kind !== "amount") return prev;
      return { ...prev, [id]: { ...current, include: !current.include } };
    });
  }

  function choose(id: string, answer: ChoiceAnswer) {
    setDecisions((prev) => ({ ...prev, [id]: { kind: "choice", answer } }));
  }

  function unitWord(unit: PantryUnit, count: number): string {
    const label = PANTRY_UNIT_LABELS[unit] ?? PANTRY_UNIT_LABELS.piece;
    if (locale === "zh-Hant") return label.zh;
    return count === 1 ? label.en : label.enPlural;
  }

  // What an amount row comes to once applied: the amount left, none left, or no change at all.
  function outcome(row: AmountRow, decision: AmountDecision): { label: string; runsOut: boolean } {
    const change = pantryUpdateFor(row, decision);
    if (!change) return { label: t("pantryUpdate.noChange"), runsOut: false };
    if (!change.inStock) return { label: t("pantryUpdate.noneLeft"), runsOut: true };
    const left =
      formatPantryAmount(change.quantity, row.item.unit, system, locale) ?? String(change.quantity);
    return { label: t("pantryUpdate.left", { amount: left }), runsOut: false };
  }

  const empty = captured && plan.rows.length === 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
      onDismiss={runPending}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-end"
      >
        {/* The backdrop sits behind the sheet rather than around it, so no button holds another. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("pantryUpdate.later")}
          onPress={close}
          className="absolute inset-0 bg-black/40"
        />
        <View className="gap-3 rounded-t-3xl bg-surface px-4 pb-8 pt-3">
          <View className="h-1.5 w-10 self-center rounded-full bg-surface-sunken" />
          <View className="flex-row items-center justify-between">
            <ScalableText className="flex-1 text-xl font-bold text-ink">
              {t("pantryUpdate.title")}
            </ScalableText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("pantryUpdate.later")}
              onPress={close}
              className="h-11 w-11 items-center justify-center"
            >
              <Ionicons name="close" size={24} color={colors.inkMuted} />
            </Pressable>
          </View>

          {empty ? (
            <>
              <ScalableText className="text-base text-ink-muted">{t("pantryUpdate.nothing")}</ScalableText>
              <Button label={t("pantryUpdate.ok")} onPress={close} />
            </>
          ) : (
            <>
              <ScalableText className="text-sm text-ink-muted">{t("pantryUpdate.intro")}</ScalableText>
              <ScrollView
                style={{ maxHeight: height * 0.5 }}
                contentContainerStyle={{ gap: 8 }}
                keyboardShouldPersistTaps="handled"
              >
                {plan.rows.map((row) => {
                  const it = row.item;
                  const name = tl(it.name, it.nameZh);
                  const have = formatPantryAmount(it.quantity, it.unit, system, locale);
                  const decision = decisionOf(row);
                  return (
                    <View
                      key={it.id}
                      className="gap-2 rounded-2xl border border-[#E4DCCB] bg-surface p-3"
                    >
                      <View className="flex-row items-center gap-2">
                        {decision.kind === "amount" ? (
                          <Pressable
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: decision.include }}
                            accessibilityLabel={name}
                            onPress={() => toggleInclude(it.id)}
                            className="-m-2 h-11 w-11 items-center justify-center"
                          >
                            <Ionicons
                              name={decision.include ? "checkbox" : "square-outline"}
                              size={24}
                              color={decision.include ? colors.brand : colors.inkFaint}
                            />
                          </Pressable>
                        ) : null}
                        <ScalableText className="flex-1 text-base font-semibold text-ink">
                          {name}
                        </ScalableText>
                        <ScalableText className="text-xs text-ink-muted">
                          {have ? t("pantryUpdate.youHave", { amount: have }) : t("pantry.inStock")}
                        </ScalableText>
                      </View>

                      {row.kind === "amount" && decision.kind === "amount" ? (
                        <AmountLine
                          include={decision.include}
                          text={amountText[it.id] ?? ""}
                          unit={unitWord(it.unit, decision.used)}
                          usedLabel={t("pantryUpdate.used")}
                          outcome={outcome(row, decision)}
                          onChange={(text) => setAmount(it.id, text)}
                        />
                      ) : row.kind === "choice" && decision.kind === "choice" ? (
                        <ChoiceLine
                          name={name}
                          separator={locale === "zh-Hant" ? "：" : ": "}
                          options={[
                            ["keep", t("pantryUpdate.keep")],
                            ...(row.canUseOne
                              ? ([["useOne", t("pantryUpdate.useOne", { unit: unitWord(it.unit, 1) })]] as const)
                              : []),
                            ["useUp", t("pantryUpdate.useUp")],
                          ]}
                          selected={decision.answer}
                          onChoose={(answer) => choose(it.id, answer)}
                        />
                      ) : null}
                    </View>
                  );
                })}
              </ScrollView>

              {plan.notInPantry > 0 ? (
                <ScalableText className="text-xs text-ink-muted">
                  {plan.notInPantry === 1
                    ? t("pantryUpdate.otherOne")
                    : t("pantryUpdate.otherMany", { count: plan.notInPantry })}
                </ScalableText>
              ) : null}

              <View className="gap-2">
                <Button label={t("pantryUpdate.confirm")} icon="checkmark" onPress={update} />
                <Button label={t("pantryUpdate.later")} variant="ghost" onPress={close} />
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function AmountLine({
  include,
  text,
  unit,
  usedLabel,
  outcome,
  onChange,
}: {
  include: boolean;
  text: string;
  unit: string;
  usedLabel: string;
  outcome: { label: string; runsOut: boolean };
  onChange: (text: string) => void;
}) {
  return (
    <View className={`flex-row flex-wrap items-center gap-2 ${include ? "" : "opacity-50"}`}>
      <ScalableText className="text-sm text-ink-muted">{usedLabel}</ScalableText>
      <TextInput
        className={INPUT}
        value={text}
        onChangeText={onChange}
        editable={include}
        keyboardType="decimal-pad"
        accessibilityLabel={`${usedLabel} (${unit})`}
        selectTextOnFocus
      />
      <ScalableText className="text-sm text-ink-muted">{unit}</ScalableText>
      <View className="flex-1 flex-row items-center justify-end gap-1">
        <Ionicons
          name={outcome.runsOut ? "alert-circle" : "arrow-forward"}
          size={16}
          color={outcome.runsOut ? colors.accent : colors.inkFaint}
        />
        <ScalableText className="text-sm font-semibold text-ink">{outcome.label}</ScalableText>
      </View>
    </View>
  );
}

function ChoiceLine({
  name,
  separator,
  options,
  selected,
  onChoose,
}: {
  name: string;
  separator: string;
  options: ReadonlyArray<readonly [ChoiceAnswer, string]>;
  selected: ChoiceAnswer;
  onChoose: (answer: ChoiceAnswer) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map(([answer, label]) => {
        const on = selected === answer;
        return (
          <Pressable
            key={answer}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${name}${separator}${label}`}
            onPress={() => onChoose(answer)}
            className={`min-h-[44px] items-center justify-center rounded-xl px-3 ${
              on ? "bg-ink" : "bg-surface-sunken"
            }`}
          >
            <ScalableText className={`text-sm font-semibold ${on ? "text-white" : "text-ink-muted"}`}>
              {label}
            </ScalableText>
          </Pressable>
        );
      })}
    </View>
  );
}
