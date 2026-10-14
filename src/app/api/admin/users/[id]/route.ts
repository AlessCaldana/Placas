import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { adminUserErrorResponse } from "@/lib/admin-user-errors";
import { isDatabaseConfigured } from "@/lib/db";
import { BODY_LIMITS, bodyErrorResponse, readBoundedJson } from "@/lib/request-body";
import { isCrossOriginRequest } from "@/lib/request-origin";
import { updateAdminUser } from "@/lib/services/admin-users";
import { parseUpdateAdminUserInput } from "@/lib/validators/admin-user";
import { isUuid } from "@/lib/validators/review";

export const dynamic = "force-dynamic";

/**
 * Updates name, role, active and/or password of an account. SUPERADMIN only.
 * A new password or a deactivation logs that account out everywhere.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (isCrossOriginRequest(request)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 403 });
  }
  const admin = await requireAdmin(request, { role: "SUPERADMIN" });
  if (admin instanceof NextResponse) return admin;
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  const read = await readBoundedJson(request, BODY_LIMITS.smallJson);
  if (!read.ok) return bodyErrorResponse(read.error);
  const parsed = parseUpdateAdminUserInput(read.value);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const user = await updateAdminUser(admin.id, id, parsed.value);
    return NextResponse.json({ ...user, isSelf: user.id === admin.id });
  } catch (error) {
    return adminUserErrorResponse(error, "user_save_failed");
  }
}
