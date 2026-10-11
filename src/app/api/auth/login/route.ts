import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  createAdminSession,
  isAdminLoginConfigured,
  isAdminLoginValid,
} from "@/lib/admin-auth";
import {
  clearFailedLogins,
  loginClientKey,
  loginRetryAfterSeconds,
  registerFailedLogin,
} from "@/lib/login-rate-limit";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return NextResponse.json({ error: "invalid_request" }, { status: 403 });
  }

  if (!isAdminLoginConfigured()) {
    return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });
  }

  const clientKey = loginClientKey(request);
  const retryAfter = loginRetryAfterSeconds(clientKey);
  if (retryAfter > 0) {
    return NextResponse.json(
      { error: "too_many_attempts" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const field = (name: "email" | "password") =>
    body && typeof body === "object" && name in body &&
    typeof (body as Record<string, unknown>)[name] === "string"
      ? ((body as Record<string, unknown>)[name] as string).slice(0, 256)
      : "";
  if (!isAdminLoginValid(field("email"), field("password"))) {
    registerFailedLogin(clientKey);
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const session = createAdminSession();
  if (!session) {
    return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });
  }

  clearFailedLogins(clientKey);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
