import { NextResponse, after } from "next/server";
import {
  beginCheckoutAttempt,
  checkoutRetryAfterSeconds,
  releaseCheckoutAttempt,
} from "@/lib/checkout-rate-limit";
import { isDatabaseConfigured } from "@/lib/db";
import { isShippingCountry } from "@/lib/payments/shipping";
import { isStripeConfigured } from "@/lib/payments/stripe";
import { clientIp } from "@/lib/rate-limit";
import { BODY_LIMITS, bodyErrorResponse, readBoundedJson } from "@/lib/request-body";
import {
  CheckoutError,
  maybeDeleteStaleUnpaidOrders,
  parseCheckoutItems,
  startCheckout,
} from "@/lib/services/orders";
import { isLocale } from "@/messages";
import { isCrossOriginRequest } from "@/lib/request-origin";

export const dynamic = "force-dynamic";

const errorStatus: Record<CheckoutError["code"], number> = {
  invalid_cart: 400,
  shipping_unavailable: 400,
  product_unavailable: 409,
  insufficient_stock: 409,
};

function tooManyRequests(retryAfter: number) {
  return NextResponse.json(
    { error: "too_many_requests" },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

export async function POST(request: Request) {
  if (isCrossOriginRequest(request)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 403 });
  }
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!isDatabaseConfigured() || !isStripeConfigured() || !siteUrl) {
    return NextResponse.json({ error: "payments_unavailable" }, { status: 503 });
  }

  // Cheap check before reading the body.
  const ip = clientIp(request);
  const precheck = checkoutRetryAfterSeconds(ip);
  if (precheck > 0) return tooManyRequests(precheck);

  const read = await readBoundedJson(request, BODY_LIMITS.smallJson);
  if (!read.ok) return bodyErrorResponse(read.error);
  const fields =
    read.value && typeof read.value === "object" ? (read.value as Record<string, unknown>) : {};
  const items = parseCheckoutItems(fields.items);
  const country = fields.country;
  const locale = typeof fields.locale === "string" && isLocale(fields.locale) ? fields.locale : "it";
  if (!items || !isShippingCountry(country)) {
    return NextResponse.json({ error: "invalid_cart" }, { status: 400 });
  }

  // Check and reserve synchronously, so parallel requests cannot all pass.
  const retryAfter = beginCheckoutAttempt(ip);
  if (retryAfter > 0) return tooManyRequests(retryAfter);

  // Housekeeping after the response: old unpaid orders (at most once per hour).
  after(() => maybeDeleteStaleUnpaidOrders());

  try {
    const url = await startCheckout(items, country, locale, siteUrl);
    return NextResponse.json({ url });
  } catch (error) {
    if (error instanceof CheckoutError) {
      // Refused before any order was created: the slot is given back.
      releaseCheckoutAttempt(ip);
      return NextResponse.json({ error: error.code }, { status: errorStatus[error.code] });
    }
    console.error("checkout_failed", error);
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }
}
