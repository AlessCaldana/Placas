import { createSlidingWindowLimiter } from "@/lib/rate-limit";

// Limits on new Stripe Checkout sessions (each one also creates a PENDING
// order). Sliding windows of 10 minutes:
// - per client IP, only when the IP is trustworthy (TRUSTED_PROXY_HOPS >= 1): 5;
// - overall: 30, so anonymous spam cannot fill the orders table or the Stripe
//   account, whatever the IP handling.
// Only requests with a valid cart are counted, and a cart refused before any
// order is created (stock, unavailable product) gives its slot back.

const WINDOW_MS = 10 * 60 * 1000;
export const CHECKOUT_PER_IP_MAX = 5;
export const CHECKOUT_GLOBAL_MAX = 30;
const GLOBAL_KEY = "global";

export function createCheckoutGuard() {
  const ipLimiter = createSlidingWindowLimiter({ max: CHECKOUT_PER_IP_MAX, windowMs: WINDOW_MS });
  const globalLimiter = createSlidingWindowLimiter({ max: CHECKOUT_GLOBAL_MAX, windowMs: WINDOW_MS });

  function retryAfterSeconds(ip: string | null, now = Date.now()): number {
    return Math.max(
      globalLimiter.retryAfterSeconds(GLOBAL_KEY, now),
      ip ? ipLimiter.retryAfterSeconds(ip, now) : 0,
    );
  }

  return {
    retryAfterSeconds,
    /** Checks and reserves one session in a single synchronous step: 0 when reserved, else seconds to wait. */
    begin(ip: string | null, now = Date.now()): number {
      const retryAfter = retryAfterSeconds(ip, now);
      if (retryAfter > 0) return retryAfter;
      globalLimiter.register(GLOBAL_KEY, now);
      if (ip) ipLimiter.register(ip, now);
      return 0;
    },
    /** No order was created (cart refused): give the slot back. */
    release(ip: string | null, now = Date.now()): void {
      globalLimiter.undo(GLOBAL_KEY, now);
      if (ip) ipLimiter.undo(ip, now);
    },
  };
}

const checkoutGuard = createCheckoutGuard();

export function checkoutRetryAfterSeconds(ip: string | null, now = Date.now()): number {
  return checkoutGuard.retryAfterSeconds(ip, now);
}

export function beginCheckoutAttempt(ip: string | null, now = Date.now()): number {
  return checkoutGuard.begin(ip, now);
}

export function releaseCheckoutAttempt(ip: string | null, now = Date.now()): void {
  checkoutGuard.release(ip, now);
}
