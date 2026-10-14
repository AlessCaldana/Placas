import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  ENV_ADMIN_ID,
  readSessionCookie,
  sessionCookieOptions,
  verifySessionToken,
} from "@/lib/admin-session";
import { isDatabaseConfigured } from "@/lib/db";
import { isCrossOriginRequest } from "@/lib/request-origin";
import { revokeAdminSessions } from "@/lib/services/admin-users";

export async function POST(request: Request) {
  if (isCrossOriginRequest(request)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 403 });
  }

  // Invalidate the session on the server too, not just the cookie: for a real
  // account the sessionVersion is incremented, which signs that account out on
  // ALL its devices (simple and acceptable for a small panel). The dev
  // identity and the bootstrap (env) login have no account row and are skipped.
  const payload = verifySessionToken(readSessionCookie(request));
  if (payload && payload.userId !== ENV_ADMIN_ID && isDatabaseConfigured()) {
    try {
      await revokeAdminSessions(payload.userId, payload.sessionVersion);
    } catch (error) {
      // The cookie is still cleared below; the session expires on its own.
      console.error("admin_logout_revoke_failed", error);
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, "", sessionCookieOptions(0));
  return response;
}
