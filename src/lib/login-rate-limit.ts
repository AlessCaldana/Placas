import { createRateLimiter } from "@/lib/rate-limit";

// In-memory protection of the admin login (per server process). Layers:
//
// 1. Per account (normalized email): progressive backoff. The first
//    ACCOUNT_FREE_FAILURES failures are free; after that every attempt has to
//    wait 15 s, 30 s, 1 min, ... up to 15 min after the previous failure. There
//    is never a permanent lockout: the owner can always sign in at the next
//    slot, and the record is forgotten after an hour without failures. This
//    layer works even when client IPs cannot be trusted.
// 2. Per client IP, only when the IP is trustworthy (TRUSTED_PROXY_HOPS >= 1,
//    see src/lib/rate-limit.ts): 5 failures per 15 minutes. When many failures
//    happen overall (GLOBAL_ALERT) every IP gets a single failure per window.
//    An IP with no recent failures may also try once while the account is in
//    backoff, so an attacker hammering the owner's email from other addresses
//    cannot keep the owner (from a clean address) out.
// 3. Global cap on concurrent password verifications (scrypt uses ~32 MiB and
//    a libuv thread each): extra requests get 429 right away instead of piling
//    up, so guessing cannot exhaust CPU or memory.
//
// Attempts are reserved before the password is verified, in one synchronous
// step, so parallel requests cannot all pass the check; a successful login
// releases the reservation.

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const GLOBAL_KEY = "global";
const IP_MAX = 5;
const IP_MAX_UNDER_ATTACK = 1;
const GLOBAL_ALERT = 30;

const ACCOUNT_FREE_FAILURES = 5;
const ACCOUNT_BASE_DELAY_MS = 15_000;
const ACCOUNT_MAX_DELAY_MS = 15 * 60 * 1000;
const ACCOUNT_RESET_MS = 60 * 60 * 1000;
const MAX_ACCOUNT_RECORDS = 10_000;

export const MAX_CONCURRENT_VERIFICATIONS = 4;

type AccountRecord = { failures: number; lastFailure: number };

/** Wait (ms) required after the last failure once an account has `failures` failures. */
export function accountBackoffMs(failures: number): number {
  if (failures < ACCOUNT_FREE_FAILURES) return 0;
  const steps = Math.min(failures - ACCOUNT_FREE_FAILURES, 16);
  return Math.min(ACCOUNT_BASE_DELAY_MS * 2 ** steps, ACCOUNT_MAX_DELAY_MS);
}

export type LoginGuard = ReturnType<typeof createLoginGuard>;

/** Builds an independent set of login limits (the app uses one shared instance). */
export function createLoginGuard() {
  const ipLimiter = createRateLimiter({ max: IP_MAX, windowMs: LOGIN_WINDOW_MS });
  const globalLimiter = createRateLimiter({ max: GLOBAL_ALERT, windowMs: LOGIN_WINDOW_MS });
  const accounts = new Map<string, AccountRecord>();
  let verifications = 0;

  function accountRecord(account: string, now: number): AccountRecord | undefined {
    const record = accounts.get(account);
    if (record && now - record.lastFailure >= ACCOUNT_RESET_MS) {
      accounts.delete(account);
      return undefined;
    }
    return record;
  }

  // Keeps the map bounded. Records still in backoff are evicted last, so
  // spraying random emails cannot reset the backoff of a real account.
  function makeRoom(now: number): void {
    if (accounts.size < MAX_ACCOUNT_RECORDS) return;
    for (const [key, record] of accounts) {
      if (now - record.lastFailure >= ACCOUNT_RESET_MS || record.failures < ACCOUNT_FREE_FAILURES) {
        accounts.delete(key);
      }
    }
    while (accounts.size >= MAX_ACCOUNT_RECORDS) {
      const oldest = accounts.keys().next();
      if (oldest.done) break;
      accounts.delete(oldest.value);
    }
  }

  function accountRetryAfterMs(account: string, now: number): number {
    const record = accountRecord(account, now);
    if (!record) return 0;
    return Math.max(0, record.lastFailure + accountBackoffMs(record.failures) - now);
  }

  function ipLimit(now: number): number {
    return globalLimiter.count(GLOBAL_KEY, now) >= GLOBAL_ALERT ? IP_MAX_UNDER_ATTACK : IP_MAX;
  }

  /** Seconds until this client may try this account again, or 0. `ip` is null when not trustworthy. */
  function retryAfterSeconds(ip: string | null, account: string, now = Date.now()): number {
    let waitMs = 0;
    if (ip) {
      const ipWait = ipLimiter.retryAfterSeconds(ip, now, ipLimit(now)) * 1000;
      waitMs = Math.max(waitMs, ipWait);
    }
    const accountWait = accountRetryAfterMs(account, now);
    // A trustworthy address without recent failures may still try once.
    const cleanIp = ip !== null && ipLimiter.count(ip, now) === 0;
    if (!cleanIp) waitMs = Math.max(waitMs, accountWait);
    return waitMs > 0 ? Math.max(1, Math.ceil(waitMs / 1000)) : 0;
  }

  return {
    retryAfterSeconds,

    /** Capacity and per-IP check only, before the email is known. */
    precheck(ip: string | null, now = Date.now()): number {
      if (verifications >= MAX_CONCURRENT_VERIFICATIONS) return 1;
      return ip ? ipLimiter.retryAfterSeconds(ip, now, ipLimit(now)) : 0;
    },

    /**
     * Checks the limits and, when allowed, reserves the attempt as a failure
     * and takes a verification slot, in a single synchronous step. Returns 0
     * when reserved, otherwise the seconds to wait (nothing reserved). Every
     * 0 must be followed by exactly one complete/fail/release call.
     */
    begin(ip: string | null, account: string, now = Date.now()): number {
      if (verifications >= MAX_CONCURRENT_VERIFICATIONS) return 1;
      const retryAfter = retryAfterSeconds(ip, account, now);
      if (retryAfter > 0) return retryAfter;
      verifications += 1;
      if (ip) ipLimiter.register(ip, now);
      globalLimiter.register(GLOBAL_KEY, now);
      const record = accountRecord(account, now);
      if (record) {
        record.failures += 1;
        record.lastFailure = now;
      } else {
        makeRoom(now);
        accounts.set(account, { failures: 1, lastFailure: now });
      }
      return 0;
    },

    /** Wrong credentials: the reserved failure stays counted; frees the slot. */
    fail(): void {
      verifications = Math.max(0, verifications - 1);
    },

    /**
     * Successful login: forgets the failures of the client IP and releases
     * this attempt from the account and global counters (earlier failures of
     * other clients stay counted).
     */
    complete(ip: string | null, account: string, now = Date.now()): void {
      verifications = Math.max(0, verifications - 1);
      if (ip) ipLimiter.clear(ip);
      globalLimiter.undo(GLOBAL_KEY, now);
      const record = accountRecord(account, now);
      if (record) {
        record.failures -= 1;
        if (record.failures <= 0) accounts.delete(account);
      }
    },

    /** The attempt could not be judged (server error): release it everywhere. */
    release(ip: string | null, account: string, now = Date.now()): void {
      verifications = Math.max(0, verifications - 1);
      if (ip) ipLimiter.undo(ip, now);
      globalLimiter.undo(GLOBAL_KEY, now);
      const record = accountRecord(account, now);
      if (record) {
        record.failures -= 1;
        if (record.failures <= 0) accounts.delete(account);
      }
    },

    /** Verifications running right now (for tests and diagnostics). */
    activeVerifications(): number {
      return verifications;
    },
  };
}

const loginGuard = createLoginGuard();

/** Rate-limit key for the email typed in the login form. */
export function loginAccountKey(email: string): string {
  return email.trim().toLowerCase().slice(0, 254);
}

/** Pre-check before the body is read (IP and capacity only; the account is not known yet). */
export function loginPrecheckRetryAfterSeconds(ip: string | null, now = Date.now()): number {
  return loginGuard.precheck(ip, now);
}

export function loginRetryAfterSeconds(ip: string | null, account: string, now = Date.now()): number {
  return loginGuard.retryAfterSeconds(ip, account, now);
}

export function beginLoginAttempt(ip: string | null, account: string, now = Date.now()): number {
  return loginGuard.begin(ip, account, now);
}

export function failLoginAttempt(): void {
  loginGuard.fail();
}

export function completeLoginAttempt(ip: string | null, account: string, now = Date.now()): void {
  loginGuard.complete(ip, account, now);
}

export function releaseLoginAttempt(ip: string | null, account: string, now = Date.now()): void {
  loginGuard.release(ip, account, now);
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
