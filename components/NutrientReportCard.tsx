import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScalableText } from "./ScalableText";
import { TargetStatusLabel } from "./TargetStatusLabel";
import { colors } from "@/constants/theme";
import { NUTRIENT_COLORS, NUTRIENT_LABELS } from "@/constants/reportNutrients";
import { useLocale } from "@/hooks/useLocale";
import { isLimitMicro } from "@/utils/micros";
import {
  biggestGaps,
  formatNutrientAmount,
  nutrientUnit,
  NutrientReport,
  ReportNutrientKey,
  ReportRow,
} from "@/utils/nutritionReport";

interface Props {
  report: NutrientReport;
  // "Last 7 days", "Today", "Sep 22 to Sep 28" and so on, already localised.
  rangeLabel: string;
  // False when there is no health profile, so no targets to compare with.
  hasTargets: boolean;
  onPickRange: () => void;
  onOpenNutrient: (key: ReportNutrientKey) => void;
}

// The meter runs to 150% of target, so the target mark sits two thirds along and going over shows.
const METER_MAX = 150;

function Meter({ percent, color }: { percent: number; color: string }) {
  const fill = Math.min(percent, METER_MAX) / METER_MAX;
  return (
    <View className="flex-1 justify-center" style={{ height: 14 }}>
      <View className="h-2 overflow-hidden rounded-full bg-surface-sunken">
        <View className="h-2 rounded-full" style={{ width: `${fill * 100}%`, backgroundColor: color }} />
      </View>
      {/* The target mark: a thin ink tick at 100%. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: `${(100 / METER_MAX) * 100}%`,
          top: 0,
          bottom: 0,
          width: 2,
          marginLeft: -1,
          backgroundColor: colors.ink,
        }}
      />
    </View>
  );
}

// How a range of days compared with the user's targets: a summary line, then one row per nutrient
// with the biggest gap first. Tapping a row opens that nutrient's day-by-day chart.
export function NutrientReportCard({ report, rangeLabel, hasTargets, onPickRange, onOpenNutrient }: Props) {
  const { tl, locale } = useLocale();
  const name = (key: ReportNutrientKey) => tl(NUTRIENT_LABELS[key].label, NUTRIENT_LABELS[key].labelZh);
  const n = report.daysCounted;

  let summary: string;
  if (n === 0) {
    summary = tl("Nothing logged in these days yet.", "呢段日子未有記錄。");
  } else {
    const logged = tl(`${n} ${n === 1 ? "day" : "days"} logged.`, `記錄咗 ${n} 日。`);
    // English puts a space between sentences; Chinese runs straight on after 。
    const sep = locale === "zh-Hant" ? "" : " ";
    const gaps = biggestGaps(report);
    if (!hasTargets) summary = logged;
    else if (gaps.length === 0) summary = logged + sep + tl("On target on average for everything.", "平均全部達標。");
    else if (gaps.length === 1) summary = logged + sep + tl(`Biggest gap: ${name(gaps[0])}.`, `最大差距：${name(gaps[0])}。`);
    else
      summary =
        logged +
        sep +
        tl(`Biggest gaps: ${name(gaps[0])} and ${name(gaps[1])}.`, `最大差距：${name(gaps[0])}同${name(gaps[1])}。`);
  }

  return (
    <View className="gap-3 rounded-2xl border border-[#E4DCCB] bg-surface p-4">
      <View className="flex-row items-center justify-between gap-2">
        <ScalableText className="text-base font-semibold text-ink">{tl("How you did", "你食得點")}</ScalableText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tl(`Change dates, now ${rangeLabel}`, `更改日子，而家係${rangeLabel}`)}
          onPress={onPickRange}
          className="min-h-[44px] flex-row items-center gap-1.5 rounded-full border border-[#E4DCCB] px-3 active:opacity-70"
        >
          <Ionicons name="calendar-outline" size={16} color={colors.inkMuted} />
          <ScalableText className="text-sm font-semibold text-ink">{rangeLabel}</ScalableText>
          <Ionicons name="chevron-down" size={14} color={colors.inkMuted} />
        </Pressable>
      </View>

      <ScalableText className="text-sm text-ink-muted">{summary}</ScalableText>
      {!hasTargets && n > 0 ? (
        <ScalableText className="text-xs text-ink-faint">
          {tl(
            "Set your nutrition needs on Profile to compare with targets.",
            "喺「我的」設定營養需求，就可以同目標比較。",
          )}
        </ScalableText>
      ) : null}

      {n > 0 ? (
        <View>
          {report.rows.map((row) => (
            <ReportRowView key={row.key} row={row} name={name(row.key)} onPress={() => onOpenNutrient(row.key)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ReportRowView({ row, name, onPress }: { row: ReportRow; name: string; onPress: () => void }) {
  const { tl } = useLocale();
  const unit = nutrientUnit(row.key);
  const average = row.average != null ? formatNutrientAmount(row.key, row.average) : "0";
  const amount =
    row.target != null
      ? `${average} / ${formatNutrientAmount(row.key, row.target)} ${unit}`
      : `${average} ${unit}`;
  // Sodium is a ceiling: its "on" days are the days within the limit, and it says so.
  const limit = isLimitMicro(row.key);
  // A single day needs no "1 of 1 days": the status says it.
  const days =
    row.target != null && row.daysCounted > 1
      ? limit
        ? tl(`${row.daysOnTarget} of ${row.daysCounted} days within`, `${row.daysCounted} 日中 ${row.daysOnTarget} 日冇超標`)
        : tl(`${row.daysOnTarget} of ${row.daysCounted} days`, `${row.daysCounted} 日中 ${row.daysOnTarget} 日達標`)
      : null;
  const statusWord =
    row.status === "on"
      ? limit
        ? tl("within limit", "冇超標")
        : tl("on target", "達標")
      : row.status === "over"
        ? tl("over", "超標")
        : row.status === "under"
          ? tl("under", "唔夠")
          : "";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[name, amount, statusWord, days].filter(Boolean).join(", ")}
      onPress={onPress}
      className="min-h-[44px] gap-2 border-t border-[#E4DCCB] py-3 active:opacity-70"
    >
      <View className="flex-row items-center gap-2">
        <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: NUTRIENT_COLORS[row.key] }} />
        <ScalableText className="flex-1 text-sm font-semibold text-ink">{name}</ScalableText>
        <ScalableText className="text-sm text-ink-muted">{amount}</ScalableText>
        <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
      </View>
      {row.percent != null ? (
        <View className="flex-row items-center gap-3">
          <Meter percent={row.percent} color={NUTRIENT_COLORS[row.key]} />
          {/* A steady width here keeps every meter the same length, so the target marks line up. */}
          <View className="flex-row items-center justify-end gap-3" style={{ minWidth: 150 }}>
            <TargetStatusLabel status={row.status} limit={limit} />
            {days ? <ScalableText className="text-xs text-ink-faint">{days}</ScalableText> : null}
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}
