import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { UNKNOWN_CLIENT, clientIp, createRateLimiter } from "@/lib/rate-limit";
import { readBoundedJson } from "@/lib/request-body";
import { lookupOrderTracking } from "@/lib/services/shipments";
import { parseTrackingLookupInput } from "@/lib/validators/shipment";
import { isCrossOriginRequest } from "@/lib/request-origin";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2 * 1024;
// Every lookup counts, found or not, so order numbers cannot be guessed:
// 10 per IP every 15 minutes. Clients whose IP cannot be trusted (no
// TRUSTED_PROXY_HOPS) share one bucket of 60.
const PER_IP_MAX = 10;
const UNKNOWN_IP_MAX = 60;
const lookupLimiter = createRateLimiter({ max: UNKNOWN_IP_MAX, windowMs: 15 * 60 * 1000 });
const NO_STORE = { "Cache-Control": "no-store" };

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

export async function POST(request: Request) {
  if (isCrossOriginRequest(request)) return json({ error: "invalid_request" }, 403);
  if (!isDatabaseConfigured()) return json({ error: "database_not_configured" }, 503);

  const ip = clientIp(request);
  const key = ip ?? UNKNOWN_CLIENT;
  const retryAfter = lookupLimiter.retryAfterSeconds(key, Date.now(), ip ? PER_IP_MAX : UNKNOWN_IP_MAX);
  if (retryAfter > 0) {
    return json({ error: "too_many_requests" }, 429, { "Retry-After": String(retryAfter) });
  }
  lookupLimiter.register(key);

  // Stops reading as soon as the body exceeds the limit.
  const read = await readBoundedJson(request, MAX_BODY_BYTES);
  if (!read.ok) return json({ error: read.error }, read.error === "request_too_large" ? 413 : 400);
  const input = parseTrackingLookupInput(read.value);
  if (!input) return json({ error: "invalid_request" }, 400);

  try {
    const tracking = await lookupOrderTracking(input.orderNumber, input.email);
    return tracking ? json(tracking) : json({ error: "not_found" }, 404);
  } catch (error) {
    console.error("order_tracking_failed", error);
    return json({ error: "order_tracking_failed" }, 500);
  }
}
