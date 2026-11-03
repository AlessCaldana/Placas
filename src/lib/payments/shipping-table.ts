// Shipping price per order from the destination country and the parcel weight.
// Source: Mondial Relay "Point Relais" prices from Belgium, VAT included
// (mondialrelay.be, read 2026-11-03). The shop charges the next half euro above
// each price (3.80 € → 4.00 €, 5.00 € → 5.50 €): the carrier price goes to the
// merchant, the rounding margin to the platform.

/** Upper limit of each weight bracket in grams; a parcel pays the first bracket it fits in. */
export const PARCEL_BRACKETS_GRAMS = [500, 1000, 2000, 4000, 10000, 25000] as const;

/** Mondial Relay price in cents for each bracket of PARCEL_BRACKETS_GRAMS. */
const MONDIAL_RELAY_CENTS = {
  BE: [380, 430, 440, 500, 730, 1960],
  LU: [440, 440, 510, 550, 780, 1980],
  NL: [440, 480, 510, 550, 780, 1980],
  FR: [460, 550, 650, 730, 980, 2200],
  IT: [670, 730, 790, 900, 1260, 2590],
  ES: [670, 730, 790, 900, 1260, 2590],
  PT: [670, 730, 790, 900, 1260, 2590],
  PL: [730, 1050, 1100, 1350, 1990, 2970],
} as const satisfies Record<string, readonly number[]>;

export type TableCountry = keyof typeof MONDIAL_RELAY_CENTS;

/** Countries with a price in the table, in the order shown to the admin. */
export const TABLE_COUNTRIES = Object.keys(MONDIAL_RELAY_CENTS) as TableCountry[];

// Weight estimate until the real parcels are weighed: steel plate about
// 0.3 g per cm², plus the box and corner protection.
const PACKAGING_GRAMS = 200;
const PLATE_GRAMS_PER_CM2 = 0.3;
const MIN_PLATE_GRAMS = 100;
const UNKNOWN_SIZE_GRAMS = 250;

export function isTableCountry(country: string): country is TableCountry {
  return Object.hasOwn(MONDIAL_RELAY_CENTS, country);
}

/** Next half euro strictly above the price: 380 → 400, 500 → 550. */
export function roundUpToNextHalfEuro(cents: number): number {
  return (Math.floor(cents / 50) + 1) * 50;
}

/** Estimated weight of one plate from its size text ("20 x 30 cm", "35×35 cm"). */
export function plateGrams(size: string | null | undefined): number {
  const match = /(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/i.exec(size ?? "");
  if (!match) return UNKNOWN_SIZE_GRAMS;
  const area = Number(match[1].replace(",", ".")) * Number(match[2].replace(",", "."));
  return Math.max(MIN_PLATE_GRAMS, Math.round(area * PLATE_GRAMS_PER_CM2));
}

/** Estimated weight of the packed parcel in grams. */
export function estimateParcelGrams(lines: { size: string | null | undefined; quantity: number }[]): number {
  return lines.reduce((sum, line) => sum + plateGrams(line.size) * line.quantity, PACKAGING_GRAMS);
}

/** Price the shop charges for one bracket of a country, in cents. */
export function tablePriceCents(country: TableCountry, bracketIndex: number): number {
  return roundUpToNextHalfEuro(MONDIAL_RELAY_CENTS[country][bracketIndex]);
}

export type ShippingQuote = {
  /** Mondial Relay price: what the merchant needs to pay the carrier. */
  carrierCents: number;
  /** Charged to the customer: the carrier price rounded up to the next half euro. */
  chargedCents: number;
};

/** Shipping quote in cents, or null when the country is not in the table or the parcel is too heavy. */
export function shippingQuoteFor(country: string, grams: number): ShippingQuote | null {
  if (!isTableCountry(country)) return null;
  const bracketIndex = PARCEL_BRACKETS_GRAMS.findIndex((limit) => grams <= limit);
  if (bracketIndex === -1) return null;
  const carrierCents = MONDIAL_RELAY_CENTS[country][bracketIndex];
  return { carrierCents, chargedCents: roundUpToNextHalfEuro(carrierCents) };
}

/** Price charged to the customer in cents, or null when there is no quote. */
export function shippingPriceFor(country: string, grams: number): number | null {
  return shippingQuoteFor(country, grams)?.chargedCents ?? null;
}
