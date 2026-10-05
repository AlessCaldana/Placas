import { describe, expect, it } from "vitest";
import { parseNewProductInput } from "@/lib/validators/product";

const validProduct = {
  referenceCode: "PL-001",
  name: "Garage plate",
  categoryName: "Auto",
  subcategoryName: "BMW",
  size: "30 × 40 cm",
  price: "5",
  quantity: "0",
  status: "DRAFT",
};

describe("parseNewProductInput", () => {
  it("normalizes valid product values for PostgreSQL", () => {
    expect(parseNewProductInput(validProduct)).toMatchObject({
      ok: true,
      data: {
        referenceCode: "PL-001",
        price: "5.00",
        quantity: 0,
        status: "DRAFT",
      },
    });
  });

  it("rejects missing reference, invalid money, and negative quantity", () => {
    expect(parseNewProductInput({ ...validProduct, referenceCode: " " }).ok).toBe(false);
    expect(parseNewProductInput({ ...validProduct, price: "5.999" }).ok).toBe(false);
    expect(parseNewProductInput({ ...validProduct, quantity: "-1" }).ok).toBe(false);
  });
});
