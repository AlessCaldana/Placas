import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
}));

vi.mock("@/lib/payments/stripe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payments/stripe")>()),
  getStripe: () => ({ webhooks: { constructEvent: mocks.constructEvent } }),
}));

import {
  BODY_LIMITS,
  bodyErrorResponse,
  bufferRequestWithinLimit,
  readBoundedBody,
  readBoundedJson,
  readBoundedText,
} from "@/lib/request-body";
import { POST as stripeWebhook } from "@/app/api/stripe/webhook/route";

/** A request whose body arrives in chunks and has no Content-Length (like chunked uploads). */
function streamingRequest(chunks: string[], url = "http://localhost/api/x") {
  const encoder = new TextEncoder();
  let pulled = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled < chunks.length) controller.enqueue(encoder.encode(chunks[pulled++]));
      else controller.close();
    },
  });
  return {
    request: new Request(url, { method: "POST", body, duplex: "half" } as RequestInit),
    pulled: () => pulled,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  mocks.constructEvent.mockReset();
});

describe("bounded body readers", () => {
  it("reads bodies within the limit", async () => {
    const request = new Request("http://localhost/x", { method: "POST", body: '{"a":1}' });
    expect(await readBoundedJson(request, 100)).toEqual({ ok: true, value: { a: 1 } });
    const text = new Request("http://localhost/x", { method: "POST", body: "hola" });
    expect(await readBoundedText(text, 4)).toEqual({ ok: true, text: "hola" });
  });

  it("gives null for malformed JSON so validators reject it", async () => {
    const request = new Request("http://localhost/x", { method: "POST", body: "{nope" });
    expect(await readBoundedJson(request, 100)).toEqual({ ok: true, value: null });
  });

  it("rejects a declared Content-Length over the limit without reading", async () => {
    const request = new Request("http://localhost/x", {
      method: "POST",
      body: "12345",
      headers: { "content-length": "5" },
    });
    expect(await readBoundedBody(request, 4)).toEqual({ ok: false, error: "request_too_large" });
  });

  it("stops reading a streamed body as soon as it passes the limit", async () => {
    const { request, pulled } = streamingRequest(["aaaa", "bbbb", "cccc", "dddd", "eeee"]);
    expect(await readBoundedText(request, 6)).toEqual({ ok: false, error: "request_too_large" });
    expect(pulled()).toBeLessThan(5);
  });

  it("treats a missing body as empty", async () => {
    expect(await readBoundedText(new Request("http://localhost/x"), 10)).toEqual({ ok: true, text: "" });
  });

  it("re-creates a request for formData() within the limit, null over it", async () => {
    const form = new FormData();
    form.set("field", "value");
    const request = new Request("http://localhost/x", { method: "POST", body: form });
    const buffered = await bufferRequestWithinLimit(request, 10_000);
    expect((await buffered?.formData())?.get("field")).toBe("value");
    const big = new Request("http://localhost/x", { method: "POST", body: "x".repeat(20) });
    expect(await bufferRequestWithinLimit(big, 10)).toBeNull();
  });

  it("maps errors to 413 request_too_large / 400 invalid_request", async () => {
    const tooLarge = bodyErrorResponse("request_too_large");
    expect(tooLarge.status).toBe(413);
    expect(await tooLarge.json()).toEqual({ error: "request_too_large" });
    expect(bodyErrorResponse("invalid_request").status).toBe(400);
  });

  it("uses the agreed limits", () => {
    expect(BODY_LIMITS.credentials).toBe(4 * 1024);
    expect(BODY_LIMITS.smallJson).toBe(16 * 1024);
    expect(BODY_LIMITS.stripeWebhook).toBe(1024 * 1024);
  });
});

describe("Stripe webhook body limit", () => {
  it("answers 413 before verifying the signature when the body is over 1 MB", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    const { request } = streamingRequest(
      Array.from({ length: 20 }, () => "x".repeat(64 * 1024)),
      "http://localhost/api/stripe/webhook",
    );
    request.headers.set("stripe-signature", "t=1,v1=abc");
    const response = await stripeWebhook(request);
    expect(response.status).toBe(413);
    expect(mocks.constructEvent).not.toHaveBeenCalled();
  });

  it("still verifies normal-size events", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    mocks.constructEvent.mockImplementation(() => {
      throw new Error("bad signature");
    });
    const request = new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      body: '{"id":"evt_1"}',
      headers: { "stripe-signature": "t=1,v1=abc" },
    });
    const response = await stripeWebhook(request);
    expect(response.status).toBe(400);
    expect(mocks.constructEvent).toHaveBeenCalledWith('{"id":"evt_1"}', "t=1,v1=abc", "whsec_test");
  });
});
