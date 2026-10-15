import { createSlidingWindowLimiter } from "@/lib/rate-limit";

// Limits on new Stripe Checkout sessions (each one also creates a PENDING
// order). Sliding windows of 10 minutes:
// - per client IP, only when the IP is trustworthy (TRUSTED_PROXY_HOPS >= 1): 5;
// - overall, one shared window whose cap depends on the request:
//   * requests with a trustworthy IP: CHECKOUT_GLOBAL_MAX_TRUSTED (150), only a
//     safety net, because each IP already has its own 5; so one attacker
//     using up their quota cannot block buyers from other addresses;
//   * requests without a trustworthy IP (no proxy configured, or a chain too
//     short): CHECKOUT_GLOBAL_MAX (30), so anonymous spam cannot fill the
//     orders table or the Stripe account, whatever the IP handling.
// Only requests with a valid cart are counted. A request that never handed a
// payment URL to the client gives its slot back: a cart refused before any
// order is created (stock, unavailable product) and a Stripe/database failure
// (the order, if created, is marked CANCELLED). Failures only give the slot
// back while there have been fewer than CHECKOUT_FAILURE_RELEASE_MAX of them in
// the window, so repeated failures (each one may leave a CANCELLED row and a
// Stripe call) are still bounded by the normal caps.

const WINDOW_MS = 10 * 60 * 1000;
export const CHECKOUT_PER_IP_MAX = 5;
export const CHECKOUT_GLOBAL_MAX = 30;
export const CHECKOUT_GLOBAL_MAX_TRUSTED = 150;
export const CHECKOUT_FAILURE_RELEASE_MAX = 10;
const GLOBAL_KEY = "global";

export function createCheckoutGuard() {
  const ipLimiter = createSlidingWindowLimiter({ max: CHECKOUT_PER_IP_MAX, windowMs: WINDOW_MS });
  // Keeps enough timestamps for the larger cap; each check passes its own cap.
  const globalLimiter = createSlidingWindowLimiter({
    max: Math.max(CHECKOUT_GLOBAL_MAX, CHECKOUT_GLOBAL_MAX_TRUSTED),
    windowMs: WINDOW_MS,
  });
  const failureLimiter = createSlidingWindowLimiter({ max: CHECKOUT_FAILURE_RELEASE_MAX, windowMs: WINDOW_MS });

  function retryAfterSeconds(ip: string | null, now = Date.now()): number {
    const globalMax = ip ? CHECKOUT_GLOBAL_MAX_TRUSTED : CHECKOUT_GLOBAL_MAX;
    return Math.max(
      globalLimiter.retryAfterSeconds(GLOBAL_KEY, now, globalMax),
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
    /** Cart refused before any order was created: give the slot back. */
    release(ip: string | null, now = Date.now()): void {
      globalLimiter.undo(GLOBAL_KEY, now);
      if (ip) ipLimiter.undo(ip, now);
    },
    /**
     * Stripe or the database failed (no payment URL handed out). Gives the slot
     * back only while failures in the window are below the cap; returns whether it did.
     */
    releaseAfterFailure(ip: string | null, now = Date.now()): boolean {
      if (failureLimiter.retryAfterSeconds(GLOBAL_KEY, now) > 0) return false;
      failureLimiter.register(GLOBAL_KEY, now);
      globalLimiter.undo(GLOBAL_KEY, now);
      if (ip) ipLimiter.undo(ip, now);
      return true;
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

export function releaseCheckoutAfterFailure(ip: string | null, now = Date.now()): boolean {
  return checkoutGuard.releaseAfterFailure(ip, now);
}
