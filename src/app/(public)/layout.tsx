// Seventies display font for every public title (latin subset only; not loaded in /admin).
import "@fontsource/shrikhand/latin-400.css";
// Home hero: western title and script subtitle. The latin subset already has every
// accented letter of the six languages (é è à ç ñ ¿ ä ö ü ß, ’ and …).
import "@fontsource/kaushan-script/latin-400.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { PublicHeader } from "@/components/public/PublicHeader";
import { Footer } from "@/components/public/Footer";
import { FestiveBanner, FestivityProvider } from "@/components/public/FestivityProvider";
import { MaintenancePage } from "@/components/public/MaintenancePage";
import { getActiveFestivity } from "@/lib/festivities";
import { getRequestLocale } from "@/lib/locale";
import { getMaintenanceView } from "@/lib/maintenance-view";
import { getMaintenanceState } from "@/lib/services/maintenance";
import { translate, type Locale } from "@/messages";
import { siteUrl } from "@/lib/seo";
import { defaultSiteSettings, getSiteSettings } from "@/lib/services/site-settings";

export const dynamic = "force-dynamic";

const openGraphLocales: Record<Locale, string> = {
  it: "it_IT",
  es: "es_ES",
  fr: "fr_FR",
  en: "en_GB",
  nl: "nl_NL",
  de: "de_DE",
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  // No noindex: a short closure must not drop the site from search engines.
  if ((await getMaintenanceView()) === "visitor") return { title: translate(locale, "maintenance.metaTitle") };
  const settings = await getSiteSettings().catch(() => defaultSiteSettings());
  const title = `${settings.name} — ${translate(locale, "seo.title")}`;
  const description = translate(locale, "seo.description").replace("{name}", settings.name);
  return {
    metadataBase: new URL(siteUrl()),
    // absolute: the root layout's "%s — PFdeco" template must not be added to the home title.
    title: { absolute: title, template: `%s — ${settings.name}` },
    description,
    applicationName: settings.name,
    // Link previews (WhatsApp, Facebook...) show the Route 66 photo.
    openGraph: {
      type: "website",
      siteName: settings.name,
      title,
      description,
      url: "/",
      locale: openGraphLocales[locale],
      images: [{ url: "/brand/hero-route66.jpg", width: 1024, height: 572, alt: settings.name }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/brand/hero-route66.jpg"] },
  };
}

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const locale = await getRequestLocale();
  let settings = defaultSiteSettings();
  try {
    settings = await getSiteSettings();
  } catch {
    // Keep the public site available if settings cannot be read.
  }
  const view = await getMaintenanceView();

  if (view === "visitor") {
    const { message } = await getMaintenanceState();
    return <MaintenancePage settings={settings} message={message} />;
  }

  // Today's date is read at request time, never frozen at build time (connection() and
  // force-dynamic): the decoration follows the date in Brussels without a new build.
  // The ?festivity / ?festivityDate preview only works outside production (see
  // FestivityProvider).
  await connection();
  const festivity = getActiveFestivity(new Date());

  return (
    <FestivityProvider festivity={festivity} previewEnabled={process.env.NODE_ENV !== "production"}>
      <a className="skip-link" href="#main">
        {translate(locale, "footer.skip")}
      </a>
      {view === "admin" && (
        <aside className="maintenance-admin-bar" aria-label={translate(locale, "maintenance.adminBarLabel")}>
          <p>{translate(locale, "maintenance.adminBar")}</p>
          <Link href="/admin/impostazioni#manutenzione">{translate(locale, "maintenance.adminBarLink")}</Link>
        </aside>
      )}
      <FestiveBanner />
      <PublicHeader settings={settings} />
      <main id="main" className="public-main">{children}</main>
      <Footer settings={settings} />
    </FestivityProvider>
  );
}
