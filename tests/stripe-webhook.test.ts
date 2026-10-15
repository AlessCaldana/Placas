import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// In-memory stand-in for the few Prisma calls the webhook makes. Never touches
// a real database.
type FakeOrder = {
  id: string;
  stripeSessionId: string | null;
  status: string;
  totalCents: number;
  reviewReason: string | null;
  customerEmail: string | null;
  items: { productId: string | null; quantity: number; referenceCode: string }[];
};

const state = vi.hoisted(() => ({
  orders: new Map<string, FakeOrder>(),
  products: new Map<string, { quantity: number | null }>(),
}));

const mocks = vi.hoisted(() => ({ constructEvent: vi.fn() }));

function statusMatches(status: string, condition: unknown): boolean {
  if (condition === undefined) return true;
  if (typeof condition === "string") return status === condition;
  return ((condition as { in: string[] }).in ?? []).includes(status);
}

const db = vi.hoisted(() => ({
  order: {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
  },
  product: { findUnique: vi.fn(), updateMany: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: () => db,
  isDatabaseConfigured: () => true,
}));

vi.mock("@/lib/payments/stripe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payments/stripe")>()),
  getStripe: () => ({ webhooks: { constructEvent: mocks.constructEvent } }),
}));

import { POST as stripeWebhook } from "@/app/api/stripe/webhook/route";
import { cancelSessionOrder, fulfillPaidSession } from "@/lib/services/orders";

const ORDER_ID = "0b6f5d3e-8f1c-4d2a-9a37-2c1e5b7d9f01";
const OTHER_ORDER_ID = "7a1e2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b";
const PRODUCT_ID = "5c2d1e0f-9a8b-4c7d-8e6f-5a4b3c2d1e0f";
const SESSION_ID = "cs_test_a1B2c3D4e5F6g7H8i9J0";

function seed() {
  state.orders.clear();
  state.products.clear();
  state.products.set(PRODUCT_ID, { quantity: 5 });
  state.orders.set(ORDER_ID, {
    id: ORDER_ID,
    stripeSessionId: SESSION_ID,
    status: "PENDING",
    totalCents: 2500,
    reviewReason: null,
    customerEmail: null,
    items: [{ productId: PRODUCT_ID, quantity: 2, referenceCode: "PF-001" }],
  });
  state.orders.set(OTHER_ORDER_ID, {
    id: OTHER_ORDER_ID,
    stripeSessionId: "cs_test_other0000000000000",
    status: "PENDING",
    totalCents: 2500,
    reviewReason: null,
    customerEmail: null,
    items: [{ productId: PRODUCT_ID, quantity: 1, referenceCode: "PF-001" }],
  });
}

function findOrder(where: { id?: string; stripeSessionId?: string }) {
  for (const order of state.orders.values()) {
    if (where.id !== undefined && order.id !== where.id) continue;
    if (where.stripeSessionId !== undefined && order.stripeSessionId !== where.stripeSessionId) continue;
    return order;
  }
  return null;
}

function installFakeDb() {
  db.order.findUnique.mockReset().mockImplementation(async ({ where }) => {
    const order = findOrder(where);
    return order ? { id: order.id } : null;
  });
  db.order.findUniqueOrThrow.mockReset().mockImplementation(async ({ where }) => {
    const order = findOrder(where);
    if (!order) throw new Error("not found");
    return { totalCents: order.totalCents, items: order.items };
  });
  db.order.updateMany.mockReset().mockImplementation(async ({ where, data }) => {
    let count = 0;
    for (const order of state.orders.values()) {
      if (where.id !== undefined && order.id !== where.id) continue;
      if (where.stripeSessionId !== undefined && order.stripeSessionId !== where.stripeSessionId) continue;
      if (!statusMatches(order.status, where.status)) continue;
      order.status = data.status;
      if ("customerEmail" in data) order.customerEmail = data.customerEmail;
      count += 1;
    }
    return { count };
  });
  db.order.update.mockReset().mockImplementation(async ({ where, data }) => {
    const order = findOrder(where);
    if (!order) throw new Error("not found");
    Object.assign(order, data);
    return order;
  });
  db.product.findUnique.mockReset().mockImplementation(async ({ where }) => {
    const product = state.products.get(where.id);
    return product ? { quantity: product.quantity } : null;
  });
  db.product.updateMany.mockReset().mockImplementation(async ({ where, data }) => {
    const product = state.products.get(where.id);
    if (!product || product.quantity === null || product.quantity < where.quantity.gte) return { count: 0 };
    product.quantity -= data.quantity.decrement;
    return { count: 1 };
  });
  db.$transaction.mockReset().mockImplementation(async (run: (tx: typeof db) => Promise<unknown>) => run(db));
}

function paidSession(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: SESSION_ID,
    object: "checkout.session",
    mode: "payment",
    payment_status: "paid",
    amount_total: 2500,
    currency: "eur",
    client_reference_id: ORDER_ID,
    metadata: { orderId: ORDER_ID, orderNumber: "123456" },
    payment_intent: "pi_test_123",
    customer_details: { email: "buyer@example.com", name: "Buyer", phone: null },
    collected_information: null,
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  seed();
  installFakeDb();
  mocks.constructEvent.mockReset();
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  warn.mockRestore();
  vi.unstubAllEnvs();
});

describe("fulfillPaidSession", () => {
  it("marks the order bound to the session as paid and discounts stock once", async () => {
    await fulfillPaidSession(paidSession());
    expect(state.orders.get(ORDER_ID)?.status).toBe("PAID");
    expect(state.orders.get(ORDER_ID)?.customerEmail).toBe("buyer@example.com");
    expect(state.products.get(PRODUCT_ID)?.quantity).toBe(3);
    expect(db.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ORDER_ID, stripeSessionId: SESSION_ID, status: { in: ["PENDING", "CANCELLED"] } },
      }),
    );
  });

  it("a repeated delivery does not discount stock twice", async () => {
    await fulfillPaidSession(paidSession());
    await fulfillPaidSession(paidSession());
    expect(state.orders.get(ORDER_ID)?.status).toBe("PAID");
    expect(state.products.get(PRODUCT_ID)?.quantity).toBe(3);
    expect(db.product.updateMany).toHaveBeenCalledTimes(1);
  });

  it("ignores a session that is not stored on any order, whatever its metadata says", async () => {
    await fulfillPaidSession(paidSession({ id: "cs_test_foreign000000000000" }));
    expect(state.orders.get(ORDER_ID)?.status).toBe("PENDING");
    expect(state.orders.get(ORDER_ID)?.customerEmail).toBeNull();
    expect(state.products.get(PRODUCT_ID)?.quantity).toBe(5);
    expect(db.order.updateMany).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith("stripe_webhook_unknown_session", "cs_test_foreign000000000000");
  });

  it("changes nothing when metadata.orderId or client_reference_id name another order", async () => {
    await fulfillPaidSession(paidSession({ metadata: { orderId: OTHER_ORDER_ID } }));
    await fulfillPaidSession(paidSession({ client_reference_id: OTHER_ORDER_ID }));
    for (const id of [ORDER_ID, OTHER_ORDER_ID]) expect(state.orders.get(id)?.status).toBe("PENDING");
    expect(state.products.get(PRODUCT_ID)?.quantity).toBe(5);
    expect(db.order.updateMany).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith("stripe_webhook_order_mismatch", SESSION_ID, ORDER_ID);
  });

  it("accepts a session without metadata or client_reference_id (the stored session id is enough)", async () => {
    await fulfillPaidSession(paidSession({ metadata: null, client_reference_id: null }));
    expect(state.orders.get(ORDER_ID)?.status).toBe("PAID");
  });

  it("puts the order in review when the currency is not euro", async () => {
    await fulfillPaidSession(paidSession({ currency: "jpy" }));
    const order = state.orders.get(ORDER_ID);
    expect(order?.status).toBe("NEEDS_REVIEW");
    expect(order?.reviewReason).toBe("currency_mismatch");
  });

  it("reports amount and currency problems together", async () => {
    await fulfillPaidSession(paidSession({ currency: null, amount_total: 1 }));
    expect(state.orders.get(ORDER_ID)?.reviewReason).toBe("amount_mismatch, currency_mismatch");
  });

  it("ignores unpaid sessions and sessions that are not one-off payments", async () => {
    await fulfillPaidSession(paidSession({ payment_status: "unpaid" }));
    await fulfillPaidSession(paidSession({ mode: "subscription" }));
    await fulfillPaidSession(paidSession({ mode: "setup" }));
    expect(state.orders.get(ORDER_ID)?.status).toBe("PENDING");
    expect(db.order.findUnique).not.toHaveBeenCalled();
  });
});

describe("cancelSessionOrder", () => {
  it("cancels the pending order bound to the session", async () => {
    await cancelSessionOrder(paidSession({ payment_status: "unpaid" }));
    expect(state.orders.get(ORDER_ID)?.status).toBe("CANCELLED");
    expect(state.orders.get(OTHER_ORDER_ID)?.status).toBe("PENDING");
    expect(db.order.updateMany).toHaveBeenCalledWith({
      where: { stripeSessionId: SESSION_ID, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
  });

  it("cannot cancel another order through metadata", async () => {
    // A foreign session naming our order.
    await cancelSessionOrder(paidSession({ id: "cs_test_foreign000000000000" }));
    // Our session, but with metadata naming another order.
    await cancelSessionOrder(paidSession({ metadata: { orderId: OTHER_ORDER_ID } }));
    for (const id of [ORDER_ID, OTHER_ORDER_ID]) expect(state.orders.get(id)?.status).toBe("PENDING");
    expect(db.order.updateMany).not.toHaveBeenCalled();
  });

  it("does not touch paid orders", async () => {
    await fulfillPaidSession(paidSession());
    await cancelSessionOrder(paidSession());
    expect(state.orders.get(ORDER_ID)?.status).toBe("PAID");
  });
});

describe("POST /api/stripe/webhook", () => {
  function webhookRequest() {
    return new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      body: '{"id":"evt_1"}',
      headers: { "stripe-signature": "t=1,v1=abc" },
    });
  }

  it("acknowledges events of connected accounts without processing them", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    mocks.constructEvent.mockReturnValue({
      id: "evt_connected",
      type: "checkout.session.completed",
      account: "acct_someone",
      data: { object: paidSession() },
    });
    const response = await stripeWebhook(webhookRequest());
    expect(response.status).toBe(200);
    expect(warn).toHaveBeenCalledWith("stripe_webhook_connected_account_event", "evt_connected");
    expect(db.order.findUnique).not.toHaveBeenCalled();
    expect(state.orders.get(ORDER_ID)?.status).toBe("PENDING");
  });

  it("processes platform events", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    mocks.constructEvent.mockReturnValue({
      id: "evt_platform",
      type: "checkout.session.completed",
      data: { object: paidSession() },
    });
    const response = await stripeWebhook(webhookRequest());
    expect(response.status).toBe(200);
    expect(state.orders.get(ORDER_ID)?.status).toBe("PAID");
  });

  it("answers 200 to sessions it does not know, so Stripe stops retrying", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    mocks.constructEvent.mockReturnValue({
      id: "evt_foreign",
      type: "checkout.session.completed",
      data: { object: paidSession({ id: "cs_test_foreign000000000000" }) },
    });
    const response = await stripeWebhook(webhookRequest());
    expect(response.status).toBe(200);
    expect(state.orders.get(ORDER_ID)?.status).toBe("PENDING");
  });
});
