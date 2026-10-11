import { describe, expect, it } from "vitest";
import {
  calculateCheckoutPricing,
  calculatePlatformFee,
  estimateStripeFee,
} from "@/lib/payments/checkout-pricing";

describe("calculatePlatformFee", () => {
  it("charges 1 € per item up to a 3 € cap", () => {
    expect(calculatePlatformFee(1)).toBe(100);
    expect(calculatePlatformFee(3)).toBe(300);
    expect(calculatePlatformFee(10)).toBe(300);
  });
});

describe("calculateCheckoutPricing", () => {
  it("matches the formula for a 20 € order with 2 items", () => {
    // (20 + 2 + 0.25) / 0.9675 = 22.997... -> 23.00 €
    const pricing = calculateCheckoutPricing(2000, 2);
    expect(pricing.total).toBe(2300);
    expect(pricing.platformFee).toBe(200);
    expect(pricing.applicationFeeAmount).toBe(300);
  });

  it("always leaves the merchant amount intact and the full platform fee to the platform", () => {
    for (let merchant = 50; merchant <= 200_000; merchant += 137) {
      for (const items of [1, 2, 3, 7]) {
        const pricing = calculateCheckoutPricing(merchant, items);
        expect(pricing.total - pricing.applicationFeeAmount).toBe(merchant);
        expect(pricing.applicationFeeAmount - estimateStripeFee(pricing.total))
          .toBeGreaterThanOrEqual(pricing.platformFee);
      }
    }
  });

  it("rejects non-integer or non-positive input", () => {
    expect(() => calculateCheckoutPricing(10.5, 1)).toThrow(RangeError);
    expect(() => calculateCheckoutPricing(0, 1)).toThrow(RangeError);
    expect(() => calculateCheckoutPricing(1000, 0)).toThrow(RangeError);
  });
});
