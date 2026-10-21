import { NextResponse } from "next/server";
import { rejectWithoutAdminSession } from "@/lib/admin-auth";
import { isDatabaseConfigured } from "@/lib/db";
import {
  bufferRequestWithinProductImageLimit,
  contentLengthExceedsProductImageLimit,
  deleteProductImageFiles,
  storeProductImageFiles,
  validateProductImageContents,
  validateProductImageFiles,
} from "@/lib/product-images";
import { replaceAdminProductImage } from "@/lib/services/products";
import { isCrossOriginRequest } from "@/lib/request-origin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ referenceCode: string }> };

export async function PUT(request: Request, { params }: RouteContext) {
  if (isCrossOriginRequest(request)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 403 });
  }
  const denied = await rejectWithoutAdminSession(request);
  if (denied) return denied;
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }
  if (contentLengthExceedsProductImageLimit(request.headers.get("content-length"))) {
    return NextResponse.json({ error: "request_too_large" }, { status: 413 });
  }
  const boundedRequest = await bufferRequestWithinProductImageLimit(request);
  if (!boundedRequest) {
    return NextResponse.json({ error: "request_too_large" }, { status: 413 });
  }

  const formData = await boundedRequest.formData().catch(() => null);
  const files = (formData?.getAll("image") ?? []).filter(
    (value): value is File => value instanceof File && value.size > 0,
  );
  if (files.length !== 1) {
    return NextResponse.json({ error: "invalid_image_type" }, { status: 400 });
  }

  const imageError = validateProductImageFiles(files);
  if (imageError) return NextResponse.json({ error: imageError }, { status: 400 });
  const imageContentsError = await validateProductImageContents(files);
  if (imageContentsError) {
    return NextResponse.json({ error: imageContentsError }, { status: 400 });
  }

  const { referenceCode } = await params;
  let uploadedUrls: string[] = [];
  try {
    uploadedUrls = await storeProductImageFiles(files);
    const result = await replaceAdminProductImage(referenceCode, uploadedUrls[0]);
    if (!result) {
      await deleteProductImageFiles(uploadedUrls);
      return NextResponse.json({ error: "product_not_found" }, { status: 404 });
    }

    if (result.previousUrl) {
      await deleteProductImageFiles([result.previousUrl]).catch(() => undefined);
    }
    return NextResponse.json(result.product);
  } catch {
    await deleteProductImageFiles(uploadedUrls).catch(() => undefined);
    return NextResponse.json({ error: "product_image_save_failed" }, { status: 500 });
  }
}
