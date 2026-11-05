// Search engines: public address of the site and the structured data on the home page.
import type { SiteSettings } from "@/lib/services/site-settings";

/** Public address without a trailing slash (NEXT_PUBLIC_SITE_URL, pfdeco.eu by default). */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://pfdeco.eu").trim().replace(/\/+$/, "");
}

/** Pages a search engine may list: the home page and the information pages. */
export const indexablePaths = [
  "/",
  "/spedizioni-e-resi",
  "/condizioni-di-vendita",
  "/privacy",
  "/cookie",
  "/traccia-ordine",
] as const;

/**
 * Online store and website for Google (schema.org JSON-LD). "PFdeco" stays as an
 * alternate name so searches for the old short name also find the shop.
 */
export function storeStructuredData(settings: SiteSettings, description: string) {
  const url = `${siteUrl()}/`;
  const alternateName = ["PFdeco", new URL(url).hostname].filter((name) => name !== settings.name);
  return [
    {
      "@context": "https://schema.org",
      "@type": "OnlineStore",
      name: settings.name,
      alternateName,
      url,
      description,
      image: `${siteUrl()}/brand/hero-route66.jpg`,
      ...(settings.email ? { email: settings.email } : {}),
      ...(settings.phone ? { telephone: settings.phone } : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: settings.name,
      alternateName,
      url,
    },
  ];
}

/** JSON for a <script type="application/ld+json">, safe to put inside HTML. */
export function jsonLdText(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
