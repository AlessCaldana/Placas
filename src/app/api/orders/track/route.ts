import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { bufferRequestWithinProductImageLimit } from "@/lib/product-images";
import { clientKey, createRateLimiter } from "@/lib/rate-limit";
import { lookupOrderTracking } from "@/lib/services/shipments";
import { parseTrackingLookupInput } from "@/lib/validators/shipment";
import { isCrossOriginRequest } from "@/lib/request-origin";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2 * 1024;
// Every lookup counts, found or not, so order numbers cannot be guessed:
// 10 per IP every 15 minutes.
const lookupLimiter = createRateLimiter({ max: 10, windowMs: 15 * 60 * 1000 });
const NO_STORE = { "Cache-Control": "no-store" };

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

export async function POST(request: Request) {
  if (isCrossOriginRequest(request)) return json({ error: "invalid_request" }, 403);
  if (!isDatabaseConfigured()) return json({ error: "database_not_configured" }, 503);

  const key = clientKey(request);
  const retryAfter = lookupLimiter.retryAfterSeconds(key);
  if (retryAfter > 0) {
    return json({ error: "too_many_requests" }, 429, { "Retry-After": String(retryAfter) });
  }
  lookupLimiter.register(key);

  // Stops reading as soon as the body exceeds the limit.
  const bounded = await bufferRequestWithinProductImageLimit(request, MAX_BODY_BYTES);
  const text = bounded ? await bounded.text().catch(() => null) : null;
  if (text === null || text.length > MAX_BODY_BYTES) return json({ error: "invalid_request" }, 400);
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  const input = parseTrackingLookupInput(body);
  if (!input) return json({ error: "invalid_request" }, 400);

  try {
    const tracking = await lookupOrderTracking(input.orderNumber, input.email);
    return tracking ? json(tracking) : json({ error: "not_found" }, 404);
  } catch (error) {
    console.error("order_tracking_failed", error);
    return json({ error: "order_tracking_failed" }, 500);
  }
}
