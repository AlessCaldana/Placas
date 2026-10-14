import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { bufferRequestWithinProductImageLimit } from "@/lib/product-images";
import { clientKey, createRateLimiter } from "@/lib/rate-limit";
import { createReview, parseReviewInput } from "@/lib/services/reviews";
import { isCrossOriginRequest } from "@/lib/request-origin";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8 * 1024;
// Every submission counts, valid or not: 5 per IP every 15 minutes.
const submitLimiter = createRateLimiter({ max: 5, windowMs: 15 * 60 * 1000 });

export async function POST(request: Request) {
  if (isCrossOriginRequest(request)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 403 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }

  const key = clientKey(request);
  const retryAfter = submitLimiter.retryAfterSeconds(key);
  if (retryAfter > 0) {
    return NextResponse.json(
      { error: "too_many_requests" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }
  submitLimiter.register(key);

  // Stops reading as soon as the body exceeds the limit.
  const bounded = await bufferRequestWithinProductImageLimit(request, MAX_BODY_BYTES);
  const text = bounded ? await bounded.text().catch(() => null) : null;
  if (text === null || text.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "invalid_review" }, { status: 400 });
  }
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  const input = parseReviewInput(body);
  if (!input) return NextResponse.json({ error: "invalid_review" }, { status: 400 });

  try {
    const result = await createReview(input);
    if (result === "not_allowed") {
      return NextResponse.json({ error: "not_allowed" }, { status: 403 });
    }
    if (result === "already_reviewed") {
      return NextResponse.json({ error: "already_reviewed" }, { status: 409 });
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("review_save_failed", error);
    return NextResponse.json({ error: "review_save_failed" }, { status: 500 });
  }
}
