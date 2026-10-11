import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const ADMIN_SESSION_COOKIE = "placa_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

function getSecret(): string | null {
  const secret = process.env.AUTH_SECRET;
  return secret && Buffer.byteLength(secret) >= 32 ? secret : null;
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(submitted: string, configured: string): boolean {
  // Hash both sides so the comparison time does not depend on the length.
  const submittedHash = createHash("sha256").update(submitted).digest();
  const configuredHash = createHash("sha256").update(configured).digest();
  return timingSafeEqual(submittedHash, configuredHash);
}

// Short passwords are allowed only for local development; production needs 16+.
function minimumPasswordLength(): number {
  return process.env.NODE_ENV === "production" ? 16 : 1;
}

export function isAdminLoginConfigured(): boolean {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;
  return Boolean(
    email && password && Buffer.byteLength(password) >= minimumPasswordLength() && getSecret(),
  );
}

export function isAdminLoginValid(email: string, password: string): boolean {
  if (!isAdminLoginConfigured()) return false;
  const configuredEmail = process.env.ADMIN_EMAIL!.trim().toLowerCase();
  const emailMatches = safeEqual(email.trim().toLowerCase(), configuredEmail);
  const passwordMatches = safeEqual(password, process.env.ADMIN_PASSWORD!);
  return emailMatches && passwordMatches;
}

export function createAdminSession(): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const payload = `${Date.now() + SESSION_TTL_SECONDS * 1000}.${randomBytes(16).toString("base64url")}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function isValidAdminSession(value: string | undefined | null): boolean {
  const secret = getSecret();
  if (!secret || !value) return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [expiresAt, nonce, signature] = parts;
  if (!/^\d{13}$/.test(expiresAt) || !/^[A-Za-z0-9_-]{20,30}$/.test(nonce)) return false;
  if (Number(expiresAt) <= Date.now()) return false;
  const payload = `${expiresAt}.${nonce}`;
  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(signature);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function hasValidAdminSession(request: Request): boolean {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookie = cookieHeader.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_SESSION_COOKIE}=`));
  return isValidAdminSession(cookie?.slice(ADMIN_SESSION_COOKIE.length + 1));
}

/**
 * Login is always enforced in production. In local development it is off
 * unless ADMIN_AUTH=on, so the panel can be used without signing in.
 */
export function isAdminAuthRequired(): boolean {
  return process.env.NODE_ENV === "production" || process.env.ADMIN_AUTH === "on";
}

/** Returns a 401 response when the request has no valid admin session. */
export function rejectWithoutAdminSession(request: Request): NextResponse | null {
  return !isAdminAuthRequired() || hasValidAdminSession(request)
    ? null
    : NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

