import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { isShippingCountry } from "@/lib/payments/shipping";
import { isStripeConfigured } from "@/lib/payments/stripe";
import { CheckoutError, parseCheckoutItems, startCheckout } from "@/lib/services/orders";
import { isLocale } from "@/messages";

export const dynamic = "force-dynamic";

const errorStatus: Record<CheckoutError["code"], number> = {
  invalid_cart: 400,
  shipping_unavailable: 400,
  product_unavailable: 409,
  insufficient_stock: 409,
};

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return NextResponse.json({ error: "invalid_request" }, { status: 403 });
  }
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!isDatabaseConfigured() || !isStripeConfigured() || !siteUrl) {
    return NextResponse.json({ error: "payments_unavailable" }, { status: 503 });
  }

  const body: unknown = await request.json().catch(() => null);
  const fields = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const items = parseCheckoutItems(fields.items);
  const country = fields.country;
  const locale = typeof fields.locale === "string" && isLocale(fields.locale) ? fields.locale : "it";
  if (!items || !isShippingCountry(country)) {
    return NextResponse.json({ error: "invalid_cart" }, { status: 400 });
  }

  try {
    const url = await startCheckout(items, country, locale, siteUrl);
    return NextResponse.json({ url });
  } catch (error) {
    if (error instanceof CheckoutError) {
      return NextResponse.json({ error: error.code }, { status: errorStatus[error.code] });
    }
    console.error("checkout_failed", error);
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }
}
