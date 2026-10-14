import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/payments/stripe";
import { BODY_LIMITS, bodyErrorResponse, readBoundedText } from "@/lib/request-body";
import { cancelSessionOrder, fulfillPaidSession } from "@/lib/services/orders";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // The signature is computed over the raw body, so read it as text. The size
  // is capped before verifying, so an unsigned request cannot make us buffer
  // an arbitrary amount.
  const read = await readBoundedText(request, BODY_LIMITS.stripeWebhook);
  if (!read.ok) return bodyErrorResponse(read.error);
  const payload = read.text;
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, secret);
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await fulfillPaidSession(event.data.object);
        break;
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed":
        await cancelSessionOrder(event.data.object);
        break;
    }
  } catch (error) {
    console.error("stripe_webhook_failed", event.type, event.id, error);
    // A 5xx makes Stripe retry the delivery later.
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
