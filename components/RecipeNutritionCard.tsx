import { useMemo } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScalableText } from "./ScalableText";
import { SourcesLink } from "./SourcesLink";
import { colors, macroColors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useRecipeNutrition } from "@/hooks/useRecipeNutrition";
import { useNutritionStore } from "@/stores/nutritionStore";
import { computeNutritionTargets } from "@/utils/nutritionTargets";
import { todayKey } from "@/utils/formatters";
import { isLimitMicro, TRACKED_MICRO_KEYS, TRACKED_MICRO_META } from "@/utils/micros";
import {
  formatAmount,
  formatShare,
  servingVerdict,
  shareOfTarget,
} from "@/utils/recipeNutrition";
import type { Recipe, RecipeNutrition } from "@/types";

interface Props {
  recipe: Recipe;
}

// Today's eaten calories on the bar, quieter than the dish segment that sits after it.
const EATEN_GREY = "#CDBFA8";
// Badge tints for the two verdicts: jade when it fits, the calorie ring's over-target gold when not.
const FITS_TINT = "#E3F4EA";
const OVER_TINT = "#FCEBD3";

/**
 * One serving at a glance (owner, 2026-10-19, mockup C): does it fit what's left of today's calories,
 * and what does it give you? Calories, protein, carbs and fat are free (owner, 2026-11-17); fibre and
 * the vitamins and minerals, sodium among them, are Pro and Max, locked behind a panel on Free. Every
 * figure is an estimate, said so, with the sources link.
 */
export function RecipeNutritionCard({ recipe }: Props) {
  const { tl } = useLocale();
  const { status, nutrition, retry } = useRecipeNutrition(recipe);

  return (
    <View className="gap-3 rounded-2xl border border-[#E4DCCB] bg-surface p-4">
      {status === "ready" && nutrition ? (
        <ServingNutrition nutrition={nutrition} healthy={!!recipe.healthyApplied} />
      ) : status === "failed" ? (
        <View className="gap-2">
          <ScalableText className="text-sm text-ink-muted">
            {tl("Couldn't estimate the nutrition. Please try again.", "暫時未能估算營養，請稍後再試。")}
          </ScalableText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tl("Try again", "再試一次")}
            onPress={retry}
            className="min-h-[44px] items-center justify-center self-start rounded-xl border border-[#E4DCCB] px-4 active:opacity-70"
          >
            <ScalableText className="text-sm font-semibold text-brand">{tl("Try again", "再試一次")}</ScalableText>
          </Pressable>
        </View>
      ) : (
        <View className="flex-row items-center gap-2 py-1">
          <ActivityIndicator color={colors.inkMuted} />
          <ScalableText className="text-sm text-ink-muted">
            {tl("Estimating nutrition per serving…", "估算緊每份營養…")}
          </ScalableText>
        </View>
      )}
    </View>
  );
}

function ServingNutrition({ nutrition, healthy }: { nutrition: RecipeNutrition; healthy: boolean }) {
  const { t, tl } = useLocale();
  const { hasAccess: canViewMore, triggerPaywall } = useFeatureAccess("micro_tracker");
  const today = todayKey();
  const eaten = Math.round(useNutritionStore((s) => s.totalsForDate(today).calories));
  const target = useNutritionStore((s) => s.dailyCalorieTarget);
  const profile = useNutritionStore((s) => s.healthProfile);
  const targets = useMemo(() => (profile ? computeNutritionTargets(profile) : null), [profile]);

  const kcal = Math.round(nutrition.perServing.calories);
  // No calorie target (under 18, pregnant or breastfeeding): no "fits today" verdict, just the numbers.
  const v = target === null ? null : servingVerdict(kcal, eaten, target);

  // Protein, carbs and fat for everyone; fibre joins them on Pro and Max.
  const macros = [
    { key: "protein", label: t("dashboard.protein"), color: macroColors.protein },
    { key: "carbs", label: t("dashboard.carbs"), color: macroColors.carbs },
    { key: "fat", label: t("dashboard.fat"), color: macroColors.fat },
    ...(canViewMore ? [{ key: "fiber", label: t("dashboard.fibre"), color: macroColors.fiber } as const] : []),
  ] as const;
  const microTarget = (key: string) => targets?.micros.find((m) => m.key === key)?.amount;

  return (
    <>
      {v ? (
        <View
          className="self-start rounded-full px-3 py-1"
          style={{ backgroundColor: v.fits ? FITS_TINT : OVER_TINT }}
        >
          <ScalableText className="text-sm font-bold" style={{ color: v.fits ? colors.jade : colors.accentDark }}>
            {v.fits ? tl("✓ Fits today", "✓ 食得落") : tl(`⚠ ${v.over} kcal over today`, `⚠ 會超出今日 ${v.over} kcal`)}
          </ScalableText>
        </View>
      ) : null}

      <View className="gap-1">
        <View className="flex-row flex-wrap items-baseline gap-1.5">
          <ScalableText className="text-3xl font-extrabold text-ink">{kcal}</ScalableText>
          <ScalableText className="text-sm font-semibold text-ink-muted">{tl("kcal per serving", "kcal 每份")}</ScalableText>
          {/* While 整健康啲 is on, these are the lighter ingredients' numbers; say so beside them
              (owner, 2026-10-19), in the words the 健康版 button and banner already use. */}
          {healthy ? (
            <View
              className="ml-1 flex-row items-center gap-1 self-center rounded-full px-2 py-0.5"
              style={{ backgroundColor: FITS_TINT }}
            >
              <Ionicons name="leaf" size={12} color={colors.jade} />
              <ScalableText className="text-xs font-bold" style={{ color: colors.jade }}>
                {tl("Healthy mode", "健康版")}
              </ScalableText>
            </View>
          ) : null}
        </View>
        {v ? (
          <ScalableText className="text-sm text-ink-muted">
            {v.fits
              ? tl(`${v.left} kcal left today, ${v.after} after this`, `今日仲有 ${v.left} kcal 位，食完仲剩 ${v.after} kcal`)
              : v.left <= 0
                ? tl("Today's calories are used up", "今日已經用晒 kcal 位")
                : tl(`${v.left} kcal left today, this is ${kcal}`, `今日仲有 ${v.left} kcal 位，呢份 ${kcal} kcal`)}
          </ScalableText>
        ) : null}
      </View>

      {v ? (
        <View
          accessible
          accessibilityLabel={tl(
            `Eaten today ${eaten} of ${target} kcal, this serving ${kcal} kcal`,
            `今日食咗 ${eaten} / ${target} kcal，呢份 ${kcal} kcal`,
          )}
          className="h-2.5 flex-row overflow-hidden rounded-full bg-surface-sunken"
        >
          <View style={{ width: `${v.eatenShare * 100}%`, backgroundColor: EATEN_GREY }} />
          <View style={{ width: `${v.dishShare * 100}%`, backgroundColor: v.fits ? colors.jade : colors.accent }} />
        </View>
      ) : null}

      <View className="gap-2">
        {macros.map((m) => {
          const grams = nutrition.perServing[m.key];
          const share = shareOfTarget(grams, targets?.[m.key]);
          return (
            <View key={m.key} className="flex-row items-center gap-2">
              <ScalableText className="w-14 text-sm text-ink-muted">{m.label}</ScalableText>
              <ScalableText className="w-12 text-sm font-bold text-ink">{formatAmount(grams, "g")}</ScalableText>
              {share != null ? (
                <>
                  <View className="h-2 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                    <View style={{ width: `${Math.min(100, share)}%`, backgroundColor: m.color, height: "100%" }} />
                  </View>
                  <ScalableText className="w-10 text-right text-xs text-ink-muted">{formatShare(share)}</ScalableText>
                </>
              ) : null}
            </View>
          );
        })}

        {canViewMore && nutrition.micros ? (
          <View className="mt-1 gap-1.5 border-t border-dashed border-[#E4DCCB] pt-2">
            <ScalableText className="text-xs text-ink-muted">
              {targets
                ? tl("Vitamins & minerals (share of daily target)", "維他命及礦物質（佔每日目標）")
                : tl("Vitamins & minerals", "維他命及礦物質")}
            </ScalableText>
            <View className="flex-row flex-wrap gap-1.5">
              {TRACKED_MICRO_KEYS.map((k) => {
                const meta = TRACKED_MICRO_META[k];
                const amount = nutrition.micros![k];
                // Sodium is a daily ceiling, not a target to reach, so it shows its amount.
                const share = isLimitMicro(k) ? null : shareOfTarget(amount, microTarget(k));
                return (
                  <View key={k} className="rounded-lg bg-surface-subtle px-2 py-1">
                    <ScalableText className="text-xs text-ink">
                      {tl(meta.label, meta.labelZh)}{" "}
                      <ScalableText className="font-bold">
                        {share != null ? formatShare(share) : formatAmount(amount, meta.unit as "mg" | "mcg")}
                      </ScalableText>
                    </ScalableText>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}
      </View>

      {canViewMore ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tl(
            `Fibre and ${TRACKED_MICRO_KEYS.length} vitamins & minerals per serving, sodium included. Go Pro / Max to see it all`,
            `每份嘅纖維，同 ${TRACKED_MICRO_KEYS.length} 種維他命礦物質（包括鈉）。升級 Pro／Max 睇晒`,
          )}
          onPress={triggerPaywall}
          className="gap-2 rounded-xl bg-surface-subtle p-3 active:opacity-80"
        >
          <View className="flex-row items-start gap-2">
            <Ionicons name="lock-closed" size={16} color={colors.inkMuted} />
            <ScalableText className="flex-1 text-sm text-ink-muted">
              {tl(
                `Fibre and ${TRACKED_MICRO_KEYS.length} vitamins & minerals per serving, sodium included`,
                `每份嘅纖維，同 ${TRACKED_MICRO_KEYS.length} 種維他命礦物質（包括鈉）`,
              )}
            </ScalableText>
          </View>
          <View className="min-h-[44px] items-center justify-center self-start rounded-xl bg-brand px-4">
            <ScalableText className="text-sm font-bold text-white">
              {tl("Go Pro / Max to see it all", "升級 Pro／Max 睇晒")}
            </ScalableText>
          </View>
        </Pressable>
      )}

      <View className="flex-row flex-wrap items-center gap-x-2">
        <ScalableText className="text-xs text-ink-faint">{tl("Estimate", "估算數字")}</ScalableText>
        <SourcesLink />
      </View>
    </>
  );
}
