"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { locales, translate, type Locale } from "@/messages";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);
const languageNames: Record<Locale, string> = {
  it: "Italiano",
  fr: "Français",
  es: "Español",
  en: "English",
  nl: "Nederlands",
  de: "Deutsch",
};
const languageFlags: Record<Locale, string> = {
  it: "🇮🇹",
  fr: "🇫🇷",
  es: "🇪🇸",
  en: "🇬🇧",
  nl: "🇳🇱",
  de: "🇩🇪",
};

export function LocaleProvider({
  children,
  initialLocale,
  showPrompt,
}: {
  children: ReactNode;
  initialLocale: Locale;
  showPrompt: boolean;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState(initialLocale);
  const [promptOpen, setPromptOpen] = useState(showPrompt);
  const [hasSelectedLocale, setHasSelectedLocale] = useState(false);

  useEffect(() => {
    if (!hasSelectedLocale) return;
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `placa_locale=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
    document.documentElement.lang = locale;
    router.refresh();
  }, [hasSelectedLocale, locale, router]);

  function setLocale(nextLocale: Locale) {
    if (!locales.includes(nextLocale)) return;
    setHasSelectedLocale(true);
    setLocaleState(nextLocale);
    setPromptOpen(false);
  }

  const value = {
    locale,
    setLocale,
    t: (key: string) => translate(locale, key),
  };

  return (
    <LocaleContext.Provider value={value}>
      {children}
      {promptOpen && (
        <div className="locale-backdrop">
          <section
            className="locale-prompt"
            role="dialog"
            aria-modal="true"
            aria-labelledby="locale-prompt-title"
          >
            <span className="eyebrow">PFdeco</span>
            <h1 id="locale-prompt-title">{translate(locale, "language.choose")}</h1>
            <p>{translate(locale, "language.prompt")}</p>
            <div className="locale-options">
              {locales.map((option) => (
                <button key={option} type="button" onClick={() => setLocale(option)}>
                  <span aria-hidden="true">{languageFlags[option]}</span>
                  {languageNames[option]}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used inside LocaleProvider");
  return value;
}
