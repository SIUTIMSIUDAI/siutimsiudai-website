import { useMemo, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScalableText } from "./ScalableText";
import { SourcesLink } from "./SourcesLink";
import { colors, macroColors, microColors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useNutritionStore } from "@/stores/nutritionStore";
import { isLimitMicro, sumMicroTotals, TRACKED_MICRO_META, TrackedMicroKey } from "@/utils/micros";
import { NutritionTargets } from "@/types";

interface Props {
  date: string;
  // Effective macros for the day (after 少甜 / 少底 tweaks). Calories aren't charted here.
  macros: { protein: number; carbs: number; fat: number; fiber: number };
  // Full computed target set, or null when the user hasn't set a health profile yet.
  targets: NutritionTargets | null;
}

// The two micro groups the tracker charts, split from the tracked keys so vitamins and minerals read
// as their own tidy blocks rather than one undifferentiated list. Sodium sits with the minerals.
const MINERAL_KEYS: TrackedMicroKey[] = ["iron", "calcium", "potassium", "sodium"];
const VITAMIN_KEYS: TrackedMicroKey[] = ["vitaminC", "vitaminD"];

// One progress row, shared by every nutrient. With a target it fills toward it and shows
// "eaten / target unit"; without one (macros before a profile exists) it shows the macro's
// share of the day's total, matching the old macro drawer so the bars stay familiar.
//
// `limit` marks a ceiling (sodium): the bar fills toward the limit, and past it turns the darker
// egg-tart gold (lighter gold is vitamin C's own bar) with a plain "X mg over". A fact, never a
// telling-off.
function NutrientBar({
  label,
  value,
  target,
  total,
  unit,
  color,
  limit = false,
}: {
  label: string;
  value: number;
  target?: number;
  total?: number;
  unit: string;
  color: string;
  limit?: boolean;
}) {
  const { tl } = useLocale();
  const hasTarget = !!target && target > 0;
  const hasTotal = !!total && total > 0;
  const pct = hasTarget
    ? Math.min(100, Math.round((value / target) * 100))
    : hasTotal
      ? Math.round((value / total) * 100)
      : 0;
  const over = limit && hasTarget ? Math.round(value - target) : 0;
  return (
    <View className="mb-3">
      <View className="mb-1 flex-row items-end justify-between">
        <ScalableText className="text-sm font-semibold text-ink">
          {label}
          {limit ? (
            <ScalableText className="text-xs font-normal text-ink-faint">{tl(" (limit)", "（上限）")}</ScalableText>
          ) : null}
        </ScalableText>
        <ScalableText className="text-sm text-ink-muted">
          {Math.round(value)}
          {hasTarget ? ` / ${Math.round(target)}` : ""} {unit}
        </ScalableText>
      </View>
      {/* With neither a target nor a total to measure against (a micro with no shown target), there
          is no honest bar to draw, so only the amount shows. */}
      {hasTarget || hasTotal ? (
        <View className="h-2 overflow-hidden rounded-full bg-surface-sunken">
          <View
            style={{ width: `${pct}%`, backgroundColor: over > 0 ? colors.accentDark : color }}
            className="h-full rounded-full"
          />
        </View>
      ) : null}
      {over > 0 ? (
        <ScalableText className="mt-1 text-xs font-semibold" style={{ color: colors.accentDark }}>
          {tl(`${over} ${unit} over`, `超出 ${over} ${unit}`)}
        </ScalableText>
      ) : null}
    </View>
  );
}

// A labelled group of bars (Macros / Minerals / Vitamins). The small caps header is the
// grouping cue; `first` drops the top margin so the block hugs the card header.
function Section({ title, first, children }: { title: string; first?: boolean; children: ReactNode }) {
  return (
    <View className={first ? "" : "mt-4"}>
      <ScalableText className="mb-2 text-[11px] font-bold uppercase tracking-widest text-ink-faint">
        {title}
      </ScalableText>
      {children}
    </View>
  );
}

// The "Nutrients" card. Protein, carbs and fat show for everyone, the free plan included (owner,
// 2026-11-17). Fibre, the minerals (sodium among them) and the vitamins sit behind "More nutrients":
// Pro and Max open them, and on Free the button carries a Pro lock and opens the paywall, never any
// figures. The extra rows start closed every time the card appears (owner, 2026-11-17), so the
// state lives in the component, not in a store. Belt-and-braces: micros are also stripped from free
// history at the save path (retainMicrosForTier), so the numbers behind the locked rows are premium
// by construction, not just hidden.
export function NutrientPanel({ date, macros, targets }: Props) {
  const { t, tl } = useLocale();
  const { hasAccess: canViewMore, triggerPaywall } = useFeatureAccess("micro_tracker");
  const [expanded, setExpanded] = useState(false);
  const entries = useNutritionStore((s) => s.logsByDate[date]?.entries);
  const microTotals = useMemo(() => sumMicroTotals(entries ?? []), [entries]);
  // A profile with no targets is someone the reference doesn't cover (under 18, pregnant or
  // breastfeeding): they still see what they've eaten, with no goals.
  const hasProfile = useNutritionStore((s) => s.healthProfile !== null);

  const macroTotal = macros.protein + macros.carbs + macros.fat;
  // Each micro's target comes from utils/nutritionTargets. A micro without a shown target (one whose
  // reference value is unverified, or every micro for someone the reference doesn't cover) still shows
  // what was eaten, just without a goal.
  const microByKey = new Map((targets?.micros ?? []).map((m) => [m.key, m]));
  const open = expanded && canViewMore;

  const renderMicro = (key: TrackedMicroKey) => {
    const meta = TRACKED_MICRO_META[key];
    return (
      <NutrientBar
        key={key}
        label={tl(meta.label, meta.labelZh)}
        value={microTotals[key]}
        target={microByKey.get(key)?.amount}
        unit={meta.unit}
        color={microColors[key]}
        limit={isLimitMicro(key)}
      />
    );
  };

  return (
    <View className="rounded-2xl border border-[#E4DCCB] bg-surface p-4">
      <View className="mb-4 flex-row items-center gap-2">
        <Ionicons name="nutrition-outline" size={18} color={colors.brand} />
        <ScalableText className="text-base font-semibold text-ink">
          {t("dashboard.nutrients")}
        </ScalableText>
      </View>

      <Section title={t("dashboard.macros")} first>
        <NutrientBar
          label={t("dashboard.protein")}
          value={macros.protein}
          target={targets?.protein}
          total={macroTotal}
          unit="g"
          color={macroColors.protein}
        />
        <NutrientBar
          label={t("dashboard.carbs")}
          value={macros.carbs}
          target={targets?.carbs}
          total={macroTotal}
          unit="g"
          color={macroColors.carbs}
        />
        <NutrientBar
          label={t("dashboard.fat")}
          value={macros.fat}
          target={targets?.fat}
          total={macroTotal}
          unit="g"
          color={macroColors.fat}
        />
        {/* Fibre is a subset of carbs, so it stays OUT of macroTotal (adding it would double-count
            the carb share). With a profile it fills toward targets.fiber; without one it reads as a
            share of protein+carbs+fat, matching the other bars. */}
        {open ? (
          <NutrientBar
            label={t("dashboard.fibre")}
            value={macros.fiber}
            target={targets?.fiber}
            total={macroTotal}
            unit="g"
            color={macroColors.fiber}
          />
        ) : null}
      </Section>

      {open ? (
        targets || hasProfile ? (
          <>
            <Section title={tl("Minerals", "礦物質")}>{MINERAL_KEYS.map(renderMicro)}</Section>
            <Section title={tl("Vitamins", "維他命")}>{VITAMIN_KEYS.map(renderMicro)}</Section>
          </>
        ) : (
          // Paid, but no health profile yet: no personalised micro targets to chart against. Nudge
          // setup rather than showing empty vitamin/mineral bars.
          <View className="mt-1 rounded-xl bg-surface-subtle p-3">
            <ScalableText className="text-xs text-ink-muted">
              {tl(
                "Set up your health profile to see your vitamin & mineral targets.",
                "設定健康檔案，即可睇維他命同礦物質目標。",
              )}
            </ScalableText>
          </View>
        )
      ) : null}

      {canViewMore ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={
            expanded
              ? tl("Show fewer nutrients", "收起其他營養")
              : tl("More nutrients: fibre, minerals and vitamins", "睇更多營養：纖維、礦物質同維他命")
          }
          onPress={() => setExpanded((v) => !v)}
          className="mt-1 min-h-[44px] flex-row items-center justify-center gap-1 rounded-xl active:opacity-70"
        >
          <ScalableText className="text-sm font-semibold text-brand">
            {expanded ? tl("Show less", "收起") : tl("More nutrients", "睇更多營養")}
          </ScalableText>
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.brand} />
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tl(
            "More nutrients: fibre, sodium, vitamins and minerals. Unlock with Pro",
            "睇更多營養：纖維、鈉、維他命同礦物質。升級 Pro 解鎖",
          )}
          onPress={triggerPaywall}
          className="mt-1 min-h-[44px] flex-row items-center justify-center gap-2 rounded-xl active:opacity-70"
        >
          <ScalableText className="text-sm font-semibold text-ink-muted">
            {tl("More nutrients", "睇更多營養")}
          </ScalableText>
          <View
            className="flex-row items-center gap-1 rounded-full px-2 py-0.5"
            style={{ backgroundColor: "#F5EBE0" }}
          >
            <Ionicons name="lock-closed" size={11} color={colors.brand} />
            <ScalableText className="text-xs font-bold" style={{ color: colors.brand }}>
              {tl("Pro", "Pro")}
            </ScalableText>
          </View>
        </Pressable>
      )}

      {/* The recommended daily amounts charted above are published figures, not ours. The dashboard
          already carries the caveat right under the ring, so this is the bare link. */}
      <View className="mt-2 border-t border-[#EFE7D8] pt-1">
        <SourcesLink />
      </View>
    </View>
  );
}
