import { getDb, isDatabaseConfigured } from "@/lib/db";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { isCrossOriginRequest } from "@/lib/request-origin";
import { isProductId } from "@/lib/validators/product";

export const dynamic = "force-dynamic";

// Views only rank the featured products, so excess requests are simply not
// counted: 3 per trustworthy IP and product every 10 minutes, and at most 30
// per product per minute overall (the only limit when IPs cannot be trusted).
const PER_IP_PRODUCT_MAX = 3;
const PER_PRODUCT_MAX = 30;
const ipProductLimiter = createRateLimiter({ max: PER_IP_PRODUCT_MAX, windowMs: 10 * 60 * 1000 });
const productLimiter = createRateLimiter({ max: PER_PRODUCT_MAX, windowMs: 60 * 1000 });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isCrossOriginRequest(request)) {
    return Response.json({ error: "invalid_request" }, { status: 403 });
  }
  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  const { id: rawId } = await params;
  if (!isProductId(rawId)) {
    return Response.json({ error: "Invalid product" }, { status: 400 });
  }
  const id = rawId.toLowerCase();

  const ip = clientIp(request);
  const ipKey = ip ? `${ip}|${id}` : null;
  const retryAfter = Math.max(
    productLimiter.retryAfterSeconds(id),
    ipKey ? ipProductLimiter.retryAfterSeconds(ipKey) : 0,
  );
  if (retryAfter > 0) {
    return Response.json(
      { error: "too_many_requests" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }
  productLimiter.register(id);
  if (ipKey) ipProductLimiter.register(ipKey);

  try {
    const result = await getDb().product.updateMany({
      where: { id, status: "PUBLISHED", category: { active: true } },
      data: { viewCount: { increment: 1 } },
    });
    if (result.count === 0) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }
    return new Response(null, { status: 204 });
  } catch {
    return Response.json({ error: "Could not record product view" }, { status: 503 });
  }
}
