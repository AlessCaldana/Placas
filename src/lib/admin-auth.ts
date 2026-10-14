import { createHash, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  ENV_ADMIN_ID,
  getAuthSecret,
  isAdminAuthRequired,
  readSessionCookie,
  verifySessionToken,
  type SessionPayload,
} from "@/lib/admin-session";
import { isDatabaseConfigured } from "@/lib/db";
import {
  countAdminUsers,
  findSessionUser,
  type AdminSessionUser,
} from "@/lib/services/admin-users";
import type { AdminRoleName } from "@/lib/validators/admin-user";

export { ADMIN_SESSION_COOKIE, isAdminAuthRequired };

/**
 * Who is using the panel.
 * - Real account: a row of admin_users (dev = false, bootstrap = false).
 * - dev: local development with ADMIN_AUTH=off, from this machine only (see
 *   isAdminAuthRequired in src/lib/admin-session.ts); full access.
 * - bootstrap: signed in with ADMIN_EMAIL/ADMIN_PASSWORD while no account exists.
 * Only real accounts can change their own password.
 */
export type AdminIdentity = {
  id: string;
  email: string;
  name: string;
  role: AdminRoleName;
  dev: boolean;
  bootstrap: boolean;
};

export const DEV_ADMIN_IDENTITY: Readonly<AdminIdentity> = Object.freeze({
  id: "dev",
  name: "Sviluppo",
  email: "",
  role: "SUPERADMIN",
  dev: true,
  bootstrap: false,
});

function envAdminIdentity(): AdminIdentity {
  return {
    id: ENV_ADMIN_ID,
    name: "Amministratore",
    email: process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? "",
    role: "SUPERADMIN",
    dev: false,
    bootstrap: true,
  };
}

// ---------------------------------------------------------------------------
// Bootstrap login with ADMIN_EMAIL / ADMIN_PASSWORD
//
// The env credentials work ONLY while the admin_users table has no rows, so a
// deploy made before any account is created does not lock the owner out. As
// soon as one account exists (created from the panel or with
// `npm run admin:user`), the env credentials are ignored and any bootstrap
// session stops being valid.
//
// In production the fallback additionally requires ADMIN_BOOTSTRAP=on, and a
// missing admin_users table (migration not applied) or a missing DATABASE_URL
// counts as "no accounts" only with that flag; without it the check fails
// closed. Remove ADMIN_BOOTSTRAP and ADMIN_PASSWORD once the first account
// exists. In development the flag is not needed.
// ---------------------------------------------------------------------------

export function isBootstrapAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ADMIN_BOOTSTRAP === "on";
}

function safeEqual(submitted: string, configured: string): boolean {
  // Hash both sides so the comparison time does not depend on the length.
  const submittedHash = createHash("sha256").update(submitted).digest();
  const configuredHash = createHash("sha256").update(configured).digest();
  return timingSafeEqual(submittedHash, configuredHash);
}

// Short passwords are allowed only for local development; production needs 16+.
function minimumEnvPasswordLength(): number {
  return process.env.NODE_ENV === "production" ? 16 : 1;
}

export function isEnvLoginConfigured(): boolean {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;
  return Boolean(
    isBootstrapAllowed() &&
      email &&
      password &&
      Buffer.byteLength(password) >= minimumEnvPasswordLength() &&
      getAuthSecret(),
  );
}

export function isEnvLoginValid(email: string, password: string): boolean {
  if (!isEnvLoginConfigured()) return false;
  const configuredEmail = process.env.ADMIN_EMAIL!.trim().toLowerCase();
  const emailMatches = safeEqual(email.trim().toLowerCase(), configuredEmail);
  const passwordMatches = safeEqual(password, process.env.ADMIN_PASSWORD!);
  return emailMatches && passwordMatches;
}

/**
 * True while no panel account exists, i.e. the env login may be accepted.
 * Throws on database errors (and, unless bootstrap is allowed, when the
 * admin_users table is missing).
 */
export async function isBootstrapMode(): Promise<boolean> {
  const allowed = isBootstrapAllowed();
  if (!isDatabaseConfigured()) return allowed;
  return (await countAdminUsers({ missingTableAsEmpty: allowed })) === 0;
}

// ---------------------------------------------------------------------------
// Session validation
// ---------------------------------------------------------------------------

/** Pure part of the full check: the cookie still matches the stored account. */
export function isSessionValidForUser(
  payload: SessionPayload,
  user: Pick<AdminSessionUser, "id" | "active" | "sessionVersion"> | null,
): boolean {
  return Boolean(
    user && user.active && user.id === payload.userId && user.sessionVersion === payload.sessionVersion,
  );
}

/**
 * Full check of a session cookie: signature and expiry, then the account must
 * exist, be active and have the same sessionVersion. Throws on database errors.
 */
export async function resolveAdminSession(token: string | undefined | null): Promise<AdminIdentity | null> {
  const payload = verifySessionToken(token);
  if (!payload) return null;
  if (payload.userId === ENV_ADMIN_ID) {
    const valid = payload.sessionVersion === 0 && isEnvLoginConfigured() && (await isBootstrapMode());
    return valid ? envAdminIdentity() : null;
  }
  if (!isDatabaseConfigured()) return null;
  const user = await findSessionUser(payload.userId);
  if (!user || !isSessionValidForUser(payload, user)) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role, dev: false, bootstrap: false };
}

export function hasRole(identity: AdminIdentity, role: AdminRoleName): boolean {
  return role === "ADMIN" || identity.role === "SUPERADMIN";
}

/** Whether the identity may manage panel accounts (sidebar link, users page). */
export function canManageUsers(identity: AdminIdentity): boolean {
  return identity.role === "SUPERADMIN";
}

/**
 * Current panel identity for Server Components and Server Functions, or null
 * when not signed in (or the session is no longer valid). In local development
 * with ADMIN_AUTH=off, from this machine, it returns DEV_ADMIN_IDENTITY.
 * Memoized per request.
 */
export const getCurrentAdmin = cache(async (): Promise<AdminIdentity | null> => {
  if (!isAdminAuthRequired(await headers())) return { ...DEV_ADMIN_IDENTITY };
  const cookieStore = await cookies();
  try {
    return await resolveAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
  } catch {
    // Fail closed when the database cannot be reached.
    return null;
  }
});

/**
 * For pages and layouts: returns the identity or redirects to /login. With
 * role "SUPERADMIN", a signed-in ADMIN is sent back to /admin.
 */
export async function requireAdminPage(options: { role?: AdminRoleName } = {}): Promise<AdminIdentity> {
  const identity = await getCurrentAdmin();
  if (!identity) redirect("/login");
  if (options.role && !hasRole(identity, options.role)) redirect("/admin");
  return identity;
}

/**
 * For Route Handlers: returns the identity, or a JSON response to send back
 * (401 unauthorized, 403 forbidden, 503 auth_unavailable).
 *
 *   const admin = await requireAdmin(request, { role: "SUPERADMIN" });
 *   if (admin instanceof NextResponse) return admin;
 */
export async function requireAdmin(
  request: Request,
  options: { role?: AdminRoleName } = {},
): Promise<AdminIdentity | NextResponse> {
  let identity: AdminIdentity | null;
  if (!isAdminAuthRequired(request.headers)) {
    identity = { ...DEV_ADMIN_IDENTITY };
  } else {
    try {
      identity = await resolveAdminSession(readSessionCookie(request));
    } catch {
      return NextResponse.json({ error: "auth_unavailable" }, { status: 503 });
    }
  }
  if (!identity) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (options.role && !hasRole(identity, options.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return identity;
}

/** Returns a response to send back when the request has no valid admin session, else null. */
export async function rejectWithoutAdminSession(request: Request): Promise<NextResponse | null> {
  const result = await requireAdmin(request);
  return result instanceof NextResponse ? result : null;
}
