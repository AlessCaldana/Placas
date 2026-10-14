import { NextResponse } from "next/server";
import { AdminUserError, type AdminUserErrorCode } from "@/lib/services/admin-users";

const STATUS: Record<AdminUserErrorCode, number> = {
  email_in_use: 409,
  user_not_found: 404,
  last_superadmin: 409,
  cannot_deactivate_self: 409,
  cannot_demote_self: 409,
  use_account_password: 400,
  weak_password: 400,
  invalid_current_password: 400,
  no_account: 400,
};

/** JSON response for a service error; unknown errors become 500 with the fallback code. */
export function adminUserErrorResponse(error: unknown, fallback: string): NextResponse {
  if (error instanceof AdminUserError) {
    const body = error.reason ? { error: error.code, reason: error.reason } : { error: error.code };
    return NextResponse.json(body, { status: STATUS[error.code] });
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}
