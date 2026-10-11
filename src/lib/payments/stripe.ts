import Stripe from "stripe";

let client: Stripe | null = null;

/** True when the keys needed to take online payments are present. */
export function isStripeConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_WEBHOOK_SECRET &&
      process.env.STRIPE_CONNECTED_ACCOUNT_ID?.startsWith("acct_"),
  );
}

// Created lazily so a missing key never breaks the build.
export function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY no está definida. Revisa tu archivo .env");
  client ??= new Stripe(secretKey);
  return client;
}

/** The shop's connected account that receives the merchant amount. */
export function getConnectedAccountId(): string {
  const accountId = process.env.STRIPE_CONNECTED_ACCOUNT_ID;
  if (!accountId?.startsWith("acct_")) {
    throw new Error("STRIPE_CONNECTED_ACCOUNT_ID no está definida. Revisa tu archivo .env");
  }
  return accountId;
}
