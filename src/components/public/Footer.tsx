import Link from "next/link";
import { Brand } from "./Brand";
import { Icon } from "@/components/ui/Icon";
import { getRequestLocale } from "@/lib/locale";
import { isStripeConfigured } from "@/lib/payments/stripe";
import { CARRIERS } from "@/lib/shipping-carriers";
import { translate } from "@/messages";
import { whatsappGreeting, whatsappLink } from "@/lib/site";
import type { SiteSettings } from "@/lib/services/site-settings";
import { legalDocumentIds, legalRoutes } from "./legal-routes";

/** Card brands Stripe Checkout takes by default (brand names, not translated). */
const cardBrands = ["Visa", "Mastercard", "American Express"];

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
  // "bpost, Mondial Relay, … and DHL Express" with the "and" of each language.
  const list = (items: string[]) => new Intl.ListFormat(locale, { type: "conjunction" }).format(items);
  const carriers = list(CARRIERS.filter((carrier) => carrier.id !== "other").map((carrier) => carrier.name));
  // Only promised when online payments are really switched on.
  const paymentsEnabled = isStripeConfigured();

  return (
    <footer>
      <div className="footer-main">
        <div>
          <Brand variant="footer" locale={locale} settings={settings} />
          <p className="hero-tagline footer-tagline"><span>{t("footer.text")}</span></p>
        </div>
        <div>
          <b>{translate(locale, "footer.explore")}</b>
          <Link href="/#catalogo">{translate(locale, "nav.catalog")}</Link>
          <Link href="/#contatti">{translate(locale, "nav.contact")}</Link>
          <Link href="/traccia-ordine">{translate(locale, "footer.track")}</Link>
        </div>
        <div>
          <b>{translate(locale, "footer.contacts")}</b>
          <a href={whatsappLink(whatsappGreeting(t, settings.name), settings.whatsappNumber)} target="_blank" rel="noopener noreferrer">
            WhatsApp
          </a>
          {settings.phone && <a href={`tel:${settings.phone.replace(/[^+\d]/g, "")}`}>{settings.phone}</a>}
          {settings.email && <a href={`mailto:${settings.email}`}>{settings.email}</a>}
        </div>
      </div>
      <div className="footer-trust">
        {paymentsEnabled && (
          <p className="footer-trust-item">
            <Icon name="lock" size={18} />
            <span>
              {t("footer.payments")}
              <span className="footer-cards" aria-hidden="true">
                <VisaMark />
                <MastercardMark />
                <AmexMark />
              </span>
              <span className="sr-only">. {t("footer.cards").replace("{cards}", list(cardBrands))}</span>
            </span>
          </p>
        )}
        <p className="footer-trust-item">
          <Icon name="truck" size={18} />
          <span>{t("footer.shipping").replace("{carriers}", carriers)}</span>
        </p>
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

/* Simple generic card marks drawn inline (no downloaded logos, no external files). */
function VisaMark() {
  return (
    <svg className="footer-card" viewBox="0 0 38 24" focusable="false">
      <rect width="38" height="24" rx="3" fill="#fffdf7" />
      <text x="19" y="16" textAnchor="middle" fill="#1a1f71" fontFamily="Arial, Helvetica, sans-serif" fontSize="10.5" fontStyle="italic" fontWeight="800">VISA</text>
    </svg>
  );
}

function MastercardMark() {
  return (
    <svg className="footer-card" viewBox="0 0 38 24" focusable="false">
      <rect width="38" height="24" rx="3" fill="#fffdf7" />
      <circle cx="15" cy="12" r="7" fill="#eb001b" />
      <circle cx="23" cy="12" r="7" fill="#f79e1b" />
      <path d="M19 6.2a7 7 0 0 1 0 11.6 7 7 0 0 1 0-11.6Z" fill="#ff5f00" />
    </svg>
  );
}

function AmexMark() {
  return (
    <svg className="footer-card" viewBox="0 0 38 24" focusable="false">
      <rect width="38" height="24" rx="3" fill="#1f72cd" />
      <text x="19" y="15.5" textAnchor="middle" fill="#fffdf7" fontFamily="Arial, Helvetica, sans-serif" fontSize="9" fontWeight="800" letterSpacing="0.3">AMEX</text>
    </svg>
  );
}
