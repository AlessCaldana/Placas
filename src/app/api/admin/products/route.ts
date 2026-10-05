import { NextResponse } from "next/server";
import { createAdminProduct, listAdminProducts } from "@/lib/services/products";
import { isDatabaseConfigured } from "@/lib/db";
import { parseNewProductInput } from "@/lib/validators/product";
import {
  bufferRequestWithinProductImageLimit,
  contentLengthExceedsProductImageLimit,
  deleteProductImageFiles,
  storeProductImageFiles,
  validateProductImageContents,
  validateProductImageFiles,
} from "@/lib/product-images";

export const dynamic = "force-dynamic";

function isAdminApiEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ADMIN_PREVIEW === "1";
}

function unavailableResponse() {
  return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
}

export async function GET() {
  if (!isAdminApiEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!isDatabaseConfigured()) return unavailableResponse();

  try {
    return NextResponse.json(await listAdminProducts());
  } catch {
    return NextResponse.json({ error: "database_unavailable" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!isAdminApiEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!isDatabaseConfigured()) return unavailableResponse();
  if (contentLengthExceedsProductImageLimit(request.headers.get("content-length"))) {
    return NextResponse.json({ error: "request_too_large" }, { status: 413 });
  }
  const boundedRequest = await bufferRequestWithinProductImageLimit(request);
  if (!boundedRequest) {
    return NextResponse.json({ error: "request_too_large" }, { status: 413 });
  }

  let body: unknown = null;
  let files: File[] = [];
  if (boundedRequest.headers.get("content-type")?.includes("multipart/form-data")) {
    const formData = await boundedRequest.formData().catch(() => null);
    const productField = formData?.get("product");
    if (typeof productField === "string") {
      try {
        body = JSON.parse(productField);
      } catch {
        body = null;
      }
    }
    files = (formData?.getAll("photos") ?? []).filter(
      (value): value is File => value instanceof File && value.size > 0,
    );
  } else {
    body = await boundedRequest.json().catch(() => null);
  }

  const parsed = parseNewProductInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: "invalid_product" }, { status: 400 });
  }

  const imageError = validateProductImageFiles(files);
  if (imageError) return NextResponse.json({ error: imageError }, { status: 400 });
  const imageContentsError = await validateProductImageContents(files);
  if (imageContentsError) {
    return NextResponse.json({ error: imageContentsError }, { status: 400 });
  }

  let imageUrls: string[] = [];
  try {
    imageUrls = await storeProductImageFiles(files);
    return NextResponse.json(await createAdminProduct(parsed.data, imageUrls), {
      status: 201,
    });
  } catch (error) {
    await deleteProductImageFiles(imageUrls).catch(() => undefined);
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "reference_in_use" }, { status: 409 });
    }
    return NextResponse.json({ error: "product_save_failed" }, { status: 500 });
  }
}
