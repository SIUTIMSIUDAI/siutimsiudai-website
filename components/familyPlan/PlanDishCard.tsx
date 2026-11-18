import { ActivityIndicator, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScalableText } from "@/components/ScalableText";
import { colors } from "@/constants/theme";
import { useLocale } from "@/hooks/useLocale";
import type { FamilyRole } from "@/types/family";
import type { PlanDish, PlanMember, WeekPlan } from "@/types/familyPlan";
import { canEditPortion, canLogDish, choiceFor, eatersOf, personKcal, servingsFor, slotKey } from "@/utils/weekPlan";
import { PORTION_FACTOR } from "@/constants/portionSizes";
import { choiceLabel, memberName, servingsText } from "./labels";

interface Props {
  dish: PlanDish;
  members: PlanMember[];
  portions: WeekPlan["portions"];
  myUserId: string;
  role: FamilyRole | null;
  today: string;
  /** What the plan is busy with ("swap:<id>", "log:<id>", ...), to put a spinner on the right button. */
  busy: string | null;
  onOpen: () => void;
  onPortion: (member: PlanMember) => void;
  onSwap: () => void;
  onLock: () => void;
  onLog: () => void;
}

/**
 * One meal on the plan: the dish, how many standard servings to cook, and each member's portion with
 * their estimated calories. The planner also gets lock, swap and 食咗; everyone else can change only
 * their own portion.
 */
export function PlanDishCard({ dish, members, portions, myUserId, role, today, busy, onOpen, onPortion, onSwap, onLock, onLog }: Props) {
  const { t, tl } = useLocale();
  const key = slotKey(dish);
  const servings = servingsFor(eatersOf(key, members, portions));
  const planner = role === "manager" || role === null;
  const upcoming = dish.date >= today;
  const swapping = busy === `swap:${dish.id}`;
  const logging = busy === `log:${dish.id}`;
  const anyBusy = busy !== null;

  return (
    <View className="gap-2 rounded-2xl border border-[#E4DCCB] bg-surface p-3">
      <View className="flex-row items-start gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t(`mealType.${dish.slot}`)}: ${tl(dish.title, dish.titleZh)}`}
          accessibilityHint={t("familyPlan.openDish")}
          onPress={onOpen}
          className="flex-1 gap-0.5 active:opacity-70"
        >
          <ScalableText className="text-xs font-semibold uppercase text-ink-muted">{t(`mealType.${dish.slot}`)}</ScalableText>
          <ScalableText className="text-base font-bold text-ink">{tl(dish.title, dish.titleZh)}</ScalableText>
          <ScalableText className="text-xs text-ink-muted">
            {`${t("familyPlan.cookServings", { n: servingsText(servings) })} · ${t("familyPlan.minutes", { count: dish.totalMinutes })}`}
          </ScalableText>
        </Pressable>
        {planner && upcoming && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(dish.locked ? "familyPlan.unlock" : "familyPlan.lock")}
            accessibilityState={{ checked: dish.locked }}
            disabled={anyBusy}
            onPress={onLock}
            className="h-11 w-11 items-center justify-center active:opacity-70"
          >
            <Ionicons name={dish.locked ? "lock-closed" : "lock-open-outline"} size={20} color={dish.locked ? colors.brand : colors.inkFaint} />
          </Pressable>
        )}
      </View>

      <View className="flex-row flex-wrap gap-1.5">
        {members.map((m) => {
          const choice = choiceFor(key, m, portions);
          const name = memberName(t, m, myUserId);
          const kcal = choice === "skip" ? null : personKcal(dish.perServing.calories, PORTION_FACTOR[choice]);
          const editable = canEditPortion(myUserId, role, m.userId) && upcoming && !dish.loggedAt;
          const label = `${name}, ${choiceLabel(t, choice, true)}${kcal !== null ? `, ${kcal} kcal` : ""}`;
          return (
            <Pressable
              key={m.userId}
              accessibilityRole={editable ? "button" : "text"}
              accessibilityLabel={label}
              accessibilityHint={editable ? t("familyPlan.changePortion") : undefined}
              disabled={!editable}
              onPress={() => onPortion(m)}
              className={`min-h-[36px] flex-row items-center gap-1 rounded-full px-3 py-1 ${
                choice === "skip" ? "bg-surface-sunken" : "bg-surface-subtle"
              } ${editable ? "active:opacity-70" : ""}`}
            >
              <ScalableText className={`text-xs font-semibold ${choice === "skip" ? "text-ink-faint" : "text-ink"}`} numberOfLines={1}>
                {name}
              </ScalableText>
              <ScalableText className={`text-xs font-bold ${choice === "skip" ? "text-ink-faint" : "text-brand"}`}>
                {choiceLabel(t, choice)}
              </ScalableText>
              {kcal !== null && <ScalableText className="text-xs text-ink-muted">{kcal}</ScalableText>}
              {editable && <Ionicons name="chevron-down" size={12} color={colors.inkFaint} />}
            </Pressable>
          );
        })}
      </View>
      <ScalableText className="text-[11px] text-ink-faint">{t("familyPlan.kcalEst")}</ScalableText>

      {planner && (
        <View className="flex-row items-center justify-between gap-2">
          {upcoming && !dish.loggedAt ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("familyPlan.swap")}
              disabled={anyBusy || dish.locked}
              onPress={onSwap}
              className={`min-h-[44px] flex-row items-center gap-1.5 rounded-xl px-3 ${dish.locked ? "opacity-40" : "active:opacity-70"}`}
            >
              {swapping ? <ActivityIndicator size="small" color={colors.brand} /> : <Ionicons name="swap-horizontal" size={18} color={colors.brand} />}
              <ScalableText className="text-sm font-semibold text-brand">{t("familyPlan.swap")}</ScalableText>
            </Pressable>
          ) : (
            <View />
          )}
          {dish.loggedAt ? (
            <View className="min-h-[44px] flex-row items-center gap-1.5 px-3">
              <Ionicons name="checkmark-circle" size={18} color={colors.jade} />
              <ScalableText className="text-sm font-semibold text-jade">{t("familyPlan.logged")}</ScalableText>
            </View>
          ) : canLogDish(dish, today) ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("familyPlan.eaten")}
              disabled={anyBusy}
              onPress={onLog}
              className="min-h-[44px] flex-row items-center gap-1.5 rounded-xl bg-jade px-4 active:opacity-80"
            >
              {logging ? <ActivityIndicator size="small" color={colors.white} /> : <Ionicons name="checkmark" size={18} color={colors.white} />}
              <ScalableText className="text-sm font-bold text-white">{t("familyPlan.eaten")}</ScalableText>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}
