import { NextResponse } from "next/server";
import { isBootstrapMode, isEnvLoginConfigured, isEnvLoginValid } from "@/lib/admin-auth";
import {
  ADMIN_SESSION_COOKIE,
  ENV_ADMIN_ID,
  createSessionToken,
  getAuthSecret,
  sessionCookieOptions,
} from "@/lib/admin-session";
import {
  beginLoginAttempt,
  completeLoginAttempt,
  loginAccountKey,
  releaseLoginAttempt,
  loginClientKey,
} from "@/lib/login-rate-limit";
import { PASSWORD_INPUT_MAX_LENGTH, verifyAgainstDummyHash, verifyPassword } from "@/lib/password";
import { isCrossOriginRequest } from "@/lib/request-origin";
import { findLoginUser, recordAdminLogin } from "@/lib/services/admin-users";
import { parseAdminEmail } from "@/lib/validators/admin-user";

export async function POST(request: Request) {
  if (isCrossOriginRequest(request)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 403 });
  }

  if (!getAuthSecret()) {
    return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });
  }

  const body: unknown = await request.json().catch(() => null);
  const field = (name: "email" | "password") => {
    const value = body && typeof body === "object" ? (body as Record<string, unknown>)[name] : undefined;
    return typeof value === "string" ? value : "";
  };
  const email = field("email");
  const password = field("password");

  // Check and reserve in one synchronous step, before any await, so parallel
  // requests cannot all slip past the limit while scrypt runs.
  const clientKey = loginClientKey(request);
  const accountKey = loginAccountKey(email);
  const retryAfter = beginLoginAttempt(clientKey, accountKey);
  if (retryAfter > 0) {
    return NextResponse.json(
      { error: "too_many_attempts" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  // Oversized input is refused (and counted), never truncated.
  if (email.length > 254 || password.length > PASSWORD_INPUT_MAX_LENGTH) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  let bootstrap: boolean;
  try {
    bootstrap = await isBootstrapMode();
  } catch {
    releaseLoginAttempt(clientKey, accountKey);
    return NextResponse.json({ error: "auth_unavailable" }, { status: 503 });
  }

  let session: string | null = null;
  if (bootstrap) {
    // No account exists yet: only the ADMIN_EMAIL/ADMIN_PASSWORD fallback works
    // (see src/lib/admin-auth.ts). It stops working once an account is created.
    if (!isEnvLoginConfigured()) {
      releaseLoginAttempt(clientKey, accountKey);
      return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });
    }
    if (isEnvLoginValid(email, password)) session = createSessionToken(ENV_ADMIN_ID, 0);
  } else {
    try {
      const normalizedEmail = parseAdminEmail(email);
      const user = normalizedEmail ? await findLoginUser(normalizedEmail) : null;
      // Unknown emails still pay for one scrypt run, so the response time does
      // not reveal which emails have an account. Inactive accounts are checked
      // the same way and then refused.
      const passwordMatches = user
        ? await verifyPassword(password, user.passwordHash)
        : await verifyAgainstDummyHash(password);
      if (user && user.active && passwordMatches) {
        await recordAdminLogin(user.id, { currentHash: user.passwordHash, password });
        session = createSessionToken(user.id, user.sessionVersion);
      }
    } catch {
      releaseLoginAttempt(clientKey, accountKey);
      return NextResponse.json({ error: "auth_unavailable" }, { status: 503 });
    }
  }

  // A failed attempt stays counted (it was reserved above).
  if (!session) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  completeLoginAttempt(clientKey, accountKey);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, session, sessionCookieOptions());
  return response;
}
