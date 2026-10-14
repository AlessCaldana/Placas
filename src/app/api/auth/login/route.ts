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
  failLoginAttempt,
  loginAccountKey,
  loginPrecheckRetryAfterSeconds,
  releaseLoginAttempt,
} from "@/lib/login-rate-limit";
import { PASSWORD_INPUT_MAX_LENGTH, verifyAgainstDummyHash, verifyPassword } from "@/lib/password";
import { clientIp } from "@/lib/rate-limit";
import { BODY_LIMITS, bodyErrorResponse, readBoundedJson } from "@/lib/request-body";
import { isCrossOriginRequest } from "@/lib/request-origin";
import { findLoginUser, recordAdminLogin } from "@/lib/services/admin-users";
import { parseAdminEmail } from "@/lib/validators/admin-user";

function tooManyAttempts(retryAfter: number) {
  return NextResponse.json(
    { error: "too_many_attempts" },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

type Outcome = { kind: "session"; token: string } | { kind: "failed" } | { kind: "error"; response: NextResponse };

/** Judges the credentials. Only called with a reserved attempt; never throws. */
async function judgeCredentials(email: string, password: string): Promise<Outcome> {
  let bootstrap: boolean;
  try {
    bootstrap = await isBootstrapMode();
  } catch {
    return { kind: "error", response: NextResponse.json({ error: "auth_unavailable" }, { status: 503 }) };
  }

  if (bootstrap) {
    // No account exists yet: only the ADMIN_EMAIL/ADMIN_PASSWORD fallback works
    // (see src/lib/admin-auth.ts). It stops working once an account is created.
    if (!isEnvLoginConfigured()) {
      return { kind: "error", response: NextResponse.json({ error: "auth_not_configured" }, { status: 503 }) };
    }
    const token = isEnvLoginValid(email, password) ? createSessionToken(ENV_ADMIN_ID, 0) : null;
    return token ? { kind: "session", token } : { kind: "failed" };
  }

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
      const token = createSessionToken(user.id, user.sessionVersion);
      if (token) return { kind: "session", token };
    }
    return { kind: "failed" };
  } catch {
    return { kind: "error", response: NextResponse.json({ error: "auth_unavailable" }, { status: 503 }) };
  }
}

export async function POST(request: Request) {
  if (isCrossOriginRequest(request)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 403 });
  }

  if (!getAuthSecret()) {
    return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });
  }

  // IP (only when trustworthy) and capacity are checked before the body is read.
  const ip = clientIp(request);
  const precheck = loginPrecheckRetryAfterSeconds(ip);
  if (precheck > 0) return tooManyAttempts(precheck);

  const read = await readBoundedJson(request, BODY_LIMITS.credentials);
  if (!read.ok) return bodyErrorResponse(read.error);
  const body = read.value;
  const field = (name: "email" | "password") => {
    const value = body && typeof body === "object" ? (body as Record<string, unknown>)[name] : undefined;
    return typeof value === "string" ? value : "";
  };
  const email = field("email");
  const password = field("password");

  // Check and reserve in one synchronous step, before any await, so parallel
  // requests cannot all slip past the limit while scrypt runs.
  const accountKey = loginAccountKey(email);
  const retryAfter = beginLoginAttempt(ip, accountKey);
  if (retryAfter > 0) return tooManyAttempts(retryAfter);

  // Oversized input is refused (and counted), never truncated.
  if (email.length > 254 || password.length > PASSWORD_INPUT_MAX_LENGTH) {
    failLoginAttempt();
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  let outcome: Outcome = { kind: "error", response: NextResponse.json({ error: "auth_unavailable" }, { status: 503 }) };
  try {
    outcome = await judgeCredentials(email, password);
  } finally {
    // Exactly one settle call per reserved attempt, so the verification slot
    // is always given back.
    if (outcome.kind === "session") completeLoginAttempt(ip, accountKey);
    else if (outcome.kind === "failed") failLoginAttempt();
    else releaseLoginAttempt(ip, accountKey);
  }

  if (outcome.kind === "error") return outcome.response;
  // A failed attempt stays counted (it was reserved above).
  if (outcome.kind === "failed") {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, outcome.token, sessionCookieOptions());
  return response;
}
