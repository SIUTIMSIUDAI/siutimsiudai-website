import { useEffect, useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScalableText } from "./ScalableText";
import { Button } from "./Button";
import { colors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";
import {
  DateRange,
  MAX_RANGE_DAYS,
  matchPreset,
  monthGrid,
  normaliseRange,
  presetRange,
  RangePreset,
} from "@/utils/dateRange";

interface Props {
  visible: boolean;
  value: DateRange;
  today: string;
  onApply: (range: DateRange) => void;
  onClose: () => void;
}

const PRESETS: { key: RangePreset; label: string; labelZh: string }[] = [
  { key: "today", label: "Today", labelZh: "今日" },
  { key: "thisWeek", label: "This week", labelZh: "今個星期" },
  { key: "last7", label: "Last 7 days", labelZh: "過去 7 日" },
  { key: "last30", label: "Last 30 days", labelZh: "過去 30 日" },
];

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAYS_ZH = ["日", "一", "二", "三", "四", "五", "六"];

function monthOf(dateKey: string): { year: number; month: number } {
  return { year: Number(dateKey.slice(0, 4)), month: Number(dateKey.slice(5, 7)) - 1 };
}

// Pick what the History report covers: a preset, one day (tap it), or a range (tap a start, then an
// end). Weeks run Sunday to Saturday as elsewhere in the app; future days are off, and a range is kept
// to MAX_RANGE_DAYS. Nothing changes until Apply.
export function RangeCalendarSheet({ visible, value, today, onApply, onClose }: Props) {
  const { tl, locale } = useLocale();
  const [draft, setDraft] = useState<DateRange>(value);
  // Set after the first tap of a new selection, waiting for the second.
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const [view, setView] = useState(monthOf(value.to));

  useEffect(() => {
    if (!visible) return;
    setDraft(value);
    setPendingStart(null);
    setView(monthOf(value.to));
  }, [visible, value]);

  const current = monthOf(today);
  const atCurrentMonth = view.year === current.year && view.month === current.month;
  const activePreset = matchPreset(draft, today);
  const cells = monthGrid(view.year, view.month);
  const monthLabel = new Date(view.year, view.month, 1).toLocaleDateString(
    locale === "zh-Hant" ? "zh-HK" : "en-US",
    { month: "long", year: "numeric" },
  );

  function choosePreset(preset: RangePreset) {
    setDraft(presetRange(preset, today));
    setPendingStart(null);
    setView(monthOf(today));
  }

  function tapDay(dateKey: string) {
    if (pendingStart == null) {
      setDraft({ from: dateKey, to: dateKey });
      setPendingStart(dateKey);
    } else {
      setDraft(normaliseRange(pendingStart, dateKey));
      setPendingStart(null);
    }
  }

  function shiftMonth(delta: number) {
    const d = new Date(view.year, view.month + delta, 1);
    setView({ year: d.getFullYear(), month: d.getMonth() });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        {/* The backdrop sits behind the sheet rather than around it, so no button holds another. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tl("Cancel", "取消")}
          onPress={onClose}
          className="absolute inset-0 bg-black/40"
        />
        <View className="gap-3 rounded-t-3xl bg-surface px-4 pb-10 pt-4">
          <ScalableText className="text-lg font-bold text-ink">{tl("Choose dates", "揀日子")}</ScalableText>

          <View className="flex-row flex-wrap gap-2">
            {PRESETS.map((p) => {
              const active = activePreset === p.key;
              return (
                <Pressable
                  key={p.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => choosePreset(p.key)}
                  className={`min-h-[44px] justify-center rounded-full px-4 active:opacity-80 ${
                    active ? "bg-brand" : "border border-[#E4DCCB] bg-surface"
                  }`}
                >
                  <ScalableText className={`text-sm font-semibold ${active ? "text-white" : "text-ink-muted"}`}>
                    {tl(p.label, p.labelZh)}
                  </ScalableText>
                </Pressable>
              );
            })}
          </View>

          <View className="flex-row items-center justify-between">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tl("Previous month", "上個月")}
              onPress={() => shiftMonth(-1)}
              className="h-11 w-11 items-center justify-center rounded-full active:opacity-70"
            >
              <Ionicons name="chevron-back" size={20} color={colors.ink} />
            </Pressable>
            <ScalableText className="text-base font-semibold text-ink">{monthLabel}</ScalableText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tl("Next month", "下個月")}
              accessibilityState={{ disabled: atCurrentMonth }}
              disabled={atCurrentMonth}
              onPress={() => shiftMonth(1)}
              className={`h-11 w-11 items-center justify-center rounded-full active:opacity-70 ${atCurrentMonth ? "opacity-30" : ""}`}
            >
              <Ionicons name="chevron-forward" size={20} color={colors.ink} />
            </Pressable>
          </View>

          <View>
            <View className="flex-row">
              {(locale === "zh-Hant" ? WEEKDAYS_ZH : WEEKDAYS).map((w, i) => (
                <View key={i} className="flex-1 items-center">
                  <ScalableText className="text-xs text-ink-faint">{w}</ScalableText>
                </View>
              ))}
            </View>
            {Array.from({ length: cells.length / 7 }, (_, row) => (
              <View key={row} className="flex-row">
                {cells.slice(row * 7, row * 7 + 7).map((dateKey, col) => {
                  if (!dateKey) return <View key={col} className="flex-1" style={{ minHeight: 44 }} />;
                  const future = dateKey > today;
                  const inRange = dateKey >= draft.from && dateKey <= draft.to;
                  const end = dateKey === draft.from || dateKey === draft.to;
                  return (
                    <Pressable
                      key={col}
                      accessibilityRole="button"
                      accessibilityLabel={new Date(`${dateKey}T00:00:00`).toLocaleDateString(
                        locale === "zh-Hant" ? "zh-HK" : "en-US",
                        { weekday: "long", month: "long", day: "numeric" },
                      )}
                      accessibilityState={{ selected: inRange, disabled: future }}
                      disabled={future}
                      onPress={() => tapDay(dateKey)}
                      className={`flex-1 items-center justify-center ${inRange && !end ? "bg-surface-sunken" : ""}`}
                      style={{ minHeight: 44 }}
                    >
                      <View
                        className={`h-9 w-9 items-center justify-center rounded-full ${end ? "bg-brand" : ""}`}
                      >
                        <ScalableText
                          className={`text-sm ${
                            end
                              ? "font-bold text-white"
                              : future
                                ? "text-ink-faint opacity-40"
                                : dateKey === today
                                  ? "font-bold text-brand"
                                  : "text-ink"
                          }`}
                        >
                          {Number(dateKey.slice(8, 10))}
                        </ScalableText>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          <ScalableText className="text-xs text-ink-faint">
            {pendingStart
              ? tl(
                  "Tap another day to make a range, or apply this day.",
                  "再揀一日就係一段日子，或者直接睇呢日。",
                )
              : tl(
                  `Tap a day, or a start and an end (up to ${MAX_RANGE_DAYS} days).`,
                  `揀一日，或者揀開始同結束（最多 ${MAX_RANGE_DAYS} 日）。`,
                )}
          </ScalableText>

          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button label={tl("Cancel", "取消")} variant="secondary" onPress={onClose} />
            </View>
            <View className="flex-1">
              <Button
                label={tl("Apply", "套用")}
                onPress={() => {
                  onApply(draft);
                  onClose();
                }}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
