import { createHash, timingSafeEqual } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { normalizeOrderNumber } from "@/lib/order-number";
import { formatAddress } from "@/lib/services/orders";
import { buildTrackingUrl, findCarrier } from "@/lib/shipping-carriers";
import { isCheckoutSessionId, isUuid } from "@/lib/validators/review";
import { parseShipmentInput, type ShipmentInput } from "@/lib/validators/shipment";
import { isLocale, type Locale } from "@/messages";

export { normalizeOrderNumber, parseShipmentInput };
export type { ShipmentInput };

export type ShipmentOrder = {
  id: string;
  orderNumber: string;
  paidAt: string | null;
  customerName: string;
  customerEmail: string;
  /** E.164 phone collected at checkout, null for older orders or when missing. */
  customerPhone: string | null;
  /** Language the buyer used at checkout ("it" when unknown). */
  locale: Locale;
  address: string;
  items: { name: string; referenceCode: string; quantity: number }[];
  productsCents: number;
  shippingCents: number;
  carrier: string | null;
  carrierName: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippedAt: string | null;
  status: "PAID" | "NEEDS_REVIEW";
};

export type PublicTracking = {
  orderNumber: string;
  status: "preparing" | "shipped";
  paidAt: string | null;
  shippedAt: string | null;
  carrierName: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  items: { name: string; quantity: number }[];
};

// Only orders whose payment went through can be shipped or tracked.
const SHIPPABLE_STATUSES = ["PAID", "NEEDS_REVIEW"] as const;
const MAX_TO_SHIP = 500;
const MAX_SHIPPED = 200;

const shipmentOrderSelect = {
  id: true,
  orderNumber: true,
  status: true,
  paidAt: true,
  customerName: true,
  customerEmail: true,
  customerPhone: true,
  locale: true,
  shippingAddress: true,
  productsCents: true,
  shippingCents: true,
  carrier: true,
  trackingNumber: true,
  trackingUrl: true,
  shippedAt: true,
  items: { select: { name: true, referenceCode: true, quantity: true } },
} satisfies Prisma.OrderSelect;

type ShipmentOrderRow = Prisma.OrderGetPayload<{ select: typeof shipmentOrderSelect }>;

function carrierNameOf(carrier: string | null): string | null {
  return findCarrier(carrier)?.name ?? null;
}

/** Stored order locale, falling back to Italian when missing or unknown. */
export function shipmentLocale(value: string | null): Locale {
  return value !== null && isLocale(value) ? value : "it";
}

function toShipmentOrder(row: ShipmentOrderRow): ShipmentOrder {
  return {
    id: row.id,
    orderNumber: row.orderNumber ?? "",
    paidAt: row.paidAt?.toISOString() ?? null,
    customerName: row.customerName ?? "",
    customerEmail: row.customerEmail ?? "",
    customerPhone: row.customerPhone,
    locale: shipmentLocale(row.locale),
    address: formatAddress(row.shippingAddress),
    items: row.items,
    productsCents: row.productsCents,
    shippingCents: row.shippingCents,
    carrier: row.carrier,
    carrierName: carrierNameOf(row.carrier),
    trackingNumber: row.trackingNumber,
    trackingUrl: buildTrackingUrl(row.carrier, row.trackingNumber, row.trackingUrl),
    shippedAt: row.shippedAt?.toISOString() ?? null,
    status: row.status as ShipmentOrder["status"],
  };
}

/** Orders waiting to be shipped (oldest payment first) and the latest shipped ones. */
export async function listShipmentOrders(): Promise<{ toShip: ShipmentOrder[]; shipped: ShipmentOrder[] }> {
  const db = getDb();
  const [toShip, shipped] = await Promise.all([
    db.order.findMany({
      where: { status: { in: [...SHIPPABLE_STATUSES] }, shippedAt: null },
      orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
      take: MAX_TO_SHIP,
      select: shipmentOrderSelect,
    }),
    db.order.findMany({
      where: { status: { in: [...SHIPPABLE_STATUSES] }, shippedAt: { not: null } },
      orderBy: { shippedAt: "desc" },
      take: MAX_SHIPPED,
      select: shipmentOrderSelect,
    }),
  ]);
  return { toShip: toShip.map(toShipmentOrder), shipped: shipped.map(toShipmentOrder) };
}

async function updateShippableOrder(
  orderId: string,
  data: (current: { shippedAt: Date | null }) => Prisma.OrderUpdateInput,
): Promise<ShipmentOrder | null> {
  if (!isUuid(orderId)) return null;
  const db = getDb();
  const current = await db.order.findFirst({
    where: { id: orderId, status: { in: [...SHIPPABLE_STATUSES] } },
    select: { shippedAt: true },
  });
  if (!current) return null;
  try {
    const row = await db.order.update({
      where: { id: orderId },
      data: data(current),
      select: shipmentOrderSelect,
    });
    return toShipmentOrder(row);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return null;
    throw error;
  }
}

/**
 * Marks a paid order as shipped. Editing an order that was already shipped
 * updates the carrier data and keeps the original shipping date.
 * Returns null when the order does not exist or was not paid.
 */
export async function markOrderShipped(
  orderId: string,
  input: ShipmentInput,
): Promise<ShipmentOrder | null> {
  return updateShippableOrder(orderId, (current) => ({
    carrier: input.carrier,
    trackingNumber: input.trackingNumber,
    // Known carriers get their link built from the code when it is read.
    trackingUrl: input.carrier === "other" ? input.trackingUrl : null,
    shippedAt: current.shippedAt ?? new Date(),
  }));
}

/** Undoes a shipment: the order goes back to the "to ship" list. */
export async function clearOrderShipment(orderId: string): Promise<ShipmentOrder | null> {
  return updateShippableOrder(orderId, () => ({
    carrier: null,
    trackingNumber: null,
    trackingUrl: null,
    shippedAt: null,
  }));
}

function emailDigest(email: string): Buffer {
  return createHash("sha256").update(email.trim().toLowerCase()).digest();
}

// Compared even when the order does not exist, so both failures take the same work.
const NO_EMAIL_DIGEST = emailDigest("\u0000no-order");

/**
 * Public order status for the buyer. Needs the order number and the email
 * used at checkout; a wrong email and an unknown number both return null.
 */
export async function lookupOrderTracking(
  orderNumber: string,
  email: string,
): Promise<PublicTracking | null> {
  const normalized = normalizeOrderNumber(orderNumber);
  if (!normalized || typeof email !== "string") return null;
  const order = await getDb().order.findUnique({
    where: { orderNumber: normalized },
    select: {
      orderNumber: true,
      status: true,
      customerEmail: true,
      paidAt: true,
      carrier: true,
      trackingNumber: true,
      trackingUrl: true,
      shippedAt: true,
      items: { select: { name: true, quantity: true } },
    },
  });

  const expected = order?.customerEmail ? emailDigest(order.customerEmail) : NO_EMAIL_DIGEST;
  const emailMatches = timingSafeEqual(emailDigest(email), expected);
  if (!order || !order.customerEmail || !emailMatches) return null;
  if (!(SHIPPABLE_STATUSES as readonly string[]).includes(order.status)) return null;

  const shipped = order.shippedAt !== null;
  return {
    orderNumber: order.orderNumber ?? normalized,
    status: shipped ? "shipped" : "preparing",
    paidAt: order.paidAt?.toISOString() ?? null,
    shippedAt: order.shippedAt?.toISOString() ?? null,
    carrierName: shipped ? carrierNameOf(order.carrier) : null,
    trackingNumber: shipped ? order.trackingNumber : null,
    trackingUrl: shipped ? buildTrackingUrl(order.carrier, order.trackingNumber, order.trackingUrl) : null,
    items: order.items,
  };
}

/** Order number for the thank-you page, from the Stripe Checkout session id. */
export async function getOrderNumberForSession(sessionId: string): Promise<string | null> {
  if (!isCheckoutSessionId(sessionId)) return null;
  const order = await getDb().order.findUnique({
    where: { stripeSessionId: sessionId },
    select: { orderNumber: true },
  });
  return order?.orderNumber ?? null;
}
