import { normalizeOrderNumber } from "@/lib/order-number";
import { findCarrier, normalizeHttpsUrl, type CarrierId } from "@/lib/shipping-carriers";

export type ShipmentInput = {
  carrier: CarrierId;
  trackingNumber: string;
  trackingUrl: string | null;
};

export type TrackingLookupInput = { orderNumber: string; email: string };

const TRACKING_NUMBER = /^[A-Za-z0-9 -]{4,64}$/;
const HAS_ALPHANUMERIC = /[A-Za-z0-9]/;
const EMAIL_MAX = 254;
const EMAIL = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseTrackingNumber(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 256) return null;
  const trackingNumber = value.trim().replace(/\s+/g, " ");
  return TRACKING_NUMBER.test(trackingNumber) && HAS_ALPHANUMERIC.test(trackingNumber)
    ? trackingNumber
    : null;
}

/**
 * Validates the admin shipment body `{ carrier, trackingNumber, trackingUrl? }`.
 * trackingUrl is required (https://) for "other" and ignored for known carriers,
 * whose link is built from the code.
 */
export function parseShipmentInput(value: unknown): ShipmentInput | null {
  if (!isPlainObject(value)) return null;
  const carrier = findCarrier(value.carrier);
  if (!carrier) return null;
  const trackingNumber = parseTrackingNumber(value.trackingNumber);
  if (!trackingNumber) return null;
  if (carrier.id !== "other") return { carrier: carrier.id, trackingNumber, trackingUrl: null };
  const trackingUrl = normalizeHttpsUrl(value.trackingUrl);
  return trackingUrl ? { carrier: carrier.id, trackingNumber, trackingUrl } : null;
}

export function parseEmail(value: unknown): string | null {
  if (typeof value !== "string" || value.length > EMAIL_MAX * 2) return null;
  const email = value.trim();
  return email.length <= EMAIL_MAX && EMAIL.test(email) ? email : null;
}

/** Validates the public tracking lookup body `{ orderNumber, email }`. */
export function parseTrackingLookupInput(value: unknown): TrackingLookupInput | null {
  if (!isPlainObject(value)) return null;
  const orderNumber = normalizeOrderNumber(value.orderNumber);
  const email = parseEmail(value.email);
  return orderNumber && email ? { orderNumber, email } : null;
}
