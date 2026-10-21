"use client";

import { useEffect, useRef, useState } from "react";
import { locales, type Locale } from "@/messages";
import { useLocale } from "./LocaleProvider";

export const languages: Record<Locale, { flag: string; name: string }> = {
  it: { flag: "🇮🇹", name: "Italiano" },
  fr: { flag: "🇫🇷", name: "Français" },
  es: { flag: "🇪🇸", name: "Español" },
  en: { flag: "🇬🇧", name: "English" },
  nl: { flag: "🇳🇱", name: "Nederlands" },
  de: { flag: "🇩🇪", name: "Deutsch" },
};

export function LocaleSwitcher() {
  const { locale, setLocale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const selected = languages[locale];

  return (
    <div className={`locale-switcher${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        ref={triggerRef}
        className="locale-trigger"
        type="button"
        aria-label={`${t("language.label")}: ${selected.name}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="locale-current-flag" aria-hidden="true">{selected.flag}</span>
        <i aria-hidden="true" />
      </button>
      {open && (
        <div className="locale-menu" role="menu" aria-label={t("language.label")}>
          {locales.map((option) => {
            const language = languages[option];
            const active = option === locale;
            return (
              <button
                key={option}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                className={active ? "active" : undefined}
                onClick={() => {
                  setLocale(option);
                  setOpen(false);
                }}
              >
                <span className="locale-option-flag" aria-hidden="true">{language.flag}</span>
                <span>{language.name}</span>
                <small>{option.toUpperCase()}</small>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
