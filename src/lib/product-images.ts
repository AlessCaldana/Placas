import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

export const maxProductImageCount = 8;
export const maxProductImageSize = 5 * 1024 * 1024;
export const maxProductImageRequestSize =
  maxProductImageCount * maxProductImageSize + 1024 * 1024;

const imageExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type ProductImageValidationError =
  "too_many_images" | "image_too_large" | "invalid_image_type";

export function validateProductImageFiles(
  files: readonly { size: number; type: string }[],
): ProductImageValidationError | null {
  if (files.length > maxProductImageCount) return "too_many_images";
  for (const file of files) {
    if (!imageExtensions[file.type]) return "invalid_image_type";
    if (file.size <= 0 || file.size > maxProductImageSize) return "image_too_large";
  }
  return null;
}

export async function validateProductImageContents(
  files: readonly File[],
): Promise<ProductImageValidationError | null> {
  for (const file of files) {
    const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const valid =
      (file.type === "image/jpeg" &&
        signature[0] === 0xff &&
        signature[1] === 0xd8 &&
        signature[2] === 0xff) ||
      (file.type === "image/png" &&
        signature[0] === 0x89 &&
        signature[1] === 0x50 &&
        signature[2] === 0x4e &&
        signature[3] === 0x47 &&
        signature[4] === 0x0d &&
        signature[5] === 0x0a &&
        signature[6] === 0x1a &&
        signature[7] === 0x0a) ||
      (file.type === "image/webp" &&
        signature[0] === 0x52 &&
        signature[1] === 0x49 &&
        signature[2] === 0x46 &&
        signature[3] === 0x46 &&
        signature[8] === 0x57 &&
        signature[9] === 0x45 &&
        signature[10] === 0x42 &&
        signature[11] === 0x50);
    if (!valid) return "invalid_image_type";
  }
  return null;
}

export function contentLengthExceedsProductImageLimit(value: string | null): boolean {
  if (value === null) return false;
  const length = Number(value);
  return Number.isFinite(length) && length > maxProductImageRequestSize;
}

export async function bufferRequestWithinProductImageLimit(
  request: Request,
  limit = maxProductImageRequestSize,
): Promise<Request | null> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (Number.isFinite(length) && length > limit) return null;
  }

  if (!request.body) return request;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const headers = new Headers(request.headers);
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  headers.delete("host");
  return new Request(request.url, {
    method: request.method,
    headers,
    body: Buffer.concat(chunks),
  });
}

const uploadDirectory = join(process.cwd(), "public", "uploads", "products");

export async function storeProductImageFiles(files: File[]): Promise<string[]> {
  await mkdir(uploadDirectory, { recursive: true });
  const urls: string[] = [];

  try {
    for (const file of files) {
      const extension = imageExtensions[file.type];
      const fileName = `${randomUUID()}.${extension}`;
      const bytes = Buffer.from(await file.arrayBuffer());
      await writeFile(join(uploadDirectory, fileName), bytes, { flag: "wx" });
      urls.push(`/uploads/products/${fileName}`);
    }
    return urls;
  } catch (error) {
    await deleteProductImageFiles(urls);
    throw error;
  }
}

export async function deleteProductImageFiles(urls: string[]): Promise<void> {
  await Promise.all(
    urls.map(async (url) => {
      const fileName = url.startsWith("/uploads/products/")
        ? url.slice("/uploads/products/".length)
        : "";
      if (!fileName || basename(fileName) !== fileName) return;
      await rm(join(uploadDirectory, fileName), { force: true });
    }),
  );
}
