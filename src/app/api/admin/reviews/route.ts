import { NextResponse } from "next/server";
import { rejectWithoutAdminSession } from "@/lib/admin-auth";
import { isDatabaseConfigured } from "@/lib/db";
import { listAdminReviews } from "@/lib/services/reviews";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await rejectWithoutAdminSession(request);
  if (denied) return denied;
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }
  try {
    return NextResponse.json(await listAdminReviews());
  } catch {
    return NextResponse.json({ error: "reviews_unavailable" }, { status: 503 });
  }
}
