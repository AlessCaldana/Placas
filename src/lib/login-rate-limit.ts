import { clientKey, createRateLimiter } from "@/lib/rate-limit";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const GLOBAL_KEY = "global";

// In-memory limiters for admin login attempts: 5 failures per client and
// 30 failures in total per 15 minutes, so a distributed brute force that
// rotates addresses is also slowed down.
const loginLimiter = createRateLimiter({ max: 5, windowMs: LOGIN_WINDOW_MS });
const globalLoginLimiter = createRateLimiter({ max: 30, windowMs: LOGIN_WINDOW_MS });

/** Seconds until the key may try again, or 0 when it is not blocked. */
export function loginRetryAfterSeconds(key: string, now = Date.now()): number {
  return Math.max(
    loginLimiter.retryAfterSeconds(key, now),
    globalLoginLimiter.retryAfterSeconds(GLOBAL_KEY, now),
  );
}

export function registerFailedLogin(key: string, now = Date.now()): void {
  loginLimiter.register(key, now);
  globalLoginLimiter.register(GLOBAL_KEY, now);
}

/** Forgets the failures of the key. The global count expires with its window. */
export function clearFailedLogins(key: string): void {
  loginLimiter.clear(key);
}

export function loginClientKey(request: Request): string {
  return clientKey(request);
}
