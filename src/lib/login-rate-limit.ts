import { clientKey, createRateLimiter } from "@/lib/rate-limit";

// In-memory limits for admin login attempts (per server process, 15-minute
// windows). Three counters:
// - per client IP: 5 failures;
// - per account (normalized email): alert threshold of 10 failures;
// - global: alert threshold of 30 failures.
// The account and global counters never block by themselves, so an attacker
// cannot lock the real owner out by failing on purpose. When either reaches its
// threshold the panel is "under attack" and every IP gets a single failure per
// window instead of 5: a distributed brute force is slowed down to one guess
// per address, while the owner (from an address with no recent failures) can
// still sign in.
//
// Attempts are reserved before the password is verified (scrypt is slow), so
// parallel requests cannot all pass the check; a successful login releases
// the reservation.

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const GLOBAL_KEY = "global";
const IP_MAX = 5;
const IP_MAX_UNDER_ATTACK = 1;
const ACCOUNT_ALERT = 10;
const GLOBAL_ALERT = 30;

const ipLimiter = createRateLimiter({ max: IP_MAX, windowMs: LOGIN_WINDOW_MS });
const accountLimiter = createRateLimiter({ max: ACCOUNT_ALERT, windowMs: LOGIN_WINDOW_MS });
const globalLimiter = createRateLimiter({ max: GLOBAL_ALERT, windowMs: LOGIN_WINDOW_MS });

/** Rate-limit key for the email typed in the login form. */
export function loginAccountKey(email: string): string {
  return email.trim().toLowerCase().slice(0, 254);
}

export function loginClientKey(request: Request): string {
  return clientKey(request);
}

function isUnderAttack(account: string, now: number): boolean {
  return (
    accountLimiter.count(account, now) >= ACCOUNT_ALERT ||
    globalLimiter.count(GLOBAL_KEY, now) >= GLOBAL_ALERT
  );
}

/** Seconds until the client may try again for that account, or 0. */
export function loginRetryAfterSeconds(ip: string, account: string, now = Date.now()): number {
  const limit = isUnderAttack(account, now) ? IP_MAX_UNDER_ATTACK : IP_MAX;
  return ipLimiter.retryAfterSeconds(ip, now, limit);
}

/**
 * Checks the limits and, when allowed, reserves the attempt as a failure in a
 * single synchronous step. Returns 0 when reserved, otherwise the seconds to
 * wait (nothing reserved).
 */
export function beginLoginAttempt(ip: string, account: string, now = Date.now()): number {
  const retryAfter = loginRetryAfterSeconds(ip, account, now);
  if (retryAfter > 0) return retryAfter;
  ipLimiter.register(ip, now);
  accountLimiter.register(account, now);
  globalLimiter.register(GLOBAL_KEY, now);
  return 0;
}

/**
 * After a successful login: forgets the failures of the client and releases
 * this attempt from the account and global counters (earlier failures of other
 * clients stay counted).
 */
export function completeLoginAttempt(ip: string, account: string, now = Date.now()): void {
  ipLimiter.clear(ip);
  accountLimiter.undo(account, now);
  globalLimiter.undo(GLOBAL_KEY, now);
}

/** The attempt could not be judged (server error): release it everywhere. */
export function releaseLoginAttempt(ip: string, account: string, now = Date.now()): void {
  ipLimiter.undo(ip, now);
  accountLimiter.undo(account, now);
  globalLimiter.undo(GLOBAL_KEY, now);
}

// Wrong current passwords when an account changes its own password: 5 per
// account per 15 minutes, so a stolen session cannot brute-force it.
const passwordChangeLimiter = createRateLimiter({ max: 5, windowMs: LOGIN_WINDOW_MS });

/** Same pattern as beginLoginAttempt: 0 when reserved, otherwise seconds to wait. */
export function beginPasswordChangeAttempt(userId: string, now = Date.now()): number {
  const retryAfter = passwordChangeLimiter.retryAfterSeconds(userId, now);
  if (retryAfter > 0) return retryAfter;
  passwordChangeLimiter.register(userId, now);
  return 0;
}

/** The current password was right: forget the failures of the account. */
export function completePasswordChangeAttempt(userId: string): void {
  passwordChangeLimiter.clear(userId);
}

/** The attempt ended before the current password was judged wrong: release it. */
export function releasePasswordChangeAttempt(userId: string, now = Date.now()): void {
  passwordChangeLimiter.undo(userId, now);
}
