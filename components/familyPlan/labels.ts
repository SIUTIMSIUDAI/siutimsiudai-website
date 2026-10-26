import type { TFunction } from "i18next";
import type { Locale } from "@/types";
import type { PlanFailReason, PlanMember, PortionChoice } from "@/types/familyPlan";
import { REGEN_LIMIT_PER_WEEK } from "@/constants/portionSizes";

// The family plan's small shared wordings, so every surface names people, sizes and failures alike.

const SIZE_KEYS: Record<PortionChoice, [string, string]> = {
  small: ["familyPlan.sizeSmall", "familyPlan.sizeSmallLong"],
  medium: ["familyPlan.sizeMedium", "familyPlan.sizeMediumLong"],
  large: ["familyPlan.sizeLarge", "familyPlan.sizeLargeLong"],
  skip: ["familyPlan.skip", "familyPlan.skip"],
};

/** 細 / 中 / 大 (S / M / L), or the long form for a sheet; 唔食呢餐 for a skip. */
export function choiceLabel(t: TFunction, choice: PortionChoice, long = false): string {
  return t(SIZE_KEYS[choice][long ? 1 : 0]);
}

/** A member's name as the plan shows it: their display name, or "You" / "Family member". */
export function memberName(t: TFunction, member: PlanMember, myUserId: string): string {
  if (member.displayName?.trim()) return member.displayName.trim();
  return t(member.userId === myUserId ? "familyPlan.you" : "familyPlan.familyMember");
}

/** "Mon 26/10" / "10月26日 週一". */
export function dayLabel(date: string, locale: Locale): string {
  const d = new Date(`${date}T00:00:00`);
  const weekday = d.toLocaleDateString(locale === "zh-Hant" ? "zh-HK" : "en-GB", { weekday: "short" });
  const day = d.getDate();
  const month = d.getMonth() + 1;
  return locale === "zh-Hant" ? `${month}月${day}日 ${weekday}` : `${weekday} ${day}/${month}`;
}

/** What went wrong, in words the family can act on. */
export function planErrorText(t: TFunction, reason: PlanFailReason): string {
  switch (reason) {
    case "max_required":
      return t("familyPlan.errMaxRequired");
    case "already_generated":
      return t("familyPlan.errAlreadyGenerated");
    case "regen_limit":
      return t("familyPlan.errRegenLimit", { count: REGEN_LIMIT_PER_WEEK });
    case "locked":
      return t("familyPlan.errLocked");
    case "already_logged":
      return t("familyPlan.errAlreadyLogged");
    case "rate_limited":
      return t("familyPlan.errRateLimited");
    case "not_manager":
      return t("familyPlan.errNotManager");
    default:
      return t("familyPlan.errUnavailable");
  }
}

/** A servings count without trailing zeros: 3, 2.25, 1.75. */
export const servingsText = (n: number) => String(Number(n.toFixed(2)));
