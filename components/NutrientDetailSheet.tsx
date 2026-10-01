import { useEffect, useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScalableText } from "./ScalableText";
import { TargetStatusLabel } from "./TargetStatusLabel";
import { colors } from "@/constants/theme";
import { NUTRIENT_COLORS, NUTRIENT_LABELS } from "@/constants/reportNutrients";
import { useLocale } from "@/hooks/useLocale";
import { weekdayShort } from "@/utils/formatters";
import {
  countedDays,
  DayNutrients,
  formatNutrientAmount,
  nutrientUnit,
  ReportRow,
  targetStatus,
} from "@/utils/nutritionReport";

interface Props {
  visible: boolean;
  // The tapped nutrient's row from the report: its average, target and days on target.
  row: ReportRow | null;
  // Every day in the chosen range, oldest first.
  days: DayNutrients[];
  today: string;
  onClose: () => void;
}

const CHART_HEIGHT = 140;

// One nutrient day by day against its target: a bar per day in the nutrient's colour, a thin ink line
// at the target, and a readout for the tapped day. Days with nothing logged show a flat grey mark
// rather than a zero bar, and today shows faded while it is still in progress.
export function NutrientDetailSheet({ visible, row, days, today, onClose }: Props) {
  const { tl, locale } = useLocale();
  const [selected, setSelected] = useState<number | null>(null);
  const multiDay = days.length > 1;

  // Open on the latest day that counts, so the readout starts with something real.
  useEffect(() => {
    if (!visible) return;
    const counted = new Set(countedDays(days, today).map((d) => d.dateKey));
    let latest: number | null = null;
    days.forEach((d, i) => {
      if (counted.has(d.dateKey)) latest = i;
    });
    setSelected(latest);
  }, [visible, days, today]);

  if (!row) return null;
  const key = row.key;
  const color = NUTRIENT_COLORS[key];
  const unit = nutrientUnit(key);
  const name = tl(NUTRIENT_LABELS[key].label, NUTRIENT_LABELS[key].labelZh);
  const target = row.target;
  const scaleMax = Math.max(1, (target ?? 0) * 1.25, ...days.filter((d) => d.logged).map((d) => d.values[key]));
  const step = days.length <= 7 ? 1 : days.length <= 14 ? 2 : days.length <= 31 ? 7 : 14;
  const dayLabel = (dateKey: string) =>
    days.length <= 7
      ? weekdayShort(dateKey, locale)
      : `${Number(dateKey.slice(8, 10))}/${Number(dateKey.slice(5, 7))}`;
  const longDate = (dateKey: string) =>
    new Date(`${dateKey}T00:00:00`).toLocaleDateString(locale === "zh-Hant" ? "zh-HK" : "en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

  const picked = selected != null ? days[selected] : null;
  const pickedInProgress = picked != null && multiDay && picked.dateKey === today;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        {/* The backdrop sits behind the sheet rather than around it, so no button holds another. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tl("Close", "關閉")}
          onPress={onClose}
          className="absolute inset-0 bg-black/40"
        />
        <View className="gap-4 rounded-t-3xl bg-surface px-4 pb-10 pt-4">
          <View className="flex-row items-center gap-2">
            <View className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
            <ScalableText className="flex-1 text-lg font-bold text-ink">{name}</ScalableText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tl("Close", "關閉")}
              onPress={onClose}
              className="h-11 w-11 items-center justify-center rounded-full active:opacity-70"
            >
              <Ionicons name="close" size={22} color={colors.inkMuted} />
            </Pressable>
          </View>

          <View>
            <View className="flex-row items-baseline gap-2">
              <ScalableText className="text-3xl font-extrabold text-ink">
                {row.average != null ? formatNutrientAmount(key, row.average) : "0"}
              </ScalableText>
              <ScalableText className="text-sm text-ink-muted">
                {unit} {multiDay ? tl("a day on average", "平均每日") : tl("this day", "呢日")}
              </ScalableText>
            </View>
            <ScalableText className="text-sm text-ink-muted">
              {target != null
                ? tl(`Target ${formatNutrientAmount(key, target)} ${unit}`, `目標 ${formatNutrientAmount(key, target)} ${unit}`) +
                  (row.daysCounted > 1
                    ? tl(
                        ` · on target ${row.daysOnTarget} of ${row.daysCounted} days`,
                        ` · ${row.daysCounted} 日中 ${row.daysOnTarget} 日達標`,
                      )
                    : "")
                : tl("No target set yet", "未設定目標")}
            </ScalableText>
          </View>

          {/* Readout for the tapped day. */}
          <View className="min-h-[44px] flex-row items-center justify-between rounded-xl bg-surface-sunken px-3 py-2">
            {picked ? (
              <>
                <ScalableText className="text-sm font-semibold text-ink">{longDate(picked.dateKey)}</ScalableText>
                <View className="flex-row items-center gap-2">
                  {picked.logged ? (
                    <>
                      <ScalableText className="text-sm text-ink">
                        {formatNutrientAmount(key, picked.values[key])} {unit}
                        {pickedInProgress ? tl(" (so far)", "（暫時）") : ""}
                      </ScalableText>
                      {target != null && !pickedInProgress ? (
                        <TargetStatusLabel status={targetStatus(key, picked.values[key], target)} />
                      ) : null}
                    </>
                  ) : (
                    <ScalableText className="text-sm text-ink-muted">{tl("Nothing logged", "未有記錄")}</ScalableText>
                  )}
                </View>
              </>
            ) : (
              <ScalableText className="text-sm text-ink-muted">
                {tl("Nothing logged in these days yet.", "呢段日子未有記錄。")}
              </ScalableText>
            )}
          </View>

          <View>
            <View style={{ height: CHART_HEIGHT }}>
              {target != null ? (
                <View
                  pointerEvents="none"
                  style={{ position: "absolute", left: 0, right: 0, bottom: (target / scaleMax) * CHART_HEIGHT }}
                >
                  <ScalableText className="mb-0.5 self-end text-[10px] text-ink-faint">{tl("Target", "目標")}</ScalableText>
                  <View style={{ height: 1.5, backgroundColor: colors.ink, opacity: 0.55 }} />
                </View>
              ) : null}
              <View className="flex-row items-end" style={{ height: CHART_HEIGHT }}>
                {days.map((d, i) => {
                  const v = d.values[key];
                  const inProgress = multiDay && d.dateKey === today;
                  const dim = selected != null && selected !== i ? 0.3 : 1;
                  return (
                    <Pressable
                      key={d.dateKey}
                      accessibilityRole="button"
                      accessibilityLabel={`${longDate(d.dateKey)}, ${
                        d.logged ? `${formatNutrientAmount(key, v)} ${unit}` : tl("nothing logged", "未有記錄")
                      }`}
                      onPress={() => setSelected(i)}
                      className="flex-1 items-center justify-end"
                      style={{ height: CHART_HEIGHT }}
                    >
                      {d.logged ? (
                        <View
                          className="rounded-t-md"
                          style={{
                            width: "60%",
                            maxWidth: 22,
                            height: Math.max(3, (v / scaleMax) * CHART_HEIGHT),
                            backgroundColor: color,
                            opacity: (inProgress ? 0.6 : 1) * dim,
                          }}
                        />
                      ) : (
                        <View className="rounded-full bg-surface-sunken" style={{ width: "60%", maxWidth: 22, height: 3 }} />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>
            {/* Labels sit centred on their day but may be wider than its column, so a long range
                stays readable. The last day gets a label only if it would not crowd the one before. */}
            <View className="mt-1.5" style={{ height: 16 }}>
              {days.map((d, i) => {
                const last = i === days.length - 1;
                const show = i % step === 0 || (last && (days.length - 1) % step >= Math.ceil(step / 2));
                if (!show) return null;
                return (
                  <ScalableText
                    key={d.dateKey}
                    numberOfLines={1}
                    className={`text-center text-[11px] ${d.dateKey === today ? "font-bold text-brand" : "text-ink-faint"}`}
                    style={{ position: "absolute", left: `${((i + 0.5) / days.length) * 100}%`, width: 44, marginLeft: -22 }}
                  >
                    {dayLabel(d.dateKey)}
                  </ScalableText>
                );
              })}
            </View>
          </View>

          {multiDay ? (
            <ScalableText className="text-xs text-ink-faint">
              {tl("Tap a bar to see that day.", "撳一條棒，睇返嗰日。")}
            </ScalableText>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
