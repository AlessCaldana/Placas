import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { adminUserErrorResponse } from "@/lib/admin-user-errors";
import { isDatabaseConfigured } from "@/lib/db";
import { isCrossOriginRequest } from "@/lib/request-origin";
import { createAdminUser, listAdminUsers } from "@/lib/services/admin-users";
import { parseCreateAdminUserInput } from "@/lib/validators/admin-user";

export const dynamic = "force-dynamic";

/** Panel accounts. SUPERADMIN only. */
export async function GET(request: Request) {
  const admin = await requireAdmin(request, { role: "SUPERADMIN" });
  if (admin instanceof NextResponse) return admin;
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }
  try {
    const users = await listAdminUsers();
    return NextResponse.json({ users: users.map((user) => ({ ...user, isSelf: user.id === admin.id })) });
  } catch {
    return NextResponse.json({ error: "users_unavailable" }, { status: 503 });
  }
}

/** Creates an account. SUPERADMIN only. */
export async function POST(request: Request) {
  if (isCrossOriginRequest(request)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 403 });
  }
  const admin = await requireAdmin(request, { role: "SUPERADMIN" });
  if (admin instanceof NextResponse) return admin;
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }

  const parsed = parseCreateAdminUserInput(await request.json().catch(() => null));
  if (!parsed.ok) {
    const body = parsed.error === "weak_password" ? { error: parsed.error, reason: parsed.reason } : { error: parsed.error };
    return NextResponse.json(body, { status: 400 });
  }

  try {
    const user = await createAdminUser(parsed.value);
    return NextResponse.json({ ...user, isSelf: false }, { status: 201 });
  } catch (error) {
    return adminUserErrorResponse(error, "user_save_failed");
  }
}
