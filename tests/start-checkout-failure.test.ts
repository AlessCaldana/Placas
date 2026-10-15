import { beforeEach, describe, expect, it, vi } from "vitest";

// startCheckout never hands out a payment URL when Stripe or the database
// fails after the order was created: the order is cancelled and the error is
// rethrown (the checkout route then gives the rate-limit slot back).

const db = vi.hoisted(() => ({
  product: { findMany: vi.fn() },
  order: { create: vi.fn(), update: vi.fn() },
}));
const stripe = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("@/lib/db", () => ({
  getDb: () => db,
  isDatabaseConfigured: () => true,
}));

vi.mock("@/lib/services/site-settings", () => ({
  getSiteSettings: async () => ({ shippingRates: { IT: 500, EU: 900, WORLD: null } }),
}));

vi.mock("@/lib/payments/stripe", () => ({
  getStripe: () => ({ checkout: { sessions: { create: stripe.create } } }),
  getConnectedAccountId: () => "acct_test",
  isStripeConfigured: () => true,
}));

import { startCheckout } from "@/lib/services/orders";

const ORDER_ID = "0b6f5d3e-8f1c-4d2a-9a37-2c1e5b7d9f01";
const PRODUCT_ID = "5c2d1e0f-9a8b-4c7d-8e6f-5a4b3c2d1e0f";
const items = [{ productId: PRODUCT_ID, quantity: 1 }];

beforeEach(() => {
  db.product.findMany.mockReset().mockResolvedValue([
    { id: PRODUCT_ID, referenceCode: "PF-001", name: "Plate", price: { toFixed: () => "20.00" }, quantity: 3 },
  ]);
  db.order.create.mockReset().mockResolvedValue({ id: ORDER_ID, orderNumber: "123456" });
  db.order.update.mockReset().mockResolvedValue({});
  stripe.create.mockReset().mockResolvedValue({ id: "cs_test_ok", url: "https://checkout.stripe.com/c/pay/cs_test_ok" });
});

describe("startCheckout failures", () => {
  it("returns the URL and stores the session id when everything works", async () => {
    await expect(startCheckout(items, "IT", "it", "http://localhost:3000")).resolves.toBe(
      "https://checkout.stripe.com/c/pay/cs_test_ok",
    );
    expect(db.order.update).toHaveBeenCalledWith({ where: { id: ORDER_ID }, data: { stripeSessionId: "cs_test_ok" } });
  });

  it("cancels the order and rethrows when Stripe fails", async () => {
    stripe.create.mockRejectedValue(new Error("stripe down"));
    await expect(startCheckout(items, "IT", "it", "http://localhost:3000")).rejects.toThrow("stripe down");
    expect(db.order.update).toHaveBeenCalledWith({ where: { id: ORDER_ID }, data: { status: "CANCELLED" } });
  });

  it("cancels the order and rethrows when Stripe returns no URL", async () => {
    stripe.create.mockResolvedValue({ id: "cs_test_nourl", url: null });
    await expect(startCheckout(items, "IT", "it", "http://localhost:3000")).rejects.toThrow();
    expect(db.order.update).toHaveBeenCalledWith({ where: { id: ORDER_ID }, data: { status: "CANCELLED" } });
  });

  it("does not return the URL when the session id cannot be stored", async () => {
    db.order.update.mockRejectedValueOnce(new Error("connection lost"));
    await expect(startCheckout(items, "IT", "it", "http://localhost:3000")).rejects.toThrow("connection lost");
    expect(db.order.update).toHaveBeenLastCalledWith({ where: { id: ORDER_ID }, data: { status: "CANCELLED" } });
  });
});
