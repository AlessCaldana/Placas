// In-memory limiter for admin login attempts. It lives in the server process,
// so it resets on restart and is per instance; enough for a single server.
const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

type AttemptRecord = { failures: number; windowStart: number };

const attempts = new Map<string, AttemptRecord>();

function currentRecord(key: string, now: number): AttemptRecord | undefined {
  const record = attempts.get(key);
  if (record && now - record.windowStart >= WINDOW_MS) {
    attempts.delete(key);
    return undefined;
  }
  return record;
}

/** Seconds until the key may try again, or 0 when it is not blocked. */
export function loginRetryAfterSeconds(key: string, now = Date.now()): number {
  const record = currentRecord(key, now);
  if (!record || record.failures < MAX_FAILED_ATTEMPTS) return 0;
  return Math.ceil((record.windowStart + WINDOW_MS - now) / 1000);
}

export function registerFailedLogin(key: string, now = Date.now()): void {
  const record = currentRecord(key, now);
  if (record) record.failures += 1;
  else attempts.set(key, { failures: 1, windowStart: now });
}

export function clearFailedLogins(key: string): void {
  attempts.delete(key);
}

export function loginClientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}
