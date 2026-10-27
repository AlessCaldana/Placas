// Carriers PFdeco can choose when marking an order as shipped. Known carriers
// build their public tracking link from the code; "other" uses the https link
// typed by PFdeco.

export type CarrierId = "bpost" | "mondial_relay" | "dpd" | "gls" | "fedex" | "ups" | "dhl" | "other";

export type Carrier = {
  id: CarrierId;
  name: string;
  /** Public tracking page for the code, or null when the carrier has no automatic link. */
  trackingUrl: (code: string) => string | null;
};

const MAX_TRACKING_URL_LENGTH = 500;

const code = (value: string) => encodeURIComponent(value);

export const CARRIERS: readonly Carrier[] = [
  {
    id: "bpost",
    name: "bpost",
    // URL verificada el 2026-10-27; con el código postal se ven todos los detalles
    trackingUrl: (value) => `https://track.bpost.cloud/btr/web/#/search?itemCode=${code(value)}&lang=en`,
  },
  {
    id: "mondial_relay",
    name: "Mondial Relay",
    // URL verificada el 2026-10-27; rellena el número y el cliente añade su código postal
    trackingUrl: (value) => `https://www.mondialrelay.be/fr-be/suivi-de-colis/?numeroExpedition=${code(value)}`,
  },
  {
    id: "dpd",
    name: "DPD",
    // URL documentada por DPD Belgium (it-integration.dpd.be) el 2026-10-27
    trackingUrl: (value) => `https://www.dpdgroup.com/be/mydpd/my-parcels/search?lang=en&parcelNumber=${code(value)}`,
  },
  {
    id: "gls",
    name: "GLS",
    // URL verificada el 2026-10-27
    trackingUrl: (value) => `https://gls-group.eu/BE/en/track-trace/?match=${code(value)}`,
  },
  {
    id: "fedex",
    name: "FedEx",
    // URL verificada el 2026-10-12
    trackingUrl: (value) => `https://www.fedex.com/fedextrack/?trknbr=${code(value)}`,
  },
  {
    id: "ups",
    name: "UPS",
    // URL verificada el 2026-10-12
    trackingUrl: (value) => `https://www.ups.com/track?loc=it_IT&tracknum=${code(value)}`,
  },
  {
    id: "dhl",
    name: "DHL Express",
    // URL verificada el 2026-10-27
    trackingUrl: (value) => `https://www.dhl.com/be-en/home/tracking.html?submit=1&tracking-id=${code(value)}`,
  },
  {
    id: "other",
    name: "Altro",
    trackingUrl: () => null,
  },
];

export function findCarrier(id: unknown): Carrier | null {
  return CARRIERS.find((carrier) => carrier.id === id) ?? null;
}

/**
 * Returns the URL normalised when it is an absolute https:// link without
 * credentials and at most 500 characters long, otherwise null.
 */
export function normalizeHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_TRACKING_URL_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
  const href = url.href;
  return href.length <= MAX_TRACKING_URL_LENGTH ? href : null;
}

/**
 * Tracking link shown to the buyer: built from the code for known carriers,
 * the validated custom link for "other", null when there is none.
 */
export function buildTrackingUrl(
  carrier: string | null | undefined,
  trackingNumber: string | null | undefined,
  customUrl: string | null | undefined,
): string | null {
  const found = findCarrier(carrier);
  if (!found) return null;
  if (found.id === "other") return normalizeHttpsUrl(customUrl);
  if (!trackingNumber) return null;
  return found.trackingUrl(trackingNumber);
}
