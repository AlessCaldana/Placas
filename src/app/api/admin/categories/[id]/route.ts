import { NextResponse } from "next/server";
import { rejectWithoutAdminSession } from "@/lib/admin-auth";
import { isDatabaseConfigured } from "@/lib/db";
import { deleteAdminCategory, setAdminCategoryActive } from "@/lib/services/categories";

export const dynamic = "force-dynamic";

function enabled() {
  return process.env.NODE_ENV !== "production" || process.env.ADMIN_PREVIEW === "1";
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = rejectWithoutAdminSession(request);
  if (denied) return denied;
  if (!enabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }
  const body: unknown = await request.json().catch(() => null);
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
  const denied = rejectWithoutAdminSession(request);
  if (denied) return denied;
  if (!enabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
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
