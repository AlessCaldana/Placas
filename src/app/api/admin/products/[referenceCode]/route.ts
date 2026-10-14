import { NextResponse } from "next/server";
import { rejectWithoutAdminSession } from "@/lib/admin-auth";
import { isDatabaseConfigured } from "@/lib/db";
import { deleteAdminProduct, getAdminProduct, updateAdminProduct } from "@/lib/services/products";
import { parseNewProductInput } from "@/lib/validators/product";
import {
  bufferRequestWithinProductImageLimit,
  contentLengthExceedsProductImageLimit,
  deleteProductImageFiles,
  storeProductImageFiles,
  validateProductImageContents,
  validateProductImageFiles,
} from "@/lib/product-images";
import { isCrossOriginRequest } from "@/lib/request-origin";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ referenceCode: string }> };

function enabled() {
  return process.env.NODE_ENV !== "production" || process.env.ADMIN_PREVIEW === "1";
}

export async function GET(request: Request, { params }: RouteContext) {
  const denied = await rejectWithoutAdminSession(request);
  if (denied) return denied;
  if (!enabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!isDatabaseConfigured()) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  try {
    const { referenceCode } = await params;
    const product = await getAdminProduct(referenceCode);
    return product
      ? NextResponse.json(product)
      : NextResponse.json({ error: "product_not_found" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "database_unavailable" }, { status: 503 });
  }
}

export async function PUT(request: Request, { params }: RouteContext) {
  if (isCrossOriginRequest(request)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 403 });
  }
  const denied = await rejectWithoutAdminSession(request);
  if (denied) return denied;
  if (!enabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!isDatabaseConfigured()) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  if (contentLengthExceedsProductImageLimit(request.headers.get("content-length"))) {
    return NextResponse.json({ error: "request_too_large" }, { status: 413 });
  }
  const boundedRequest = await bufferRequestWithinProductImageLimit(request);
  if (!boundedRequest) return NextResponse.json({ error: "request_too_large" }, { status: 413 });
  let body: unknown = null;
  let files: File[] = [];
  if (boundedRequest.headers.get("content-type")?.includes("multipart/form-data")) {
    const form = await boundedRequest.formData().catch(() => null);
    const field = form?.get("product");
    if (typeof field === "string") {
      try { body = JSON.parse(field); } catch { body = null; }
    }
    files = (form?.getAll("photos") ?? []).filter(
      (value): value is File => value instanceof File && value.size > 0,
    );
  } else {
    body = await boundedRequest.json().catch(() => null);
  }
  const parsed = parseNewProductInput(body);
  if (!parsed.ok) return NextResponse.json({ error: "invalid_product" }, { status: 400 });
  const imageError = validateProductImageFiles(files);
  if (imageError) return NextResponse.json({ error: imageError }, { status: 400 });
  const imageContentsError = await validateProductImageContents(files);
  if (imageContentsError) return NextResponse.json({ error: imageContentsError }, { status: 400 });
  let uploadedUrls: string[] = [];
  try {
    const { referenceCode } = await params;
    if (files.length) uploadedUrls = await storeProductImageFiles(files);
    const result = await updateAdminProduct(
      referenceCode,
      parsed.data,
      files.length ? uploadedUrls : undefined,
    );
    if (result.previousImages.length) {
      await deleteProductImageFiles(result.previousImages).catch(() => undefined);
    }
    return NextResponse.json(result.product);
  } catch (error) {
    await deleteProductImageFiles(uploadedUrls).catch(() => undefined);
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "reference_in_use" }, { status: 409 });
    }
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "product_not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "product_save_failed" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  if (isCrossOriginRequest(request)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 403 });
  }
  const denied = await rejectWithoutAdminSession(request);
  if (denied) return denied;
  if (!enabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }
  try {
    const { referenceCode } = await params;
    const imageUrls = await deleteAdminProduct(referenceCode);
    if (!imageUrls) {
      return NextResponse.json({ error: "product_not_found" }, { status: 404 });
    }
    await deleteProductImageFiles(imageUrls).catch(() => undefined);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "product_delete_failed" }, { status: 500 });
  }
}
