"use client";

import { locales, type Locale } from "@/messages";
import { useLocale } from "./LocaleProvider";

const languageNames: Record<Locale, string> = {
  it: "Italiano",
  fr: "Français",
  es: "Español",
  en: "English",
};

export function LocaleSwitcher() {
  const { locale, setLocale, t } = useLocale();

  return (
    <label className="locale-switcher">
      <span className="sr-only">{t("language.label")}</span>
      <select
        aria-label={t("language.label")}
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
      >
        {locales.map((option) => (
          <option key={option} value={option}>
            {languageNames[option]}
          </option>
        ))}
      </select>
    </label>
  );
}
