import { NextResponse } from "next/server";
import { rejectWithoutAdminSession } from "@/lib/admin-auth";
import { isDatabaseConfigured } from "@/lib/db";
import { bufferRequestWithinProductImageLimit } from "@/lib/product-images";
import { deleteReview, setReviewStatus } from "@/lib/services/reviews";
import { isUuid, parseReviewStatusInput } from "@/lib/validators/review";
import { isCrossOriginRequest } from "@/lib/request-origin";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2 * 1024;

function enabled() {
  return process.env.NODE_ENV !== "production" || process.env.ADMIN_PREVIEW === "1";
}

// Defence in depth on top of the SameSite session cookie.
async function readJsonBody(request: Request): Promise<unknown> {
  // Stops reading as soon as the body exceeds the limit.
  const bounded = await bufferRequestWithinProductImageLimit(request, MAX_BODY_BYTES);
  if (!bounded) return null;
  return bounded.json().catch(() => null);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isCrossOriginRequest(request)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 403 });
  }
  const denied = await rejectWithoutAdminSession(request);
  if (denied) return denied;
  if (!enabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "review_not_found" }, { status: 404 });
  const body = await readJsonBody(request);
  const status = parseReviewStatusInput(body);
  if (!status) return NextResponse.json({ error: "invalid_review_status" }, { status: 400 });

  try {
    const review = await setReviewStatus(id, status);
    return review
      ? NextResponse.json(review)
      : NextResponse.json({ error: "review_not_found" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "review_save_failed" }, { status: 500 });
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
  if (!enabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "review_not_found" }, { status: 404 });
  try {
    const deleted = await deleteReview(id);
    return deleted
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "review_not_found" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "review_delete_failed" }, { status: 500 });
  }
}
