import { NextResponse } from "next/server";
import { isMaintenanceActive } from "@/lib/services/maintenance";

export const MAINTENANCE_RETRY_AFTER_SECONDS = 3600;

/**
 * For public Route Handlers that must stop while maintenance mode is on:
 * returns the 503 `{ error: "maintenance" }` response to send back, else null.
 * Call it right after the origin check, before any rate limit is spent.
 */
export async function rejectDuringMaintenance(): Promise<NextResponse | null> {
  if (!(await isMaintenanceActive())) return null;
  return NextResponse.json(
    { error: "maintenance" },
    {
      status: 503,
      headers: { "Retry-After": String(MAINTENANCE_RETRY_AFTER_SECONDS), "Cache-Control": "no-store" },
    },
  );
}
