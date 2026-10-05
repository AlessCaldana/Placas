import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  deleteProductImageFiles,
  bufferRequestWithinProductImageLimit,
  contentLengthExceedsProductImageLimit,
  maxProductImageCount,
  maxProductImageRequestSize,
  maxProductImageSize,
  storeProductImageFiles,
  validateProductImageContents,
  validateProductImageFiles,
} from "@/lib/product-images";

describe("validateProductImageFiles", () => {
  it("allows supported image files within size and count limits", () => {
    expect(validateProductImageFiles([{ type: "image/jpeg", size: 1024 }])).toBeNull();
    expect(
      validateProductImageFiles([{ type: "image/png", size: maxProductImageSize }]),
    ).toBeNull();
  });

  it("rejects unsupported types, oversized files, and too many images", () => {
    expect(validateProductImageFiles([{ type: "text/plain", size: 100 }])).toBe(
      "invalid_image_type",
    );
    expect(
      validateProductImageFiles([{ type: "image/webp", size: maxProductImageSize + 1 }]),
    ).toBe("image_too_large");
    expect(
      validateProductImageFiles(
        Array.from({ length: maxProductImageCount + 1 }, () => ({
          type: "image/jpeg",
          size: 100,
        })),
      ),
    ).toBe("too_many_images");
  });

  it("rejects files that claim an image MIME type without a matching signature", async () => {
    const spoofedFile = new File(["not an image"], "spoof.png", {
      type: "image/png",
    });
    const validPngHeader = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      "valid.png",
      { type: "image/png" },
    );

    expect(await validateProductImageContents([spoofedFile])).toBe("invalid_image_type");
    expect(await validateProductImageContents([validPngHeader])).toBeNull();
  });

  it("rejects oversized declared and streamed request bodies", async () => {
    expect(
      contentLengthExceedsProductImageLimit(String(maxProductImageRequestSize + 1)),
    ).toBe(true);
    expect(contentLengthExceedsProductImageLimit(null)).toBe(false);

    const oversizedRequest = new Request("http://localhost/upload", {
      method: "POST",
      body: "12345",
    });
    await expect(bufferRequestWithinProductImageLimit(oversizedRequest, 4)).resolves.toBe(
      null,
    );
  });

  it("stores files under public/uploads and removes them after use", async () => {
    const [url] = await storeProductImageFiles([
      new File([new Uint8Array([1, 2, 3])], "sample.png", { type: "image/png" }),
    ]);
    const path = join(process.cwd(), "public", url.slice(1));

    expect(existsSync(path)).toBe(true);
    await deleteProductImageFiles([url]);
    expect(existsSync(path)).toBe(false);
  });
});
