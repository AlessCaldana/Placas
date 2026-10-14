import type { CatalogLocale } from "@/generated/prisma/enums";
import type { Locale } from "@/messages";

/**
 * Locales that can hold a product translation. Italian is the base language:
 * it lives in the product's own `name`/`description` fields and is never
 * stored as a translation row.
 */
export const productTranslationLocales = ["fr", "es", "en", "nl"] as const;
export type ProductTranslationLocale = (typeof productTranslationLocales)[number];

export type ProductTranslationText = { name: string; description: string };
export type ProductTranslations = Record<ProductTranslationLocale, ProductTranslationText>;

export const productTranslationNameMaxLength = 200;
export const productTranslationDescriptionMaxLength = 5000;

const catalogLocaleByLocale: Record<ProductTranslationLocale, CatalogLocale> = {
  fr: "FR",
  es: "ES",
  en: "EN",
  nl: "NL",
};

export function toCatalogLocale(locale: ProductTranslationLocale): CatalogLocale {
  return catalogLocaleByLocale[locale];
}

export function fromCatalogLocale(locale: CatalogLocale): ProductTranslationLocale | null {
  const match = productTranslationLocales.find((item) => catalogLocaleByLocale[item] === locale);
  return match ?? null;
}

export function emptyProductTranslations(): ProductTranslations {
  return {
    fr: { name: "", description: "" },
    es: { name: "", description: "" },
    en: { name: "", description: "" },
    nl: { name: "", description: "" },
  };
}

type StoredTranslation = { locale: CatalogLocale; name: string | null; description: string | null };

/**
 * Picks the product text for `locale`. Each field falls back to the Italian
 * base value on its own when the translation is missing or blank.
 */
export function localizeProductText(
  base: { name: string; description: string | null },
  translations: readonly StoredTranslation[],
  locale: Locale,
): ProductTranslationText {
  const baseText = { name: base.name, description: base.description ?? "" };
  if (locale === "it") return baseText;
  const catalogLocale = toCatalogLocale(locale);
  const translation = translations.find((item) => item.locale === catalogLocale);
  const name = translation?.name?.trim();
  const description = translation?.description?.trim();
  return {
    name: name || baseText.name,
    description: description || baseText.description,
  };
}

/**
 * Text used by the public search: the Italian name, every translated name and
 * the brand/model, so a product can be found whatever the visitor's language.
 */
export function buildProductSearchText(
  base: { name: string; brand?: string | null; model?: string | null },
  translations: readonly StoredTranslation[] = [],
): string {
  const parts = [
    base.name,
    ...translations
      .filter((item) => fromCatalogLocale(item.locale) !== null)
      .map((item) => item.name ?? ""),
    base.brand ?? "",
    base.model ?? "",
  ]
    .map((part) => part.trim())
    .filter(Boolean);
  return [...new Set(parts)].join(" · ");
}
