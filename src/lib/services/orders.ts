import type Stripe from "stripe";
import { getDb } from "@/lib/db";
import { calculateCheckoutPricing } from "@/lib/payments/checkout-pricing";
import { shippingCostFor, type ShippingCountry } from "@/lib/payments/shipping";
import { getConnectedAccountId, getStripe } from "@/lib/payments/stripe";
import { getSiteSettings } from "@/lib/services/site-settings";
import { translate, type Locale } from "@/messages";

export type CheckoutItemInput = { productId: string; quantity: number };

export class CheckoutError extends Error {
  constructor(
    readonly code:
      | "invalid_cart"
      | "shipping_unavailable"
      | "product_unavailable"
      | "insufficient_stock",
  ) {
    super(code);
  }
}

const MAX_LINES = 50;
const MAX_QUANTITY = 99;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Stripe requires at least 30 minutes; the order is released when the session expires.
const SESSION_LIFETIME_SECONDS = 30 * 60;

export function parseCheckoutItems(value: unknown): CheckoutItemInput[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_LINES) return null;
  const items: CheckoutItemInput[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return null;
    const { productId, quantity } = entry as Record<string, unknown>;
    if (typeof productId !== "string" || !UUID.test(productId)) return null;
    if (!Number.isInteger(quantity) || (quantity as number) < 1 || (quantity as number) > MAX_QUANTITY) {
      return null;
    }
    if (items.some((item) => item.productId === productId)) return null;
    items.push({ productId, quantity: quantity as number });
  }
  return items;
}

function priceToCents(price: { toFixed: (digits: number) => string }): number {
  return Number(price.toFixed(2).replace(".", ""));
}

/**
 * Creates a pending order with server-side prices and a Stripe Checkout session
 * (destination charge to the shop's connected account). Returns the payment URL.
 */
export async function startCheckout(
  items: CheckoutItemInput[],
  country: ShippingCountry,
  locale: Locale,
  siteUrl: string,
): Promise<string> {
  const db = getDb();
  const settings = await getSiteSettings();
  const shippingCents = shippingCostFor(country, settings.shippingRates);
  if (shippingCents === null) throw new CheckoutError("shipping_unavailable");

  const products = await db.product.findMany({
    where: {
      id: { in: items.map((item) => item.productId) },
      status: "PUBLISHED",
      category: { active: true },
    },
    select: { id: true, referenceCode: true, name: true, price: true, quantity: true },
  });

  const lines = items.map((item) => {
    const product = products.find((candidate) => candidate.id === item.productId);
    if (!product) throw new CheckoutError("product_unavailable");
    if (product.quantity !== null && product.quantity < item.quantity) {
      throw new CheckoutError("insufficient_stock");
    }
    return { product, quantity: item.quantity, unitPriceCents: priceToCents(product.price) };
  });

  const productsCents = lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const pricing = calculateCheckoutPricing(productsCents + shippingCents, itemCount);

  const order = await db.order.create({
    data: {
      country,
      itemCount,
      productsCents,
      shippingCents,
      platformFeeCents: pricing.platformFee,
      applicationFeeCents: pricing.applicationFeeAmount,
      totalCents: pricing.total,
      items: {
        create: lines.map((line) => ({
          productId: line.product.id,
          referenceCode: line.product.referenceCode,
          name: line.product.name,
          unitPriceCents: line.unitPriceCents,
          quantity: line.quantity,
        })),
      },
    },
    select: { id: true },
  });

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      client_reference_id: order.id,
      metadata: { orderId: order.id },
      locale,
      expires_at: Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS,
      line_items: lines.map((line) => ({
        quantity: line.quantity,
        price_data: {
          currency: "eur",
          unit_amount: line.unitPriceCents,
          product_data: { name: `${line.product.name} (${line.product.referenceCode})` },
        },
      })),
      shipping_address_collection: { allowed_countries: [country] },
      // The buyer sees products at their real price; shipping and the service
      // and payment costs are shown together as one "shipping and handling" line.
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            display_name: translate(locale, "checkout.shippingAndHandling"),
            fixed_amount: { amount: shippingCents + pricing.applicationFeeAmount, currency: "eur" },
          },
        },
      ],
      payment_intent_data: {
        application_fee_amount: pricing.applicationFeeAmount,
        transfer_data: { destination: getConnectedAccountId() },
        metadata: { orderId: order.id },
      },
      success_url: `${siteUrl}/ordine/completato?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/?checkout=annullato`,
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    await db.order.update({ where: { id: order.id }, data: { stripeSessionId: session.id } });
    return session.url;
  } catch (error) {
    await db.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
    throw error;
  }
}

function orderIdOf(session: Stripe.Checkout.Session): string | null {
  const orderId = session.metadata?.orderId ?? session.client_reference_id;
  return orderId && UUID.test(orderId) ? orderId : null;
}

/**
 * Marks a paid order and discounts stock. Idempotent: Stripe may deliver the
 * same event more than once, only the first delivery changes anything.
 */
export async function fulfillPaidSession(session: Stripe.Checkout.Session): Promise<void> {
  const orderId = orderIdOf(session);
  if (!orderId || session.payment_status !== "paid") return;
  const shipping = session.collected_information?.shipping_details ?? null;
  const paymentIntent =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;

  await getDb().$transaction(async (tx) => {
    const claimed = await tx.order.updateMany({
      where: { id: orderId, status: { in: ["PENDING", "CANCELLED"] } },
      data: {
        status: "PAID",
        paidAt: new Date(),
        stripePaymentIntent: paymentIntent ?? null,
        customerEmail: session.customer_details?.email?.slice(0, 254) ?? null,
        customerName: (shipping?.name ?? session.customer_details?.name)?.slice(0, 200) ?? null,
        shippingAddress: shipping?.address ? { ...shipping.address } : undefined,
      },
    });
    if (claimed.count === 0) return;

    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { totalCents: true, items: { select: { productId: true, quantity: true, referenceCode: true } } },
    });
    const problems: string[] = [];
    if (session.amount_total !== order.totalCents) problems.push("amount_mismatch");

    for (const item of order.items) {
      if (!item.productId) continue;
      const product = await tx.product.findUnique({
        where: { id: item.productId },
        select: { quantity: true },
      });
      if (!product || product.quantity === null) continue;
      const updated = await tx.product.updateMany({
        where: { id: item.productId, quantity: { gte: item.quantity } },
        data: { quantity: { decrement: item.quantity } },
      });
      if (updated.count === 0) problems.push(`stock:${item.referenceCode}`);
    }

    if (problems.length) {
      await tx.order.update({
        where: { id: orderId },
        data: { status: "NEEDS_REVIEW", reviewReason: problems.join(", ").slice(0, 200) },
      });
    }
  });
}

/** Releases an order whose checkout session expired or whose payment failed. */
export async function cancelSessionOrder(session: Stripe.Checkout.Session): Promise<void> {
  const orderId = orderIdOf(session);
  if (!orderId) return;
  await getDb().order.updateMany({
    where: { id: orderId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
}

export type AdminOrder = {
  id: string;
  status: "PAID" | "NEEDS_REVIEW";
  paidAt: Date | null;
  customerName: string;
  customerEmail: string;
  address: string;
  items: { name: string; referenceCode: string; quantity: number }[];
  productsCents: number;
  shippingCents: number;
  totalCents: number;
  reviewReason: string | null;
};

function formatAddress(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const address = value as Record<string, unknown>;
  const part = (key: string) => (typeof address[key] === "string" ? (address[key] as string) : "");
  return [
    part("line1"),
    part("line2"),
    [part("postal_code"), part("city"), part("state")].filter(Boolean).join(" "),
    part("country"),
  ].filter(Boolean).join(", ");
}

/** Paid orders (and those that need a manual check), newest first. */
export async function listAdminOrders(limit = 100): Promise<AdminOrder[]> {
  const orders = await getDb().order.findMany({
    where: { status: { in: ["PAID", "NEEDS_REVIEW"] } },
    orderBy: { paidAt: "desc" },
    take: limit,
    include: { items: { select: { name: true, referenceCode: true, quantity: true } } },
  });
  return orders.map((order) => ({
    id: order.id,
    status: order.status as AdminOrder["status"],
    paidAt: order.paidAt,
    customerName: order.customerName ?? "",
    customerEmail: order.customerEmail ?? "",
    address: formatAddress(order.shippingAddress),
    items: order.items,
    productsCents: order.productsCents,
    shippingCents: order.shippingCents,
    totalCents: order.totalCents,
    reviewReason: order.reviewReason,
  }));
}
