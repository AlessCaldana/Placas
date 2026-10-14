// Seventies display font for every public title (latin subset only; not loaded in /admin).
import "@fontsource/shrikhand/latin-400.css";
import type { ReactNode } from "react";
import { PublicHeader } from "@/components/public/PublicHeader";
import { Footer } from "@/components/public/Footer";
import { getRequestLocale } from "@/lib/locale";
import { translate } from "@/messages";
import { defaultSiteSettings, getSiteSettings } from "@/lib/services/site-settings";

export const dynamic = "force-dynamic";

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const locale = await getRequestLocale();
  let settings = defaultSiteSettings();
  try {
    settings = await getSiteSettings();
  } catch {
    // Keep the public site available if settings cannot be read.
  }

  return (
    <>
      <a className="skip-link" href="#main">
        {translate(locale, "footer.skip")}
      </a>
      <PublicHeader settings={settings} />
      <main id="main" className="public-main">{children}</main>
      <Footer settings={settings} />
    </>
  );
}
