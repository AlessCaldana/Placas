import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { forwardedChainIsLoopback } from "@/lib/rate-limit";

// Session cookie format (HMAC-SHA256 with AUTH_SECRET):
//   <userId>.<sessionVersion>.<expiresAtMs>.<nonce>.<signature>
// This module has no database access so src/proxy.ts can use it for the
// optimistic check. The full check (user exists, active, sessionVersion
// matches) is in src/lib/admin-auth.ts.

export const ADMIN_SESSION_COOKIE = "placa_admin_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12;

/** User id of the bootstrap session created from ADMIN_EMAIL/ADMIN_PASSWORD. */
export const ENV_ADMIN_ID = "env";

export type SessionPayload = {
  userId: string;
  sessionVersion: number;
  expiresAt: number;
};

const USER_ID = /^(?:env|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
const MAX_SESSION_VERSION = 2_147_483_647;

export function getAuthSecret(): string | null {
  const secret = process.env.AUTH_SECRET;
  return secret && Buffer.byteLength(secret) >= 32 ? secret : null;
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

/** Signed cookie value for the user, or null when AUTH_SECRET is missing. */
export function createSessionToken(
  userId: string,
  sessionVersion: number,
  now = Date.now(),
): string | null {
  const secret = getAuthSecret();
  if (!secret || !USER_ID.test(userId)) return null;
  if (!Number.isInteger(sessionVersion) || sessionVersion < 0 || sessionVersion > MAX_SESSION_VERSION) {
    return null;
  }
  const expiresAt = now + SESSION_TTL_SECONDS * 1000;
  const payload = `${userId}.${sessionVersion}.${expiresAt}.${randomBytes(16).toString("base64url")}`;
  return `${payload}.${sign(payload, secret)}`;
}

/** Checks the signature and expiry only; returns the payload or null. */
export function verifySessionToken(
  value: string | undefined | null,
  now = Date.now(),
): SessionPayload | null {
  const secret = getAuthSecret();
  if (!secret || !value || value.length > 300) return null;
  const parts = value.split(".");
  if (parts.length !== 5) return null;
  const [userId, version, expiresAt, nonce, signature] = parts;
  if (!USER_ID.test(userId) || !/^\d{1,10}$/.test(version)) return null;
  if (!/^\d{13}$/.test(expiresAt) || !/^[A-Za-z0-9_-]{20,30}$/.test(nonce)) return null;
  const expected = Buffer.from(sign(`${userId}.${version}.${expiresAt}.${nonce}`, secret));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  const sessionVersion = Number(version);
  if (sessionVersion > MAX_SESSION_VERSION || Number(expiresAt) <= now) return null;
  return { userId, sessionVersion, expiresAt: Number(expiresAt) };
}

/** Reads a cookie by name from a raw request. */
function readCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return cookie?.slice(name.length + 1);
}

/** Reads the session cookie from a raw request. */
export function readSessionCookie(request: Request): string | undefined {
  return readCookie(request, ADMIN_SESSION_COOKIE);
}

// ---------------------------------------------------------------------------
// Trusted device cookie
//
// After a successful login the browser gets a second cookie that says "this
// browser has signed in to this account before":
//   v1.<expiresAtEpochSeconds>.<signature>
//   signature = HMAC-SHA256(AUTH_SECRET, "device|<accountKey>|<expiresAt>")
// It is NOT a session (it grants no access and requireAdmin ignores it); the
// login rate limit uses it to keep a separate backoff and a reserved
// verification slot for the owner's browser (see src/lib/login-rate-limit.ts).
// Logout does not clear it. `accountKey` is loginAccountKey(email).
// ---------------------------------------------------------------------------

export const ADMIN_DEVICE_COOKIE = "placa_admin_device";
export const DEVICE_TTL_SECONDS = 60 * 60 * 24 * 90;

// SHA-256 is 32 bytes: 43 base64url characters without padding.
const DEVICE_TOKEN = /^v1\.(\d{10})\.([A-Za-z0-9_-]{43})$/;
const MAX_ACCOUNT_KEY_LENGTH = 254;

function deviceSignature(accountKey: string, expiresAt: string, secret: string): string {
  return sign(`device|${accountKey}|${expiresAt}`, secret);
}

function isUsableAccountKey(accountKey: string): boolean {
  return accountKey.length > 0 && accountKey.length <= MAX_ACCOUNT_KEY_LENGTH;
}

/** Signed device cookie value for the account, or null when AUTH_SECRET is missing or weak. */
export function createDeviceToken(accountKey: string, now = Date.now()): string | null {
  const secret = getAuthSecret();
  if (!secret || !isUsableAccountKey(accountKey)) return null;
  const expiresAt = String(Math.floor(now / 1000) + DEVICE_TTL_SECONDS);
  return `v1.${expiresAt}.${deviceSignature(accountKey, expiresAt, secret)}`;
}

/** True only for an unexpired device cookie signed for this exact account. */
export function verifyDeviceToken(
  value: string | undefined | null,
  accountKey: string,
  now = Date.now(),
): boolean {
  const secret = getAuthSecret();
  if (!secret || !value || value.length > 100 || !isUsableAccountKey(accountKey)) return false;
  const match = DEVICE_TOKEN.exec(value);
  if (!match) return false;
  const [, expiresAt, signature] = match;
  const expected = Buffer.from(deviceSignature(accountKey, expiresAt, secret));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
  return Number(expiresAt) * 1000 > now;
}

/** Reads the device cookie from a raw request. */
export function readDeviceCookie(request: Request): string | undefined {
  return readCookie(request, ADMIN_DEVICE_COOKIE);
}

/** Only sent to /api/auth/* (the login needs it; nothing else does). */
export function deviceCookieOptions(maxAge = DEVICE_TTL_SECONDS) {
  return { ...sessionCookieOptions(maxAge), path: "/api/auth" };
}

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** True when the Host header names this machine (localhost, 127.0.0.1 or [::1], any port). */
export function isLoopbackHost(host: string | null | undefined): boolean {
  if (!host || host.length > 300) return false;
  try {
    return LOOPBACK_HOSTNAMES.has(new URL(`http://${host}`).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Best effort "the request comes from this machine": the Host header is a
 * loopback name and every X-Forwarded-For entry (Next.js puts the socket
 * address there when the client sent none) is a loopback address. Both headers
 * could be forged by a client that can reach the server, which is why the dev
 * server listens on 127.0.0.1 only (`next dev -H 127.0.0.1` in package.json).
 */
export function isLoopbackRequest(headers: Headers): boolean {
  return isLoopbackHost(headers.get("host")) && forwardedChainIsLoopback(headers);
}

/**
 * Login is required unless ALL of these hold: ADMIN_AUTH=off is set
 * explicitly, NODE_ENV is not production, and the request comes from this
 * machine (see isLoopbackRequest). Anything else, including a missing
 * ADMIN_AUTH, requires login.
 */
export function isAdminAuthRequired(headers: Headers): boolean {
  if (process.env.NODE_ENV === "production" || process.env.ADMIN_AUTH !== "off") return true;
  return !isLoopbackRequest(headers);
}

export function sessionCookieOptions(maxAge = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
