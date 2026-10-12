import { isIP } from "node:net";

// Fixed-window in-memory rate limiter. It lives in the server process, so it
// resets on restart and is per instance; enough for a single server.

export type RateLimiter = {
  /** Seconds until the key may act again, or 0 when it is not blocked. */
  retryAfterSeconds(key: string, now?: number): number;
  /** Counts one hit for the key in the current window. */
  register(key: string, now?: number): void;
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
    retryAfterSeconds(key, now = Date.now()) {
      const record = currentRecord(key, now);
      if (!record || record.hits < max) return 0;
      return Math.ceil((record.windowStart + windowMs - now) / 1000);
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
    clear(key) {
      records.delete(key);
    },
  };
}

/** TRUSTED_PROXY_HOPS: how many reverse proxies in front of the app append to X-Forwarded-For. */
function trustedProxyHops(): number {
  const raw = process.env.TRUSTED_PROXY_HOPS?.trim();
  if (!raw || !/^\d{1,2}$/.test(raw)) return 0;
  return Number(raw);
}

/** Returns the address as a canonical IP string, or null when it is not an IP. */
function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null;
  let ip = value.trim().toLowerCase();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (mapped) ip = mapped[1];
  return isIP(ip) ? ip : null;
}

/**
 * Client identifier for rate limiting. The leftmost X-Forwarded-For values are
 * chosen by the client, so only the hops added by trusted proxies are used:
 * with TRUSTED_PROXY_HOPS=0, X-Real-IP or else the last X-Forwarded-For value
 * (Next fills it with the socket address when the header is missing); with
 * N > 0, the N-th value from the right. Anything that is not an IP is "unknown".
 */
export function clientKey(request: Request): string {
  const hops = trustedProxyHops();
  const forwarded = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  let candidate: string | undefined;
  if (hops === 0) {
    candidate = request.headers.get("x-real-ip")?.trim() || forwarded[forwarded.length - 1];
  } else {
    candidate = forwarded[Math.max(0, forwarded.length - hops)];
  }
  return normalizeIp(candidate) ?? "unknown";
}
