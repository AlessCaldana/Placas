import { NextResponse } from "next/server";

// Bounded request body readers. Route handlers that are not behind src/proxy.ts
// (public routes, Stripe webhook) get the body straight from the client, so
// reading it with request.json()/text() would buffer any size. These helpers
// stop reading as soon as the limit is passed.

/** Body size limits (bytes) per kind of route. */
export const BODY_LIMITS = {
  /** Login form and password change: email + passwords. */
  credentials: 4 * 1024,
  /** Checkout cart, panel accounts and other small JSON forms. */
  smallJson: 16 * 1024,
  /** Stripe webhook events (Stripe sends well under this). */
  stripeWebhook: 1024 * 1024,
} as const;

export type BoundedBodyResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; error: "request_too_large" | "invalid_request" };

/**
 * Reads the whole body, or fails with "request_too_large" as soon as it (or its
 * declared Content-Length) exceeds `limit` bytes. A body that cannot be read
 * (aborted upload) is "invalid_request". A missing body reads as empty.
 */
export async function readBoundedBody(request: Request, limit: number): Promise<BoundedBodyResult> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (Number.isFinite(length) && length > limit) return { ok: false, error: "request_too_large" };
  }
  if (!request.body) return { ok: true, bytes: new Uint8Array(0) };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, error: "request_too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, error: "invalid_request" };
  }
  return { ok: true, bytes: Buffer.concat(chunks) };
}

export type BoundedTextResult =
  | { ok: true; text: string }
  | { ok: false; error: "request_too_large" | "invalid_request" };

/** readBoundedBody() decoded as UTF-8 (invalid sequences are replaced). */
export async function readBoundedText(request: Request, limit: number): Promise<BoundedTextResult> {
  const body = await readBoundedBody(request, limit);
  if (!body.ok) return body;
  return { ok: true, text: new TextDecoder().decode(body.bytes) };
}

export type BoundedJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; error: "request_too_large" | "invalid_request" };

/**
 * Reads and parses a JSON body within `limit` bytes. Malformed JSON gives
 * `value: null`, so the route's validator rejects it with its usual error.
 */
export async function readBoundedJson(request: Request, limit: number): Promise<BoundedJsonResult> {
  const body = await readBoundedText(request, limit);
  if (!body.ok) return body;
  try {
    return { ok: true, value: JSON.parse(body.text) as unknown };
  } catch {
    return { ok: true, value: null };
  }
}

/**
 * Buffers the body within `limit` bytes and returns an equivalent Request
 * (e.g. to call formData() on it), or null when the body is too large or
 * cannot be read.
 */
export async function bufferRequestWithinLimit(request: Request, limit: number): Promise<Request | null> {
  const body = await readBoundedBody(request, limit);
  if (!body.ok) return null;
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  headers.delete("host");
  return new Request(request.url, {
    method: request.method,
    headers,
    body: request.body ? Buffer.from(body.bytes) : undefined,
  });
}

/** JSON error response for a failed bounded read (413 or 400). */
export function bodyErrorResponse(
  error: "request_too_large" | "invalid_request",
  headers?: Record<string, string>,
): NextResponse {
  return NextResponse.json({ error }, { status: error === "request_too_large" ? 413 : 400, headers });
}
