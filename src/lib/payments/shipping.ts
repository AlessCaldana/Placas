// Shipping zones and the countries the shop ships to. The price comes from the
// Mondial Relay table (shipping-table.ts); the zone settings only switch Italy and
// the rest of the EU on (any stored value) or off (null).
import { TABLE_COUNTRIES } from "@/lib/payments/shipping-table";

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

/** Whether the zone of the country is switched on in the settings. */
export function isZoneEnabled(country: ShippingCountry, rates: ShippingRates): boolean {
  return rates[shippingZoneFor(country)] !== null;
}

/** Countries with a price in the shipping table whose zone is switched on. */
export function availableShippingCountries(rates: ShippingRates): ShippingCountry[] {
  return SHIPPING_COUNTRIES.filter(
    (country) => (TABLE_COUNTRIES as readonly string[]).includes(country) && isZoneEnabled(country, rates),
  );
}
