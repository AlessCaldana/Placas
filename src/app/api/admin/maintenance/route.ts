import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { isDatabaseConfigured } from "@/lib/db";
import { bodyErrorResponse, readBoundedJson } from "@/lib/request-body";
import { isCrossOriginRequest } from "@/lib/request-origin";
import { parseMaintenanceInput, readMaintenanceState, setMaintenanceState } from "@/lib/services/maintenance";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4 * 1024;
const NO_STORE = { "Cache-Control": "no-store" };

/** Current maintenance state. Any signed-in admin. */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  return NextResponse.json(await readMaintenanceState(), { headers: NO_STORE });
}

/** Turns maintenance mode on or off. SUPERADMIN only. */
export async function PUT(request: Request) {
  if (isCrossOriginRequest(request)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 403 });
  }
  const admin = await requireAdmin(request, { role: "SUPERADMIN" });
  if (admin instanceof NextResponse) return admin;
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }

  const read = await readBoundedJson(request, MAX_BODY_BYTES);
  if (!read.ok) {
    return read.error === "request_too_large"
      ? bodyErrorResponse(read.error)
      : NextResponse.json({ error: "invalid_maintenance" }, { status: 400 });
  }
  const input = parseMaintenanceInput(read.value);
  if (!input) return NextResponse.json({ error: "invalid_maintenance" }, { status: 400 });

  try {
    const saved = await setMaintenanceState(input);
    console.info("maintenance_mode_changed", { enabled: saved.enabled, by: admin.id });
    return NextResponse.json(saved, { headers: NO_STORE });
  } catch (error) {
    console.error("maintenance_save_failed", error);
    return NextResponse.json({ error: "maintenance_save_failed" }, { status: 500 });
  }
}
