import { createRateLimiter } from "@/lib/rate-limit";

// In-memory protection of the admin login (per server process). Layers:
//
// 1. Per account (normalized email): progressive backoff. The first
//    ACCOUNT_FREE_FAILURES failures are free; after that every attempt has to
//    wait 15 s, 30 s, 1 min, ... up to 15 min after the previous failure. There
//    is never a permanent lockout: the owner can always sign in at the next
//    slot, and the record is forgotten after an hour without failures. This
//    layer works even when client IPs cannot be trusted.
//    Each account has TWO independent backoff counters with the same curve:
//    - untrusted: attempts from browsers without a valid device cookie;
//    - trusted: attempts carrying the account's device cookie
//      (placa_admin_device, signed with AUTH_SECRET and issued only after a
//      successful login for that account; see src/lib/admin-session.ts).
//    A trusted attempt only looks at and adds to the trusted counter, so an
//    attacker without the cookie cannot push the owner's browser into backoff,
//    and whoever steals the cookie still has a backoff of their own.
// 2. Per client IP, only when the IP is trustworthy (TRUSTED_PROXY_HOPS >= 1,
//    see src/lib/rate-limit.ts): 5 failures per 15 minutes, for every attempt
//    (trusted or not). When many failures happen overall (GLOBAL_ALERT) every
//    IP gets a single failure per window. An untrusted attempt from an IP with
//    no recent failures may also try once while the account is in backoff, so
//    an attacker hammering the owner's email from other addresses cannot keep
//    the owner (from a clean address) out.
// 3. Global cap on concurrent password verifications (scrypt uses ~32 MiB and
//    a libuv thread each): MAX_CONCURRENT_VERIFICATIONS in total, of which
//    untrusted attempts may only use MAX_UNTRUSTED_VERIFICATIONS; the last
//    slot is reserved for trusted attempts (which may use any free slot).
//    Extra requests get 429 right away instead of piling up, so guessing
//    cannot exhaust CPU or memory, nor keep the owner's browser out.
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
/** Untrusted attempts may only start while fewer than this many verifications run. */
export const MAX_UNTRUSTED_VERIFICATIONS = 3;

/** How an attempt is classified. `trusted`: it carries a valid device cookie for the account. */
export type LoginAttemptOptions = { trusted?: boolean };

type AccountRecord = { failures: number; lastFailure: number };

/** Wait (ms) required after the last failure once an account has `failures` failures. */
export function accountBackoffMs(failures: number): number {
  if (failures < ACCOUNT_FREE_FAILURES) return 0;
  const steps = Math.min(failures - ACCOUNT_FREE_FAILURES, 16);
  return Math.min(ACCOUNT_BASE_DELAY_MS * 2 ** steps, ACCOUNT_MAX_DELAY_MS);
}

/** One per-account backoff counter (the guard keeps one for untrusted and one for trusted attempts). */
function createAccountBackoff() {
  const accounts = new Map<string, AccountRecord>();

  function record(account: string, now: number): AccountRecord | undefined {
    const current = accounts.get(account);
    if (current && now - current.lastFailure >= ACCOUNT_RESET_MS) {
      accounts.delete(account);
      return undefined;
    }
    return current;
  }

  // Keeps the map bounded. Records still in backoff are evicted last, so
  // spraying random emails cannot reset the backoff of a real account.
  function makeRoom(now: number): void {
    if (accounts.size < MAX_ACCOUNT_RECORDS) return;
    for (const [key, current] of accounts) {
      if (now - current.lastFailure >= ACCOUNT_RESET_MS || current.failures < ACCOUNT_FREE_FAILURES) {
        accounts.delete(key);
      }
    }
    while (accounts.size >= MAX_ACCOUNT_RECORDS) {
      const oldest = accounts.keys().next();
      if (oldest.done) break;
      accounts.delete(oldest.value);
    }
  }

  return {
    retryAfterMs(account: string, now: number): number {
      const current = record(account, now);
      if (!current) return 0;
      return Math.max(0, current.lastFailure + accountBackoffMs(current.failures) - now);
    },
    add(account: string, now: number): void {
      const current = record(account, now);
      if (current) {
        current.failures += 1;
        current.lastFailure = now;
        return;
      }
      makeRoom(now);
      accounts.set(account, { failures: 1, lastFailure: now });
    },
    remove(account: string, now: number): void {
      const current = record(account, now);
      if (!current) return;
      current.failures -= 1;
      if (current.failures <= 0) accounts.delete(account);
    },
  };
}

export type LoginGuard = ReturnType<typeof createLoginGuard>;

/** Builds an independent set of login limits (the app uses one shared instance). */
export function createLoginGuard() {
  const ipLimiter = createRateLimiter({ max: IP_MAX, windowMs: LOGIN_WINDOW_MS });
  const globalLimiter = createRateLimiter({ max: GLOBAL_ALERT, windowMs: LOGIN_WINDOW_MS });
  const untrustedBackoff = createAccountBackoff();
  const trustedBackoff = createAccountBackoff();
  let verifications = 0;

  const backoffFor = (opts: LoginAttemptOptions) => (opts.trusted ? trustedBackoff : untrustedBackoff);

  function ipLimit(now: number): number {
    return globalLimiter.count(GLOBAL_KEY, now) >= GLOBAL_ALERT ? IP_MAX_UNDER_ATTACK : IP_MAX;
  }

  function hasFreeSlot(opts: LoginAttemptOptions): boolean {
    const limit = opts.trusted ? MAX_CONCURRENT_VERIFICATIONS : MAX_UNTRUSTED_VERIFICATIONS;
    return verifications < limit;
  }

  /**
   * Seconds until this client may try this account again, or 0. `ip` is null
   * when not trustworthy; `opts.trusted` selects the trusted backoff counter.
   */
  function retryAfterSeconds(
    ip: string | null,
    account: string,
    now = Date.now(),
    opts: LoginAttemptOptions = {},
  ): number {
    let waitMs = 0;
    if (ip) {
      const ipWait = ipLimiter.retryAfterSeconds(ip, now, ipLimit(now)) * 1000;
      waitMs = Math.max(waitMs, ipWait);
    }
    const accountWait = backoffFor(opts).retryAfterMs(account, now);
    // An untrusted attempt from a trustworthy address without recent failures
    // may still try once. Trusted attempts have their own counter, which only
    // the cookie holder can move, so they never need (or get) this exception.
    const cleanIp = !opts.trusted && ip !== null && ipLimiter.count(ip, now) === 0;
    if (!cleanIp) waitMs = Math.max(waitMs, accountWait);
    return waitMs > 0 ? Math.max(1, Math.ceil(waitMs / 1000)) : 0;
  }

  /** Releases the reservation from the IP, global and account counters. */
  function undoReservation(ip: string | null, account: string, now: number, opts: LoginAttemptOptions): void {
    globalLimiter.undo(GLOBAL_KEY, now);
    backoffFor(opts).remove(account, now);
    if (ip) ipLimiter.undo(ip, now);
  }

  return {
    retryAfterSeconds,

    /**
     * Capacity and per-IP check only, before the email (and so whether the
     * attempt is trusted) is known: refuses only when every slot is taken.
     */
    precheck(ip: string | null, now = Date.now()): number {
      if (verifications >= MAX_CONCURRENT_VERIFICATIONS) return 1;
      return ip ? ipLimiter.retryAfterSeconds(ip, now, ipLimit(now)) : 0;
    },

    /**
     * Checks the limits and, when allowed, reserves the attempt as a failure
     * and takes a verification slot, in a single synchronous step. Returns 0
     * when reserved, otherwise the seconds to wait (nothing reserved). Every
     * 0 must be followed by exactly one complete/fail/release call (with the
     * same `opts`).
     */
    begin(ip: string | null, account: string, now = Date.now(), opts: LoginAttemptOptions = {}): number {
      if (!hasFreeSlot(opts)) return 1;
      const retryAfter = retryAfterSeconds(ip, account, now, opts);
      if (retryAfter > 0) return retryAfter;
      verifications += 1;
      if (ip) ipLimiter.register(ip, now);
      globalLimiter.register(GLOBAL_KEY, now);
      backoffFor(opts).add(account, now);
      return 0;
    },

    /** Wrong credentials: the reserved failure stays counted; frees the slot. */
    fail(): void {
      verifications = Math.max(0, verifications - 1);
    },

    /**
     * Successful login: forgets the failures of the client IP and releases
     * this attempt from the account (the counter it was reserved in) and
     * global counters (earlier failures of other clients stay counted).
     */
    complete(ip: string | null, account: string, now = Date.now(), opts: LoginAttemptOptions = {}): void {
      verifications = Math.max(0, verifications - 1);
      undoReservation(null, account, now, opts);
      if (ip) ipLimiter.clear(ip);
    },

    /** The attempt could not be judged (server error): release it everywhere. */
    release(ip: string | null, account: string, now = Date.now(), opts: LoginAttemptOptions = {}): void {
      verifications = Math.max(0, verifications - 1);
      undoReservation(ip, account, now, opts);
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

// The wrappers take `opts` before `now` (the route never passes `now`).
export function loginRetryAfterSeconds(
  ip: string | null,
  account: string,
  opts: LoginAttemptOptions = {},
  now = Date.now(),
): number {
  return loginGuard.retryAfterSeconds(ip, account, now, opts);
}

export function beginLoginAttempt(
  ip: string | null,
  account: string,
  opts: LoginAttemptOptions = {},
  now = Date.now(),
): number {
  return loginGuard.begin(ip, account, now, opts);
}

export function failLoginAttempt(): void {
  loginGuard.fail();
}

export function completeLoginAttempt(
  ip: string | null,
  account: string,
  opts: LoginAttemptOptions = {},
  now = Date.now(),
): void {
  loginGuard.complete(ip, account, now, opts);
}

export function releaseLoginAttempt(
  ip: string | null,
  account: string,
  opts: LoginAttemptOptions = {},
  now = Date.now(),
): void {
  loginGuard.release(ip, account, now, opts);
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
