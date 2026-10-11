import Link from "next/link";
import { Brand } from "./Brand";
import { getRequestLocale } from "@/lib/locale";
import { translate } from "@/messages";
import { whatsappLink } from "@/lib/site";
import type { SiteSettings } from "@/lib/services/site-settings";

export async function Footer({ settings }: { settings: SiteSettings }) {
  const locale = await getRequestLocale();

  return (
    <footer>
      <div className="footer-main">
        <div>
          <Brand variant="footer" locale={locale} settings={settings} />
          <p>{translate(locale, "footer.text")}</p>
        </div>
        <div>
          <b>{translate(locale, "footer.explore")}</b>
          <Link href="/#catalogo">{translate(locale, "nav.catalog")}</Link>
          <Link href="/#contatti">{translate(locale, "nav.contact")}</Link>
        </div>
        <div>
          <b>{translate(locale, "footer.contacts")}</b>
          <a href={whatsappLink(undefined, settings.whatsappNumber)} target="_blank" rel="noopener noreferrer">
            WhatsApp
          </a>
          {settings.phone && <a href={`tel:${settings.phone.replace(/[^+\d]/g, "")}`}>{settings.phone}</a>}
          {settings.email && <a href={`mailto:${settings.email}`}>{settings.email}</a>}
        </div>
      </div>
      <div className="footer-bottom">
        © {new Date().getFullYear()} {settings.name} <span>{translate(locale, "footer.demo")}</span>
      </div>
    </footer>
  );
}
