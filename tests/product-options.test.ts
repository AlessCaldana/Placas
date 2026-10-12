import { describe, expect, it } from "vitest";
import {
  defaultProductPrices,
  defaultProductSizes,
  parseProductOptionPreferences,
} from "@/lib/product-options";

describe("parseProductOptionPreferences", () => {
  it("uses the two standard sizes and five-euro price by default", () => {
    expect(parseProductOptionPreferences(null)).toEqual({
      sizes: defaultProductSizes,
      prices: defaultProductPrices,
    });
  });

  it("keeps custom sizes and prices alongside the defaults", () => {
    expect(
      parseProductOptionPreferences(
        JSON.stringify({ sizes: [" 50 × 70 cm "], prices: [7.5, 5] }),
      ),
    ).toEqual({
      sizes: [...defaultProductSizes, "50 × 70 cm"],
      prices: [...defaultProductPrices, 7.5],
    });
  });

  it("ignores invalid and duplicate custom values", () => {
    expect(
      parseProductOptionPreferences(
        JSON.stringify({ sizes: ["20 x 30 cm", " ", 12], prices: [-1, "oops", 5, 10] }),
      ),
    ).toEqual({ sizes: defaultProductSizes, prices: defaultProductPrices });
  });

  it("falls back safely when stored JSON is malformed", () => {
    expect(parseProductOptionPreferences("{")).toEqual({
      sizes: defaultProductSizes,
      prices: defaultProductPrices,
    });
  });
});
