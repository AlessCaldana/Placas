import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  startCheckout: vi.fn(),
  maybeDeleteStaleUnpaidOrders: vi.fn(),
  after: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: mocks.after,
}));

vi.mock("@/lib/services/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/orders")>()),
  startCheckout: mocks.startCheckout,
  maybeDeleteStaleUnpaidOrders: mocks.maybeDeleteStaleUnpaidOrders,
}));

import { POST as checkout } from "@/app/api/checkout/route";
import {
  CHECKOUT_GLOBAL_MAX,
  CHECKOUT_PER_IP_MAX,
  createCheckoutGuard,
} from "@/lib/checkout-rate-limit";
import { CheckoutError } from "@/lib/services/orders";

const env = { ...process.env };
const PRODUCT = "0b6f5d3e-8f1c-4d2a-9a37-2c1e5b7d9f01";

function checkoutRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const validCart = { items: [{ productId: PRODUCT, quantity: 1 }], country: "IT", locale: "it" };

beforeEach(() => {
  process.env.DATABASE_URL = "postgresql://unused:unused@localhost:5432/unused";
  process.env.STRIPE_SECRET_KEY = "sk_test_unused";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_unused";
  process.env.STRIPE_CONNECTED_ACCOUNT_ID = "acct_unused";
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
  mocks.startCheckout.mockReset().mockResolvedValue("https://checkout.stripe.com/c/pay/cs_test_x");
  mocks.after.mockReset();
});

afterEach(() => {
  process.env = { ...env };
});

describe("checkout guard", () => {
  it("allows 5 sessions per trusted IP per 10 minutes", () => {
    const guard = createCheckoutGuard();
    const start = 1_000_000;
    for (let index = 0; index < CHECKOUT_PER_IP_MAX; index += 1) {
      expect(guard.begin("203.0.113.1", start + index)).toBe(0);
    }
    expect(guard.begin("203.0.113.1", start + 10)).toBeGreaterThan(0);
    expect(guard.begin("203.0.113.2", start + 10)).toBe(0);
    // Sliding window: free again 10 minutes after the first one.
    expect(guard.begin("203.0.113.1", start + 10 * 60 * 1000)).toBe(0);
  });

  it("caps sessions overall, also when IPs cannot be trusted", () => {
    const guard = createCheckoutGuard();
    const start = 2_000_000;
    for (let index = 0; index < CHECKOUT_GLOBAL_MAX; index += 1) expect(guard.begin(null, start)).toBe(0);
    expect(guard.begin(null, start)).toBe(600);
    expect(guard.begin("203.0.113.9", start)).toBe(600);
    guard.release(null, start);
    expect(guard.begin(null, start)).toBe(0);
  });
});

describe("POST /api/checkout", () => {
  it("refuses bodies over 16 KB with 413 before creating anything", async () => {
    const response = await checkout(checkoutRequest({ ...validCart, padding: "x".repeat(17 * 1024) }));
    expect(response.status).toBe(413);
    expect(mocks.startCheckout).not.toHaveBeenCalled();
  });

  it("creates sessions, schedules the cleanup and answers 429 past the per-IP limit", async () => {
    process.env.TRUSTED_PROXY_HOPS = "1";
    const headers = { "x-forwarded-for": "198.51.100.77" };
    for (let index = 0; index < CHECKOUT_PER_IP_MAX; index += 1) {
      const response = await checkout(checkoutRequest(validCart, headers));
      expect(response.status).toBe(200);
    }
    expect(mocks.after).toHaveBeenCalled();
    const blocked = await checkout(checkoutRequest(validCart, headers));
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: "too_many_requests" });
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(mocks.startCheckout).toHaveBeenCalledTimes(CHECKOUT_PER_IP_MAX);
  });

  it("gives the slot back when the cart is refused before an order exists", async () => {
    process.env.TRUSTED_PROXY_HOPS = "1";
    const headers = { "x-forwarded-for": "198.51.100.78" };
    mocks.startCheckout.mockRejectedValue(new CheckoutError("insufficient_stock"));
    for (let index = 0; index < CHECKOUT_PER_IP_MAX + 3; index += 1) {
      expect((await checkout(checkoutRequest(validCart, headers))).status).toBe(409);
    }
  });

  it("does not count invalid carts", async () => {
    process.env.TRUSTED_PROXY_HOPS = "1";
    const headers = { "x-forwarded-for": "198.51.100.79" };
    for (let index = 0; index < CHECKOUT_PER_IP_MAX + 3; index += 1) {
      expect((await checkout(checkoutRequest({ items: [] }, headers))).status).toBe(400);
    }
    expect((await checkout(checkoutRequest(validCart, headers))).status).toBe(200);
  });
});
