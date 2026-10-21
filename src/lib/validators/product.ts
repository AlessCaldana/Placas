import {
  productTranslationDescriptionMaxLength,
  productTranslationLocales,
  productTranslationNameMaxLength,
  type ProductTranslationLocale,
  type ProductTranslationText,
} from "@/lib/product-translations";

const productStatuses = ["DRAFT", "PUBLISHED", "UNAVAILABLE"] as const;
export const draftCategoryPlaceholder = "__draft__";

/** Limits that match the database columns (VarChar(120) and INTEGER). */
export const productTextFieldMaxLength = 120;
export const productDescriptionMaxLength = productTranslationDescriptionMaxLength;
export const productQuantityMax = 2_147_483_647;

const PRODUCT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Product primary key (UUID) taken from a URL. */
export function isProductId(value: unknown): value is string {
  return typeof value === "string" && value.length === 36 && PRODUCT_ID.test(value);
}
export type NewProductInput = {
  referenceCode: string;
  name: string;
  description: string | null;
  categoryName: string;
  subcategoryName: string | null;
  brand: string | null;
  model: string | null;
  size: string;
  price: string;
  quantity: number | null;
  material: string | null;
  status: (typeof productStatuses)[number];
  /**
   * Only present when the request sent a `translations` object. Contains just
   * the locales that were sent; an entry with empty name and description means
   * "remove that translation". `undefined` leaves stored translations untouched.
   */
  translations?: Partial<Record<ProductTranslationLocale, ProductTranslationText>>;
  /**
   * Only present when the request sent a boolean `showOnHero` (home page hero
   * carousel). `undefined` keeps the stored value when editing (false on create).
   */
  showOnHero?: boolean;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTranslationField(value: unknown, maxLength: number): string | null {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > maxLength ? null : text;
}

/**
 * Parses the optional `translations` object (keys fr/es/en/nl/de, each
 * `{ name?, description? }`). Unknown keys are ignored; wrong types or values
 * over the length limits make the whole product invalid.
 */
export function parseProductTranslationsInput(
  value: unknown,
):
  | { ok: true; data: NewProductInput["translations"] }
  | { ok: false } {
  if (value === undefined || value === null) return { ok: true, data: undefined };
  if (!isPlainObject(value)) return { ok: false };
  const data: NonNullable<NewProductInput["translations"]> = {};
  for (const locale of productTranslationLocales) {
    if (!(locale in value) || value[locale] === undefined) continue;
    const entry = value[locale];
    if (!isPlainObject(entry)) return { ok: false };
    const name = parseTranslationField(entry.name, productTranslationNameMaxLength);
    const description = parseTranslationField(
      entry.description,
      productTranslationDescriptionMaxLength,
    );
    if (name === null || description === null) return { ok: false };
    data[locale] = { name, description };
  }
  return { ok: true, data };
}

export function parseNewProductInput(
  value: unknown,
): { ok: true; data: NewProductInput } | { ok: false } {
  if (!value || typeof value !== "object") return { ok: false };
  const input = value as Record<string, unknown>;
  const referenceCode =
    typeof input.referenceCode === "string" ? input.referenceCode.trim() : "";
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const categoryName =
    typeof input.categoryName === "string" ? input.categoryName.trim() : "";
  const subcategoryName =
    typeof input.subcategoryName === "string" ? input.subcategoryName.trim() : "";
  const size = typeof input.size === "string" ? input.size.trim() : "";
  const status = input.status as NewProductInput["status"];
  const isDraft = status === "DRAFT";
  const rawPrice = typeof input.price === "number" ? String(input.price) : input.price;
  const priceText = typeof rawPrice === "string" ? rawPrice.trim().replace(",", ".") : "";
  const price = priceText ? Number(priceText) : isDraft ? 0 : Number.NaN;
  const rawQuantity = input.quantity;
  const quantityText =
    rawQuantity === null || rawQuantity === undefined || rawQuantity === ""
      ? null
      : String(rawQuantity);
  const quantity = quantityText === null ? null : Number(quantityText);
  const translations = parseProductTranslationsInput(input.translations);
  const showOnHero = input.showOnHero;
  const tooLong = (field: unknown, max: number) => typeof field === "string" && field.trim().length > max;

  if (
    !translations.ok ||
    (showOnHero !== undefined && typeof showOnHero !== "boolean") ||
    (!isDraft && !referenceCode) ||
    referenceCode.length > 64 ||
    (!isDraft && !name) ||
    name.length > 200 ||
    (!isDraft && (!categoryName || categoryName === draftCategoryPlaceholder)) ||
    categoryName.length > 120 ||
    subcategoryName.length > 120 ||
    (!isDraft && !size) ||
    size.length > 80 ||
    (priceText !== "" && !/^\d+(?:\.\d{1,2})?$/.test(priceText)) ||
    (!isDraft && priceText === "") ||
    !Number.isFinite(price) ||
    (!isDraft && price <= 0) ||
    (isDraft && price < 0) ||
    price > 99_999_999.99 ||
    (quantity !== null &&
      (!Number.isInteger(quantity) || quantity < 0 || quantity > productQuantityMax)) ||
    tooLong(input.description, productDescriptionMaxLength) ||
    tooLong(input.brand, productTextFieldMaxLength) ||
    tooLong(input.model, productTextFieldMaxLength) ||
    tooLong(input.material, productTextFieldMaxLength) ||
    !productStatuses.includes(status)
  ) {
    return { ok: false };
  }

  const optionalText = (field: unknown): string | null =>
    typeof field === "string" && field.trim() ? field.trim() : null;

  return {
    ok: true,
    data: {
      referenceCode,
      name,
      description: optionalText(input.description),
      categoryName: categoryName || (isDraft ? draftCategoryPlaceholder : ""),
      subcategoryName: subcategoryName || null,
      brand: optionalText(input.brand),
      model: optionalText(input.model),
      size,
      price: price.toFixed(2),
      quantity,
      material: optionalText(input.material),
      status,
      ...(translations.data ? { translations: translations.data } : {}),
      ...(typeof showOnHero === "boolean" ? { showOnHero } : {}),
    },
  };
}
