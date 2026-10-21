import { NextResponse } from "next/server";
import { rejectWithoutAdminSession } from "@/lib/admin-auth";
import { isDatabaseConfigured } from "@/lib/db";
import { deleteAdminCategory, setAdminCategoryActive } from "@/lib/services/categories";
import { BODY_LIMITS, bodyErrorResponse, readBoundedJson } from "@/lib/request-body";
import { isCrossOriginRequest } from "@/lib/request-origin";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isCrossOriginRequest(request)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 403 });
  }
  const denied = await rejectWithoutAdminSession(request);
  if (denied) return denied;
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }
  const read = await readBoundedJson(request, BODY_LIMITS.smallJson);
  if (!read.ok) return bodyErrorResponse(read.error);
  const body = read.value;
  if (!body || typeof body !== "object" || typeof (body as { active?: unknown }).active !== "boolean") {
    return NextResponse.json({ error: "invalid_category" }, { status: 400 });
  }

  try {
    const { id } = await params;
    const category = await setAdminCategoryActive(id, (body as { active: boolean }).active);
    return category
      ? NextResponse.json(category)
      : NextResponse.json({ error: "category_not_found" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "category_save_failed" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isCrossOriginRequest(request)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 403 });
  }
  const denied = await rejectWithoutAdminSession(request);
  if (denied) return denied;
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }
  try {
    const { id } = await params;
    const result = await deleteAdminCategory(id);
    if (result === "not_found") {
      return NextResponse.json({ error: "category_not_found" }, { status: 404 });
    }
    if (result === "in_use") {
      return NextResponse.json({ error: "category_in_use" }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "category_delete_failed" }, { status: 500 });
  }
}
