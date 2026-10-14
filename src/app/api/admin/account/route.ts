import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/** Identity of the signed-in panel user (for client components). */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const { id, email, name, role, dev, bootstrap } = admin;
  return NextResponse.json({ id, email, name, role, dev, bootstrap, canManageUsers: role === "SUPERADMIN" });
}
