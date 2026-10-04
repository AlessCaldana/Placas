import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ app: "ok", database: "not_configured" });
  }
  try {
    await getDb().$queryRaw`SELECT 1`;
    return NextResponse.json({ app: "ok", database: "ok" });
  } catch {
    // No se expone el detalle del error al exterior.
    return NextResponse.json({ app: "ok", database: "error" }, { status: 503 });
  }
}
