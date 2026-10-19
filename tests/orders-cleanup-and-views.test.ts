import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  order: { deleteMany: vi.fn(), findUnique: vi.fn() },
  product: { updateMany: vi.fn() },
  siteSetting: { findUnique: vi.fn() },
}));

vi.mock("@/lib/db", () => ({
  getDb: () => db,
  isDatabaseConfigured: () => true,
}));

import { POST as recordView } from "@/app/api/catalog/products/[id]/view/route";
import { clearMaintenanceCache } from "@/lib/services/maintenance";
import {
  STALE_CANCELLED_ORDER_DAYS,
  STALE_PENDING_ORDER_DAYS,
  isKnownCheckoutSession,
  maybeDeleteStaleUnpaidOrders,
  staleUnpaidOrdersWhere,
} from "@/lib/services/orders";

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  db.order.deleteMany.mockReset().mockResolvedValue({ count: 2 });
  db.order.findUnique.mockReset().mockResolvedValue(null);
  db.product.updateMany.mockReset().mockResolvedValue({ count: 1 });
  db.siteSetting.findUnique.mockReset().mockResolvedValue(null);
  clearMaintenanceCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("stale unpaid orders", () => {
  it("only targets unpaid PENDING/CANCELLED orders past their age", () => {
    const now = new Date("2026-10-14T12:00:00Z");
    const where = staleUnpaidOrdersWhere(now);
    expect(where.paidAt).toBeNull();
    expect(where.OR).toEqual([
      { status: "CANCELLED", createdAt: { lt: new Date(now.getTime() - STALE_CANCELLED_ORDER_DAYS * DAY) } },
      { status: "PENDING", createdAt: { lt: new Date(now.getTime() - STALE_PENDING_ORDER_DAYS * DAY) } },
    ]);
    const statuses = where.OR.map((condition) => condition.status);
    expect(statuses).not.toContain("PAID");
    expect(statuses).not.toContain("NEEDS_REVIEW");
    expect(STALE_CANCELLED_ORDER_DAYS).toBe(7);
    expect(STALE_PENDING_ORDER_DAYS).toBeGreaterThanOrEqual(STALE_CANCELLED_ORDER_DAYS);
  });

  it("runs at most once per hour and never throws", async () => {
    const start = 1_000_000_000_000;
    expect(await maybeDeleteStaleUnpaidOrders(start)).toBe(2);
    expect(await maybeDeleteStaleUnpaidOrders(start + 30 * 60 * 1000)).toBeNull();
    expect(db.order.deleteMany).toHaveBeenCalledTimes(1);
    expect(db.order.deleteMany).toHaveBeenCalledWith({ where: staleUnpaidOrdersWhere(new Date(start)) });

    db.order.deleteMany.mockRejectedValue(new Error("connection refused"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await maybeDeleteStaleUnpaidOrders(start + 60 * 60 * 1000)).toBeNull();
    error.mockRestore();
  });
});

describe("isKnownCheckoutSession", () => {
  it("only reports sessions stored on an order, and never queries malformed ids", async () => {
    expect(await isKnownCheckoutSession("cs_test_a1B2c3D4e5F6g7H8i9J0")).toBe(false);
    db.order.findUnique.mockResolvedValue({ id: "x" });
    expect(await isKnownCheckoutSession("cs_test_a1B2c3D4e5F6g7H8i9J0")).toBe(true);
    db.order.findUnique.mockClear();
    expect(await isKnownCheckoutSession(`cs_${"a".repeat(253)}`)).toBe(false);
    expect(await isKnownCheckoutSession("cs_test_abc-def")).toBe(false);
    expect(await isKnownCheckoutSession("pi_123456789012")).toBe(false);
    expect(db.order.findUnique).not.toHaveBeenCalled();
  });
});

describe("POST /api/catalog/products/[id]/view", () => {
  const view = (id: string, headers: Record<string, string> = {}) =>
    recordView(new Request(`http://localhost/api/catalog/products/${id}/view`, { method: "POST", headers }), {
      params: Promise.resolve({ id }),
    });

  it("rejects malformed ids without touching the database", async () => {
    for (const id of ["abc", "../etc/passwd", `${"0".repeat(36)}`, "0b6f5d3e-8f1c-4d2a-9a37-2c1e5b7d9f01x"]) {
      expect((await view(id)).status).toBe(400);
    }
    expect(db.product.updateMany).not.toHaveBeenCalled();
  });

  it("limits each trusted IP per product", async () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    const id = "1b6f5d3e-8f1c-4d2a-9a37-2c1e5b7d9f01";
    const headers = { "x-forwarded-for": "203.0.113.4" };
    for (let index = 0; index < 3; index += 1) expect((await view(id, headers)).status).toBe(204);
    expect((await view(id, headers)).status).toBe(429);
    expect((await view(id, { "x-forwarded-for": "203.0.113.5" })).status).toBe(204);
    expect(db.product.updateMany).toHaveBeenCalledTimes(4);
  });

  it("caps views per product per minute when IPs cannot be trusted", async () => {
    const id = "2b6f5d3e-8f1c-4d2a-9a37-2c1e5b7d9f01";
    for (let index = 0; index < 30; index += 1) {
      expect((await view(id, { "x-forwarded-for": `198.51.100.${index}` })).status).toBe(204);
    }
    expect((await view(id)).status).toBe(429);
    // Other products are counted separately.
    expect((await view("3b6f5d3e-8f1c-4d2a-9a37-2c1e5b7d9f01")).status).toBe(204);
  });

  it("refuses cross-site requests", async () => {
    const id = "4b6f5d3e-8f1c-4d2a-9a37-2c1e5b7d9f01";
    expect((await view(id, { origin: "https://evil.example" })).status).toBe(403);
  });

  it("does not count views while maintenance mode is on", async () => {
    db.siteSetting.findUnique.mockResolvedValue({ maintenanceMode: true, maintenanceMessage: null });
    const response = await view("5b6f5d3e-8f1c-4d2a-9a37-2c1e5b7d9f01");
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("3600");
    expect(await response.json()).toEqual({ error: "maintenance" });
    expect(db.product.updateMany).not.toHaveBeenCalled();
  });
});
