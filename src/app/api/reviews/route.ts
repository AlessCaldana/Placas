import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { UNKNOWN_CLIENT, clientIp, createRateLimiter } from "@/lib/rate-limit";
import { bodyErrorResponse, readBoundedJson } from "@/lib/request-body";
import { createReview, parseReviewInput } from "@/lib/services/reviews";
import { isCrossOriginRequest } from "@/lib/request-origin";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8 * 1024;
// Every submission counts, valid or not: 5 per IP every 15 minutes. Clients
// whose IP cannot be trusted (no TRUSTED_PROXY_HOPS) share one bucket of 30.
const PER_IP_MAX = 5;
const UNKNOWN_IP_MAX = 30;
const submitLimiter = createRateLimiter({ max: UNKNOWN_IP_MAX, windowMs: 15 * 60 * 1000 });

export async function POST(request: Request) {
  if (isCrossOriginRequest(request)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 403 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }

  const ip = clientIp(request);
  const key = ip ?? UNKNOWN_CLIENT;
  const retryAfter = submitLimiter.retryAfterSeconds(key, Date.now(), ip ? PER_IP_MAX : UNKNOWN_IP_MAX);
  if (retryAfter > 0) {
    return NextResponse.json(
      { error: "too_many_requests" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }
  submitLimiter.register(key);

  // Stops reading as soon as the body exceeds the limit.
  const read = await readBoundedJson(request, MAX_BODY_BYTES);
  if (!read.ok) {
    return read.error === "request_too_large"
      ? bodyErrorResponse(read.error)
      : NextResponse.json({ error: "invalid_review" }, { status: 400 });
  }
  const input = parseReviewInput(read.value);
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
