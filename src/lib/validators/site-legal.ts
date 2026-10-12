/**
 * Seller legal data shown in the public footer (D.Lgs. 70/2003 art. 7).
 * Every field is optional; "" means "not set" (stored as NULL).
 */
export type SiteLegalInfo = {
  legalName: string;
  vatNumber: string;
  taxCode: string;
  legalAddress: string;
  pecEmail: string;
  reaNumber: string;
};

export type SiteLegalField = keyof SiteLegalInfo;

export const siteLegalFields = [
  "legalName",
  "vatNumber",
  "taxCode",
  "legalAddress",
  "pecEmail",
  "reaNumber",
] as const satisfies readonly SiteLegalField[];

/** Max lengths, matching the VARCHAR sizes in prisma/schema.prisma (SiteSetting). */
export const siteLegalMaxLength: Record<SiteLegalField, number> = {
  legalName: 160,
  vatNumber: 20,
  taxCode: 20,
  legalAddress: 255,
  pecEmail: 254,
  reaNumber: 40,
};

export function emptySiteLegalInfo(): SiteLegalInfo {
  return { legalName: "", vatNumber: "", taxCode: "", legalAddress: "", pecEmail: "", reaNumber: "" };
}

export type SiteLegalParseResult =
  | { ok: true; value: Partial<SiteLegalInfo> }
  | { ok: false; field: SiteLegalField };

// Raw input larger than this is rejected before any normalisation work.
const RAW_MAX = 1024;
// Control (Cc) and format (Cf: bidi overrides, zero-width…) characters.
const FORBIDDEN_CHARACTERS = /[\p{Cc}\p{Cf}]/u;
const ITALIAN_VAT = /^(?:IT)?(\d{11})$/;
const EU_VAT = /^[A-Z]{2}[0-9A-Z]{2,13}$/;
const TAX_CODE = /^[A-Z0-9]{11,16}$/;
const EMAIL = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

function collapseText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeFreeText(value: string, max: number): string | null {
  const text = collapseText(value);
  if (text.length > max || FORBIDDEN_CHARACTERS.test(text)) return null;
  return text;
}

/** "" | Italian Partita IVA (→ 11 digits) | other EU VAT number with country prefix. */
export function normalizeVatNumber(value: string): string | null {
  const compact = value.replace(/\s+/g, "").toUpperCase();
  if (!compact) return "";
  const italian = ITALIAN_VAT.exec(compact);
  if (italian) return italian[1];
  // An "IT" prefix must be followed by exactly 11 digits (handled above).
  if (compact.startsWith("IT")) return null;
  return EU_VAT.test(compact) ? compact : null;
}

/** "" | Italian codice fiscale (16 chars for people, 11 digits for companies). */
export function normalizeTaxCode(value: string): string | null {
  const compact = value.replace(/\s+/g, "").toUpperCase();
  if (!compact) return "";
  return TAX_CODE.test(compact) ? compact : null;
}

export function normalizePecEmail(value: string): string | null {
  const email = value.trim();
  if (!email) return "";
  return email.length <= siteLegalMaxLength.pecEmail && EMAIL.test(email) ? email : null;
}

function normalizeField(field: SiteLegalField, value: string): string | null {
  switch (field) {
    case "vatNumber":
      return normalizeVatNumber(value);
    case "taxCode":
      return normalizeTaxCode(value);
    case "pecEmail":
      return normalizePecEmail(value);
    default:
      return normalizeFreeText(value, siteLegalMaxLength[field]);
  }
}

/**
 * Validates and normalises the legal fields sent by the settings form.
 * A field that is absent (`undefined` / `null`, e.g. an older form that does not
 * send it) is left out of the result so the caller keeps the stored value.
 * Non-string values (e.g. a File) are invalid. Returns the first invalid field.
 */
export function parseSiteLegalInput(input: Partial<Record<SiteLegalField, unknown>>): SiteLegalParseResult {
  const value: Partial<SiteLegalInfo> = {};
  for (const field of siteLegalFields) {
    const raw = input[field];
    if (raw === undefined || raw === null) continue;
    if (typeof raw !== "string" || raw.length > RAW_MAX) return { ok: false, field };
    const normalized = normalizeField(field, raw);
    if (normalized === null) return { ok: false, field };
    value[field] = normalized;
  }
  return { ok: true, value };
}
