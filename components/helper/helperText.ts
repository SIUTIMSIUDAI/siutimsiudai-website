import { useMemo } from "react";
import type { TFunction } from "i18next";
import i18n from "@/i18n";
import type { HelperLanguage, PlanMember, PortionChoice } from "@/types/familyPlan";

// Helper mode speaks the helper's language (en / fil / id) whatever the app itself is set to, so its
// screens take their words from a translator fixed to that language rather than from useLocale.

/** helper.* strings in her language. */
export function useHelperT(lang: HelperLanguage): TFunction {
  return useMemo(() => i18n.getFixedT(lang), [lang]);
}

/** The names helper mode offers, each in its own language, so she can find hers. */
export const HELPER_LANGUAGE_NAMES: Record<HelperLanguage, string> = {
  en: "English",
  fil: "Filipino",
  id: "Bahasa Indonesia",
};

/** "Lun 26/10": the weekday in her language, Sunday first like every week in the app. */
export function helperDayLabel(ht: TFunction, date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return `${ht(`helper.weekday.${d.getDay()}`)} ${d.getDate()}/${d.getMonth() + 1}`;
}

/** "Lun 26/10 09:30" for when the planner's phone last published the list. */
export function helperTimeLabel(ht: TFunction, iso: string): string {
  const d = new Date(iso);
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `${helperDayLabel(ht, day)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function helperMemberName(ht: TFunction, member: PlanMember, myUserId: string): string {
  if (member.displayName?.trim()) return member.displayName.trim();
  return ht(member.userId === myUserId ? "helper.you" : "helper.familyMember");
}

export function helperChoiceLabel(ht: TFunction, choice: PortionChoice): string {
  return choice === "skip" ? ht("helper.notEating") : ht(`helper.size.${choice}`);
}
