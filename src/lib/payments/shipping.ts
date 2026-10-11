// Shipping zones and the countries the shop ships to. Prices live in site settings.

export type ShippingZone = "IT" | "EU" | "WORLD";

export type ShippingRates = Record<ShippingZone, number | null>;

// EU member states other than Italy.
export const EU_COUNTRIES = [
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR",
  "HU", "IE", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK",
] as const;

// Countries outside the EU the shop accepts. Extend this list to ship further.
export const WORLD_COUNTRIES = ["CH", "GB", "NO", "US", "CA", "AU"] as const;

export const SHIPPING_COUNTRIES = ["IT", ...EU_COUNTRIES, ...WORLD_COUNTRIES] as const;
export type ShippingCountry = (typeof SHIPPING_COUNTRIES)[number];

export function isShippingCountry(value: unknown): value is ShippingCountry {
  return typeof value === "string" && (SHIPPING_COUNTRIES as readonly string[]).includes(value);
}

export function shippingZoneFor(country: ShippingCountry): ShippingZone {
  if (country === "IT") return "IT";
  return (EU_COUNTRIES as readonly string[]).includes(country) ? "EU" : "WORLD";
}

/** Shipping price in cents, or `null` when the shop does not ship there. */
export function shippingCostFor(country: ShippingCountry, rates: ShippingRates): number | null {
  return rates[shippingZoneFor(country)];
}

/** Countries with a configured shipping price. */
export function availableShippingCountries(rates: ShippingRates): ShippingCountry[] {
  return SHIPPING_COUNTRIES.filter((country) => shippingCostFor(country, rates) !== null);
}
