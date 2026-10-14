import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { adminUserErrorResponse } from "@/lib/admin-user-errors";
import { ADMIN_SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/admin-session";
import { isDatabaseConfigured } from "@/lib/db";
import {
  beginPasswordChangeAttempt,
  completePasswordChangeAttempt,
  releasePasswordChangeAttempt,
} from "@/lib/login-rate-limit";
import { BODY_LIMITS, bodyErrorResponse, readBoundedJson } from "@/lib/request-body";
import { isCrossOriginRequest } from "@/lib/request-origin";
import { AdminUserError, changeOwnPassword } from "@/lib/services/admin-users";
import { parsePasswordChangeInput } from "@/lib/validators/admin-user";

export const dynamic = "force-dynamic";

/**
 * Changes the password of the signed-in account. Other sessions of the account
 * are logged out; this browser gets a fresh cookie and stays signed in.
 */
export async function POST(request: Request) {
  if (isCrossOriginRequest(request)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 403 });
  }
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  // The development identity and the bootstrap (env) login have no account row.
  if (admin.dev || admin.bootstrap) {
    return NextResponse.json({ error: "no_account" }, { status: 400 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }

  const read = await readBoundedJson(request, BODY_LIMITS.credentials);
  if (!read.ok) return bodyErrorResponse(read.error);
  const parsed = parsePasswordChangeInput(read.value);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // Check and reserve before scrypt runs, so parallel requests cannot all pass.
  const retryAfter = beginPasswordChangeAttempt(admin.id);
  if (retryAfter > 0) {
    return NextResponse.json(
      { error: "too_many_attempts" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  let sessionVersion: number;
  try {
    ({ sessionVersion } = await changeOwnPassword(
      admin.id,
      parsed.value.currentPassword,
      parsed.value.newPassword,
    ));
  } catch (error) {
    const code = error instanceof AdminUserError ? error.code : null;
    // A wrong current password keeps the reserved attempt counted; a weak new
    // password means the current one was right.
    if (code === "weak_password") completePasswordChangeAttempt(admin.id);
    else if (code !== "invalid_current_password") releasePasswordChangeAttempt(admin.id);
    return adminUserErrorResponse(error, "password_save_failed");
  }

  completePasswordChangeAttempt(admin.id);
  const response = NextResponse.json({ ok: true });
  const session = createSessionToken(admin.id, sessionVersion);
  if (session) response.cookies.set(ADMIN_SESSION_COOKIE, session, sessionCookieOptions());
  return response;
}
