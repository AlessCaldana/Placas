import { NextResponse } from "next/server";
import { rejectWithoutAdminSession } from "@/lib/admin-auth";
import { isDatabaseConfigured } from "@/lib/db";
import { bufferRequestWithinProductImageLimit } from "@/lib/product-images";
import { clearOrderShipment, markOrderShipped } from "@/lib/services/shipments";
import { isUuid } from "@/lib/validators/review";
import { parseShipmentInput } from "@/lib/validators/shipment";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2 * 1024;

function enabled() {
  return process.env.NODE_ENV !== "production" || process.env.ADMIN_PREVIEW === "1";
}

// Defence in depth on top of the SameSite session cookie.
function isCrossOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== new URL(request.url).host;
  } catch {
    return true;
  }
}

async function readJsonBody(request: Request): Promise<unknown> {
  // Stops reading as soon as the body exceeds the limit.
  const bounded = await bufferRequestWithinProductImageLimit(request, MAX_BODY_BYTES);
  if (!bounded) return null;
  return bounded.json().catch(() => null);
}

/** Shared checks; returns the order id or the response to send. */
async function guard(
  request: Request,
  params: Promise<{ id: string }>,
): Promise<{ id: string } | { response: NextResponse }> {
  if (isCrossOrigin(request)) {
    return { response: NextResponse.json({ error: "invalid_request" }, { status: 403 }) };
  }
  const denied = rejectWithoutAdminSession(request);
  if (denied) return { response: denied };
  if (!enabled()) return { response: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  if (!isDatabaseConfigured()) {
    return { response: NextResponse.json({ error: "database_not_configured" }, { status: 503 }) };
  }
  const { id } = await params;
  if (!isUuid(id)) {
    return { response: NextResponse.json({ error: "order_not_found" }, { status: 404 }) };
  }
  return { id };
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const checked = await guard(request, params);
  if ("response" in checked) return checked.response;
  const input = parseShipmentInput(await readJsonBody(request));
  if (!input) return NextResponse.json({ error: "invalid_shipment" }, { status: 400 });

  try {
    const order = await markOrderShipped(checked.id, input);
    return order
      ? NextResponse.json(order)
      : NextResponse.json({ error: "order_not_found" }, { status: 404 });
  } catch (error) {
    console.error("shipment_save_failed", error);
    return NextResponse.json({ error: "shipment_save_failed" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const checked = await guard(request, params);
  if ("response" in checked) return checked.response;
  try {
    const order = await clearOrderShipment(checked.id);
    return order
      ? NextResponse.json(order)
      : NextResponse.json({ error: "order_not_found" }, { status: 404 });
  } catch (error) {
    console.error("shipment_save_failed", error);
    return NextResponse.json({ error: "shipment_save_failed" }, { status: 500 });
  }
}
