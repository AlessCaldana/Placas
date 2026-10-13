export type BillingAddress = {
  line1: string | null;
  line2: string | null;
  postal_code: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
};

export type BillingDetails = {
  invoiceRequested: boolean;
  businessName: string | null;
  taxIdType: string | null;
  taxId: string | null;
  address: BillingAddress | null;
};

const BUSINESS_NAME_MAX = 200;
const TAX_ID_TYPE_MAX = 16;
const TAX_ID_MAX = 64;
const ADDRESS_FIELD_MAX = 200;
const ADDRESS_FIELDS = ["line1", "line2", "postal_code", "city", "state"] as const;
// Control characters (line breaks included: every billing field is a single
// line) and invisible format characters (\p{Cf}: bidirectional overrides,
// zero-width spaces, BOM...) that could disguise the text shown in the panel.
const UNSAFE_TEXT_CHARS = /[\u0000-\u001F\u007F-\u009F\p{Cf}]/gu;
// Stripe tax ID types look like "eu_vat", "gb_vat", "ch_uid", "unknown".
const TAX_ID_TYPE = /^[a-z0-9_]+$/;
const TAX_ID_UNSAFE_CHARS = /[^A-Za-z0-9 ._-]/g;
const COUNTRY = /^[A-Z]{2}$/;

/** Single-line text without invisible characters, trimmed to `max`; null when empty. */
function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value
    .normalize("NFC")
    .replace(UNSAFE_TEXT_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
  return text || null;
}

function cleanTaxIdType(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const type = value.trim().toLowerCase();
  return type.length <= TAX_ID_TYPE_MAX && TAX_ID_TYPE.test(type) ? type : null;
}

function cleanTaxId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const taxId = value
    .replace(TAX_ID_UNSAFE_CHARS, "")
    .replace(/ +/g, " ")
    .trim()
    .slice(0, TAX_ID_MAX)
    .trim();
  return taxId || null;
}

function cleanAddress(value: unknown): BillingAddress | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const address: BillingAddress = {
    line1: null,
    line2: null,
    postal_code: null,
    city: null,
    state: null,
    country: null,
  };
  for (const field of ADDRESS_FIELDS) address[field] = cleanText(source[field], ADDRESS_FIELD_MAX);
  const country = typeof source.country === "string" ? source.country.trim().toUpperCase() : "";
  address.country = COUNTRY.test(country) ? country : null;
  return Object.values(address).some((part) => part !== null) ? address : null;
}

/**
 * Extracts the company billing details from a Stripe Checkout `customer_details`
 * object. Every value comes from the buyer, so it is sanitised and trimmed.
 * An invoice counts as requested when the buyer gave a tax ID or a business name.
 */
export function extractBillingDetails(customerDetails: unknown): BillingDetails {
  const details =
    customerDetails && typeof customerDetails === "object" && !Array.isArray(customerDetails)
      ? (customerDetails as Record<string, unknown>)
      : {};

  const businessName = cleanText(details.business_name, BUSINESS_NAME_MAX);
  const firstTaxId =
    Array.isArray(details.tax_ids) && details.tax_ids[0] && typeof details.tax_ids[0] === "object"
      ? (details.tax_ids[0] as Record<string, unknown>)
      : null;
  const taxId = cleanTaxId(firstTaxId?.value);
  const taxIdType = taxId ? cleanTaxIdType(firstTaxId?.type) : null;
  const invoiceRequested = Boolean(taxId || businessName);

  return {
    invoiceRequested,
    businessName,
    taxIdType,
    taxId,
    address: invoiceRequested ? cleanAddress(details.address) : null,
  };
}
