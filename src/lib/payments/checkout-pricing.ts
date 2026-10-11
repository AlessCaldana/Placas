// Pricing for Stripe Connect destination charges. All amounts are integer euro cents.
//
// The customer pays everything: merchant amount (products + shipping), the
// platform fee and Stripe's fee. With destination charges Stripe debits its fee
// from the platform, so the application fee must cover the platform fee AND
// Stripe's fee: applicationFee = total - merchantAmount.

export const PLATFORM_FEE_PER_ITEM_CENTS = 100;
export const PLATFORM_FEE_CAP_CENTS = 300;
// Safety margin: price every card as if it were a non-EEA card (3.25 % + 0.25 €),
// so the platform never loses money. With EEA cards (1.5 %) the difference stays
// with the platform. Rates are in basis points (1 % = 100).
export const STRIPE_FEE_RATE_BPS = 325;
export const STRIPE_FIXED_CENTS = 25;

export type CheckoutPricing = {
  /** What the merchant must receive (products + shipping). */
  merchantAmount: number;
  /** Platform fee: 1 € per item, max 3 € per order. */
  platformFee: number;
  /** Worst-case Stripe fee covered by the price. */
  estimatedStripeFee: number;
  /** Charged to the customer. */
  total: number;
  /** Pass to Stripe as `application_fee_amount` (= total - merchantAmount). */
  applicationFeeAmount: number;
};

export function estimateStripeFee(totalCents: number): number {
  return Math.round((totalCents * STRIPE_FEE_RATE_BPS) / 10_000) + STRIPE_FIXED_CENTS;
}

export function calculatePlatformFee(itemCount: number): number {
  return Math.min(itemCount * PLATFORM_FEE_PER_ITEM_CENTS, PLATFORM_FEE_CAP_CENTS);
}

export function calculateCheckoutPricing(merchantAmount: number, itemCount: number): CheckoutPricing {
  if (!Number.isSafeInteger(merchantAmount) || merchantAmount <= 0) {
    throw new RangeError("merchantAmount must be a positive integer number of cents");
  }
  if (!Number.isSafeInteger(itemCount) || itemCount < 1) {
    throw new RangeError("itemCount must be a positive integer");
  }

  const platformFee = calculatePlatformFee(itemCount);
  // total = ceil((merchant + platformFee + fixed fee) / (1 - rate)), in integer arithmetic.
  const numerator = (merchantAmount + platformFee + STRIPE_FIXED_CENTS) * 10_000;
  const divisor = 10_000 - STRIPE_FEE_RATE_BPS;
  let total = Math.floor((numerator + divisor - 1) / divisor);
  // Stripe rounds its own fee; bump by a cent if rounding would eat into the platform fee.
  while (total - estimateStripeFee(total) - merchantAmount < platformFee) total += 1;

  return {
    merchantAmount,
    platformFee,
    estimatedStripeFee: estimateStripeFee(total),
    total,
    applicationFeeAmount: total - merchantAmount,
  };
}
