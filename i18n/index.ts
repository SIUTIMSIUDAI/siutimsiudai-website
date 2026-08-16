import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getLocales } from "expo-localization";
import { Locale } from "@/types";
import { PASSWORD_MIN_LENGTH } from "@/utils/passwordSchema";
import enStrings from "./en.json";
import zhStrings from "./zh-Hant.json";

const resources = {
  en: { translation: enStrings },
  "zh-Hant": { translation: zhStrings },
};

export function detectInitialLocale(): Locale {
  try {
    const first = getLocales()[0];
    const tag = (first?.languageTag ?? first?.languageCode ?? "en").toLowerCase();
    if (tag.startsWith("zh")) return "zh-Hant";
  } catch {
    // expo-localization can throw on web SSR; fall back to English.
  }
  return "en";
}

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    // Use i18next's built-in v3 plural handling instead of Intl.PluralRules,
    // which Hermes/Expo Go doesn't reliably expose — without this it logs a
    // red LogBox warning on every launch and falls back to v3 anyway. Our
    // locale keys use {{count}} for interpolation only (no _one/_other plural
    // variants), so this is behavior-neutral today; it just silences the noise.
    compatibilityJSON: "v3",
    resources,
    lng: detectInitialLocale(),
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
      // Available to every key without the caller passing it. The password minimum appears in two
      // strings per locale (the live checklist row and the rejection message), and every screen
      // that renders them goes through a generic `t(key)` helper with no idea a parameter is
      // wanted. Supplying it here keeps the copy tied to utils/passwordSchema, so raising the
      // minimum can never leave the UI promising the old one.
      defaultVariables: { passwordMin: PASSWORD_MIN_LENGTH },
    },
  });
}

export function setI18nLocale(locale: Locale): void {
  if (i18n.language !== locale) {
    i18n.changeLanguage(locale);
  }
}

/** Pick a localized data field (name vs nameZh) for the active locale. */
export function pick(locale: Locale, en: string, zh: string): string {
  return locale === "zh-Hant" ? zh || en : en || zh;
}

export default i18n;
