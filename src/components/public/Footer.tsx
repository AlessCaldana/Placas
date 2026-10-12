import Link from "next/link";
import { Brand } from "./Brand";
import { getRequestLocale } from "@/lib/locale";
import { translate } from "@/messages";
import { whatsappLink } from "@/lib/site";
import type { SiteSettings } from "@/lib/services/site-settings";
import { legalDocumentIds, legalRoutes } from "./legal-routes";

export async function Footer({ settings }: { settings: SiteSettings }) {
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);
  const { legal } = settings;
  const companyDetails = [
    legal.vatNumber && t("footer.vat").replace("{value}", legal.vatNumber),
    legal.taxCode && t("footer.taxCode").replace("{value}", legal.taxCode),
    legal.legalAddress && t("footer.address").replace("{value}", legal.legalAddress),
    legal.reaNumber && t("footer.rea").replace("{value}", legal.reaNumber),
    legal.pecEmail && t("footer.pec").replace("{value}", legal.pecEmail),
  ].filter((detail): detail is string => Boolean(detail));
  const rights = t("footer.rights")
    .replace("{year}", String(new Date().getFullYear()))
    .replace("{name}", legal.legalName || settings.name);

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
          <Link href="/traccia-ordine">{translate(locale, "footer.track")}</Link>
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
      <div className="footer-legal">
        <div className="footer-legal-identity">
          <p>{rights}</p>
          {companyDetails.length > 0 && (
            <p className="footer-company">
              {companyDetails.map((detail, index) => (
                <span key={detail}>
                  {index > 0 && <span className="footer-separator" aria-hidden="true"> · </span>}
                  <span className="footer-company-item">{detail}</span>
                </span>
              ))}
            </p>
          )}
        </div>
        <nav className="footer-legal-links" aria-label={t("legal.eyebrow")}>
          <ul>
            {legalDocumentIds.map((id) => (
              <li key={id}>
                <Link href={legalRoutes[id]}>{t(`legal.${id}.title`)}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
