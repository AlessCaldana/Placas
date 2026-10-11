import { describe, expect, it } from "vitest";
import {
  availableShippingCountries,
  isShippingCountry,
  shippingCostFor,
  shippingZoneFor,
} from "@/lib/payments/shipping";
import { parseCheckoutItems } from "@/lib/services/orders";

const productId = "0b6f5d3e-8f1c-4d2a-9a37-2c1e5b7d9f01";
const otherProductId = "6a1d7c2b-3e4f-4a5b-8c9d-0e1f2a3b4c5d";

describe("shipping zones", () => {
  it("maps countries to Italy, EU and rest of the world", () => {
    expect(shippingZoneFor("IT")).toBe("IT");
    expect(shippingZoneFor("BE")).toBe("EU");
    expect(shippingZoneFor("NL")).toBe("EU");
    expect(shippingZoneFor("CH")).toBe("WORLD");
  });

  it("only offers countries whose zone has a price", () => {
    const rates = { IT: 500, EU: 1200, WORLD: null };
    expect(shippingCostFor("FR", rates)).toBe(1200);
    expect(shippingCostFor("US", rates)).toBeNull();
    const countries = availableShippingCountries(rates);
    expect(countries).toContain("IT");
    expect(countries).toContain("DE");
    expect(countries).not.toContain("GB");
  });

  it("treats a free zone (0 €) as available", () => {
    expect(availableShippingCountries({ IT: 0, EU: null, WORLD: null })).toEqual(["IT"]);
  });

  it("rejects unknown country codes", () => {
    expect(isShippingCountry("IT")).toBe(true);
    expect(isShippingCountry("XX")).toBe(false);
    expect(isShippingCountry(42)).toBe(false);
  });
});

describe("parseCheckoutItems", () => {
  it("accepts a valid cart", () => {
    expect(parseCheckoutItems([{ productId, quantity: 2 }])).toEqual([{ productId, quantity: 2 }]);
  });

  it("rejects empty carts, bad ids, bad quantities and duplicates", () => {
    expect(parseCheckoutItems([])).toBeNull();
    expect(parseCheckoutItems("nope")).toBeNull();
    expect(parseCheckoutItems([{ productId: "demo-product-1", quantity: 1 }])).toBeNull();
    expect(parseCheckoutItems([{ productId, quantity: 0 }])).toBeNull();
    expect(parseCheckoutItems([{ productId, quantity: 1.5 }])).toBeNull();
    expect(parseCheckoutItems([{ productId, quantity: 100 }])).toBeNull();
    expect(parseCheckoutItems([{ productId, quantity: 1 }, { productId, quantity: 1 }])).toBeNull();
    expect(parseCheckoutItems([{ productId, quantity: 1 }, { productId: otherProductId, quantity: 3 }]))
      .toHaveLength(2);
  });

  it("ignores client-sent prices", () => {
    const parsed = parseCheckoutItems([{ productId, quantity: 1, price: 0.01 }]);
    expect(parsed).toEqual([{ productId, quantity: 1 }]);
  });
});
