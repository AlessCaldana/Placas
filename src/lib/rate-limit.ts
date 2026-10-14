import { isIP } from "node:net";

// In-memory rate limiters (fixed and sliding window). They live in the server
// process, so they reset on restart and are per instance; enough for a single
// server.

export type RateLimiter = {
  /**
   * Seconds until the key may act again, or 0 when it is not blocked. `max`
   * overrides the configured limit for this check (e.g. a stricter one).
   */
  retryAfterSeconds(key: string, now?: number, max?: number): number;
  /** Hits of the key in the current window. */
  count(key: string, now?: number): number;
  /** Counts one hit for the key in the current window. */
  register(key: string, now?: number): void;
  /** Removes one hit of the key (to release a reserved attempt). */
  undo(key: string, now?: number): void;
  /** Forgets every hit of the key. */
  clear(key: string): void;
};

type WindowRecord = { hits: number; windowStart: number };

// Hard cap on tracked keys so a public endpoint cannot grow the map without
// bound. When full, expired windows are pruned (at most once per interval) and,
// if it is still full, the oldest inserted key is evicted.
const MAX_ENTRIES = 10_000;
const PRUNE_INTERVAL_MS = 60_000;

export function createRateLimiter(options: { max: number; windowMs: number }): RateLimiter {
  const { max, windowMs } = options;
  const records = new Map<string, WindowRecord>();
  let lastPrune = Number.NEGATIVE_INFINITY;

  function prune(now: number): void {
    for (const [key, record] of records) {
      if (now - record.windowStart >= windowMs) records.delete(key);
    }
  }

  function makeRoom(now: number): void {
    if (records.size < MAX_ENTRIES) return;
    if (now - lastPrune >= PRUNE_INTERVAL_MS) {
      lastPrune = now;
      prune(now);
    }
    // Map iteration follows insertion order, so the first key is the oldest.
    while (records.size >= MAX_ENTRIES) {
      const oldest = records.keys().next();
      if (oldest.done) break;
      records.delete(oldest.value);
    }
  }

  function currentRecord(key: string, now: number): WindowRecord | undefined {
    const record = records.get(key);
    if (record && now - record.windowStart >= windowMs) {
      records.delete(key);
      return undefined;
    }
    return record;
  }

  return {
    retryAfterSeconds(key, now = Date.now(), limit = max) {
      const record = currentRecord(key, now);
      if (!record || record.hits < limit) return 0;
      return Math.ceil((record.windowStart + windowMs - now) / 1000);
    },
    count(key, now = Date.now()) {
      return currentRecord(key, now)?.hits ?? 0;
    },
    register(key, now = Date.now()) {
      const record = currentRecord(key, now);
      if (record) {
        record.hits += 1;
        return;
      }
      makeRoom(now);
      records.set(key, { hits: 1, windowStart: now });
    },
    undo(key, now = Date.now()) {
      const record = currentRecord(key, now);
      if (!record) return;
      record.hits -= 1;
      if (record.hits <= 0) records.delete(key);
    },
    clear(key) {
      records.delete(key);
    },
  };
}

/**
 * Sliding-window limiter: at most `max` hits in any `windowMs` interval. Used
 * where a fixed window would allow a burst of 2 * max around the window edge
 * (e.g. checkout sessions). Only the last `max` timestamps per key are kept.
 */
export function createSlidingWindowLimiter(options: { max: number; windowMs: number }): RateLimiter {
  const { max, windowMs } = options;
  const records = new Map<string, number[]>();

  function current(key: string, now: number): number[] | undefined {
    const hits = records.get(key);
    if (!hits) return undefined;
    while (hits.length && now - hits[0] >= windowMs) hits.shift();
    if (!hits.length) {
      records.delete(key);
      return undefined;
    }
    return hits;
  }

  function makeRoom(): void {
    while (records.size >= MAX_ENTRIES) {
      const oldest = records.keys().next();
      if (oldest.done) break;
      records.delete(oldest.value);
    }
  }

  return {
    retryAfterSeconds(key, now = Date.now(), limit = max) {
      const hits = current(key, now);
      if (!hits || hits.length < limit) return 0;
      // The oldest hits that must leave the window before one more fits.
      const blocking = hits[hits.length - limit];
      return Math.max(1, Math.ceil((blocking + windowMs - now) / 1000));
    },
    count(key, now = Date.now()) {
      return current(key, now)?.length ?? 0;
    },
    register(key, now = Date.now()) {
      let hits = current(key, now);
      if (!hits) {
        makeRoom();
        hits = [];
        records.set(key, hits);
      }
      hits.push(now);
      if (hits.length > max) hits.splice(0, hits.length - max);
    },
    undo(key, now = Date.now()) {
      const hits = current(key, now);
      if (!hits) return;
      hits.pop();
      if (!hits.length) records.delete(key);
    },
    clear(key) {
      records.delete(key);
    },
  };
}

// ---------------------------------------------------------------------------
// Client address
//
// X-Forwarded-For is only trusted when TRUSTED_PROXY_HOPS is set to 1 or more:
// Next.js fills the header with the socket address only when it is missing, so
// without a reverse proxy that overwrites/appends it the client chooses the
// value. With TRUSTED_PROXY_HOPS unset or 0 the client address is unknown and
// callers fall back to per-account or global limits.
// ---------------------------------------------------------------------------

/** Rate-limit key shared by every client whose address cannot be trusted. */
export const UNKNOWN_CLIENT = "unknown";

/** TRUSTED_PROXY_HOPS: how many reverse proxies in front of the app append to X-Forwarded-For. */
export function trustedProxyHops(): number {
  const raw = process.env.TRUSTED_PROXY_HOPS?.trim();
  if (!raw || !/^\d{1,2}$/.test(raw)) return 0;
  return Number(raw);
}

let proxyWarningShown = false;

/** Logs once, in production, that per-IP limits are off because no proxy is trusted. */
function warnIfNoTrustedProxy(): void {
  if (proxyWarningShown || process.env.NODE_ENV !== "production") return;
  proxyWarningShown = true;
  console.warn(
    "[placa] TRUSTED_PROXY_HOPS is not set (or is 0): client IP addresses are not trusted, so " +
      "rate limits fall back to per-account and global limits only. Put the app behind a reverse " +
      "proxy (nginx: `proxy_set_header X-Forwarded-For $remote_addr;`) and set TRUSTED_PROXY_HOPS=1.",
  );
}

/** Returns the address as a canonical IP string, or null when it is not an IP. */
export function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null;
  let ip = value.trim().toLowerCase();
  if (ip.length > 64) return null;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (mapped) ip = mapped[1];
  return isIP(ip) ? ip : null;
}

/** True for 127.0.0.0/8 and ::1 (IPv4-mapped forms included). */
export function isLoopbackIp(value: string | null | undefined): boolean {
  const ip = normalizeIp(value);
  if (!ip) return false;
  return ip === "::1" || (isIP(ip) === 4 && ip.startsWith("127."));
}

function forwardedFor(headers: Headers): string[] {
  return (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

/**
 * Client IP for rate limiting, or null when it cannot be trusted. Only the
 * hops added by trusted proxies are used: with TRUSTED_PROXY_HOPS = N >= 1,
 * the N-th X-Forwarded-For value from the right (a shorter chain means the
 * request did not pass through every proxy: null). X-Real-IP is never used:
 * it is trustworthy only if a proxy always overwrites it, which cannot be
 * verified here.
 */
export function clientIp(request: Request): string | null {
  const hops = trustedProxyHops();
  if (hops < 1) {
    warnIfNoTrustedProxy();
    return null;
  }
  const forwarded = forwardedFor(request.headers);
  if (forwarded.length < hops) return null;
  return normalizeIp(forwarded[forwarded.length - hops]);
}

/**
 * True when every X-Forwarded-For entry (if any) is a loopback address. Next.js
 * sets the header to the socket address when the client did not send one, so a
 * LAN client is rejected unless it forges the header; that is why the dev
 * server also listens on 127.0.0.1 only (see package.json).
 */
export function forwardedChainIsLoopback(headers: Headers): boolean {
  return forwardedFor(headers).every((value) => isLoopbackIp(value));
}
