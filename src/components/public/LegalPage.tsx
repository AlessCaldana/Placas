import type { Metadata } from "next";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { getRequestLocale } from "@/lib/locale";
import { whatsappLink } from "@/lib/site";
import { WORLD_COUNTRIES } from "@/lib/payments/shipping";
import { defaultSiteSettings, getSiteSettings, type SiteSettings } from "@/lib/services/site-settings";
import { translate, type Locale } from "@/messages";
import {
  cookiePolicy,
  privacyPolicy,
  salesConditions,
  shippingAndReturns,
  type LegalBlock,
  type LegalContext,
  type LegalInline,
  type LegalSection,
} from "@/messages/legal-it";
import { legalDocumentIds, legalLastUpdated, legalRoutes, type LegalDocumentId } from "./legal-routes";

const documents: Record<LegalDocumentId, (ctx: LegalContext) => LegalSection[]> = {
  privacy: privacyPolicy,
  cookie: cookiePolicy,
  sales: salesConditions,
  shipping: shippingAndReturns,
};

function formatWhatsapp(digits: string): string {
  return digits.startsWith("39") ? `+39 ${digits.slice(2)}` : `+${digits}`;
}

function buildLegalContext(settings: SiteSettings): LegalContext {
  const { legal, shippingRates } = settings;
  const regionNames = new Intl.DisplayNames(["it"], { type: "region" });
  const whatsappNumber = settings.whatsappNumber.replace(/\D/g, "");
  // "390000000000" is the placeholder used until the owner sets the real number.
  const hasWhatsapp = whatsappNumber.length >= 7 && !/^390+$/.test(whatsappNumber);
  return {
    holder: legal.legalName || settings.name,
    shopName: settings.name,
    email: settings.email,
    vatNumber: legal.vatNumber,
    taxCode: legal.taxCode,
    legalAddress: legal.legalAddress,
    pecEmail: legal.pecEmail,
    reaNumber: legal.reaNumber,
    whatsapp: hasWhatsapp ? { label: formatWhatsapp(whatsappNumber), href: whatsappLink(undefined, whatsappNumber) } : null,
    shipping: {
      italy: shippingRates.IT !== null,
      eu: shippingRates.EU !== null,
      world: shippingRates.WORLD !== null ? WORLD_COUNTRIES.map((country) => regionNames.of(country) ?? country) : [],
    },
  };
}

async function loadSettings(): Promise<SiteSettings> {
  try {
    return await getSiteSettings();
  } catch {
    return defaultSiteSettings();
  }
}

export async function legalMetadata(document: LegalDocumentId): Promise<Metadata> {
  const locale = await getRequestLocale();
  return { title: translate(locale, `legal.${document}.title`) };
}

function renderInline(part: LegalInline, key: number): ReactNode {
  if (typeof part === "string") return <Fragment key={key}>{part}</Fragment>;
  if (part.kind === "code") return <code key={key}>{part.text}</code>;
  if (part.kind === "strong") return <strong key={key}>{part.text}</strong>;
  if (part.href.startsWith("/")) {
    return <Link key={key} href={part.href}>{part.text}</Link>;
  }
  const external = part.href.startsWith("http");
  return (
    <a key={key} href={part.href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {part.text}
    </a>
  );
}

function renderBlock(block: LegalBlock, key: number): ReactNode {
  if (block.kind === "h3") return <h3 key={key}>{block.text}</h3>;
  if (block.kind === "p") return <p key={key}>{block.content.map(renderInline)}</p>;
  return (
    <ul key={key}>
      {block.items.map((item, index) => (
        <li key={index}>{item.map(renderInline)}</li>
      ))}
    </ul>
  );
}

function formatDate(locale: Locale, isoDate: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${isoDate}T00:00:00Z`));
}

export async function LegalPage({ document }: { document: LegalDocumentId }) {
  const [locale, settings] = await Promise.all([getRequestLocale(), loadSettings()]);
  const t = (key: string) => translate(locale, key);
  const sections = documents[document](buildLegalContext(settings));
  const others = legalDocumentIds.filter((id) => id !== document);

  return (
    <div className="legal-page">
      <header className="legal-hero">
        <div className="eyebrow"><span /> {t("legal.eyebrow")}</div>
        <h1>{t(`legal.${document}.title`)}</h1>
        <p className="legal-summary">{t(`legal.${document}.summary`)}</p>
        <p className="legal-updated">
          {t("legal.updated")}: <time dateTime={legalLastUpdated}>{formatDate(locale, legalLastUpdated)}</time>
        </p>
        {locale !== "it" && (
          <p className="legal-language-note" role="note">{t("legal.bindingNote")}</p>
        )}
      </header>

      <div className="legal-layout">
        <nav className="legal-toc" aria-labelledby="legal-toc-title">
          <h2 id="legal-toc-title">{t("legal.toc")}</h2>
          <ol lang="it">
            {sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`}>{section.title}</a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="legal-body" lang="it">
          {sections.map((section) => (
            <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`}>
              <h2 id={`${section.id}-title`}>{section.title}</h2>
              {section.blocks.map(renderBlock)}
            </section>
          ))}
        </article>
      </div>

      <nav className="legal-related" aria-labelledby="legal-related-title">
        <h2 id="legal-related-title">{t("legal.related")}</h2>
        <ul>
          {others.map((id) => (
            <li key={id}>
              <Link href={legalRoutes[id]}>{t(`legal.${id}.title`)}</Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
