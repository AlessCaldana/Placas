import { NextResponse } from "next/server";
import { rejectWithoutAdminSession } from "@/lib/admin-auth";
import { isDatabaseConfigured } from "@/lib/db";
import { createAdminCategory } from "@/lib/services/categories";
import { BODY_LIMITS, bodyErrorResponse, readBoundedJson } from "@/lib/request-body";
import { isCrossOriginRequest } from "@/lib/request-origin";

export const dynamic = "force-dynamic";

function enabled() {
  return process.env.NODE_ENV !== "production" || process.env.ADMIN_PREVIEW === "1";
}

export async function POST(request: Request) {
  if (isCrossOriginRequest(request)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 403 });
  }
  const denied = await rejectWithoutAdminSession(request);
  if (denied) return denied;
  if (!enabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }

  const read = await readBoundedJson(request, BODY_LIMITS.smallJson);
  if (!read.ok) return bodyErrorResponse(read.error);
  const body = read.value;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_category" }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
  const parentId = input.parentId === null || input.parentId === undefined
    ? null
    : typeof input.parentId === "string" ? input.parentId : false;
  const active = typeof input.active === "boolean" ? input.active : true;
  if (!name || name.length > 120 || parentId === false) {
    return NextResponse.json({ error: "invalid_category" }, { status: 400 });
  }

  try {
    const category = await createAdminCategory({ name, parentId, active });
    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "category_parent_not_found") {
      return NextResponse.json({ error: "category_parent_not_found" }, { status: 404 });
    }
    if (
      (error instanceof Error && error.message === "category_exists") ||
      (error && typeof error === "object" && "code" in error && error.code === "P2002")
    ) {
      return NextResponse.json({ error: "category_exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "category_save_failed" }, { status: 500 });
  }
}
