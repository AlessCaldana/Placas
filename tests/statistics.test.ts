import { describe, expect, it } from "vitest";
import { bucketKeys, parseStatisticsPeriod, summarize } from "@/lib/services/statistics";

describe("statistics helpers", () => {
  it("lists every day of the period, including empty ones", () => {
    const keys = bucketKeys(new Date("2026-10-01T10:00:00Z"), new Date("2026-10-07T10:00:00Z"), "day");
    expect(keys).toEqual([
      "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07",
    ]);
  });

  it("lists every month without skipping or repeating", () => {
    const keys = bucketKeys(new Date("2025-10-15T10:00:00Z"), new Date("2026-10-11T10:00:00Z"), "month");
    expect(keys).toHaveLength(13);
    expect(keys[0]).toBe("2025-10");
    expect(keys.at(-1)).toBe("2026-10");
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("uses the Italian calendar day for late-evening sales", () => {
    // 23:30 UTC on 10 Oct is already 11 Oct in Rome.
    const keys = bucketKeys(new Date("2026-10-10T23:30:00Z"), new Date("2026-10-10T23:30:00Z"), "day");
    expect(keys).toEqual(["2026-10-11"]);
  });

  it("summarizes revenue (products + shipping), orders, units and average", () => {
    const kpis = summarize([
      { productsCents: 1000, shippingCents: 500, itemCount: 1 },
      { productsCents: 2000, shippingCents: 500, itemCount: 3 },
    ]);
    expect(kpis).toEqual({ revenueCents: 4000, orders: 2, units: 4, averageOrderCents: 2000 });
    expect(summarize([])).toEqual({ revenueCents: 0, orders: 0, units: 0, averageOrderCents: 0 });
  });

  it("falls back to 30 days for unknown periods", () => {
    expect(parseStatisticsPeriod("7")).toBe("7");
    expect(parseStatisticsPeriod("999")).toBe("30");
    expect(parseStatisticsPeriod(undefined)).toBe("30");
  });
});
