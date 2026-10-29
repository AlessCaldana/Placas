"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale } from "@/components/ui/LocaleProvider";
import { getFestivityPreview, type FestivityId } from "@/lib/festivities";

/**
 * Festivity of the public site. The (public) layout computes it on the server for every
 * request (getActiveFestivity(new Date()), Brussels time) and passes it here.
 *
 * Preview outside production only (`previewEnabled` = NODE_ENV !== "production"):
 *   /?festivity=halloween        forces one festivity (christmas, new_year, epiphany,
 *                                valentines, easter…); /?festivity=none removes it
 *   /?festivityDate=2026-12-20   uses the calendar as if today were that day
 * In production both parameters are ignored.
 */
const FestivityContext = createContext<FestivityId | null>(null);

export function useFestivity() {
  return useContext(FestivityContext);
}

/** Icon shown next to the greeting (decorative, hidden from screen readers). */
const festivityIcons: Record<FestivityId, string> = {
  halloween: "🎃",
  christmas: "🎄",
  new_year: "🥂",
  epiphany: "🧹",
  valentines: "❤️",
  easter: "🐣",
};

export function FestivityProvider({
  festivity,
  previewEnabled,
  children,
}: {
  festivity: FestivityId | null;
  previewEnabled: boolean;
  children: ReactNode;
}) {
  const searchParams = useSearchParams();
  const preview = previewEnabled
    ? getFestivityPreview({
        festivity: searchParams.get("festivity"),
        festivityDate: searchParams.get("festivityDate"),
      })
    : undefined;
  const active = preview === undefined ? festivity : preview;

  return (
    <FestivityContext.Provider value={active}>
      {/* display: contents; only carries the accent colours of the festivity (globals.css). */}
      <div className="festive-root" data-festivity={active ?? undefined}>
        {children}
      </div>
    </FestivityContext.Provider>
  );
}

/** Thin greeting strip above the header, only while a festivity is active. */
export function FestiveBanner() {
  const festivity = useFestivity();
  const { t } = useLocale();
  if (!festivity) return null;
  const icon = festivityIcons[festivity];
  return (
    <div className="festive-banner">
      <p>
        <span aria-hidden="true">{icon}</span>
        {t(`festivity.${festivity}`)}
        <span aria-hidden="true">{icon}</span>
      </p>
    </div>
  );
}
