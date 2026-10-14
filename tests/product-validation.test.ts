import { describe, expect, it } from "vitest";
import { isProductId, parseNewProductInput } from "@/lib/validators/product";

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
    // Drafts may be saved without a reference (the service assigns DRAFT-<uuid>);
    // a product to be published needs one.
    expect(parseNewProductInput({ ...validProduct, referenceCode: " " }).ok).toBe(true);
    expect(
      parseNewProductInput({ ...validProduct, status: "PUBLISHED", referenceCode: " " }).ok,
    ).toBe(false);
    expect(parseNewProductInput({ ...validProduct, price: "5.999" }).ok).toBe(false);
    expect(parseNewProductInput({ ...validProduct, quantity: "-1" }).ok).toBe(false);
  });

  it("enforces the database limits instead of failing with a 500", () => {
    const ok = (overrides: Record<string, unknown>) => parseNewProductInput({ ...validProduct, ...overrides }).ok;
    for (const field of ["brand", "model", "material"]) {
      expect(ok({ [field]: "a".repeat(120) })).toBe(true);
      expect(ok({ [field]: ` ${"a".repeat(120)} ` })).toBe(true);
      expect(ok({ [field]: "a".repeat(121) })).toBe(false);
    }
    expect(ok({ description: "d".repeat(5000) })).toBe(true);
    expect(ok({ description: "d".repeat(5001) })).toBe(false);
    expect(ok({ quantity: "2147483647" })).toBe(true);
    expect(ok({ quantity: 2147483647 })).toBe(true);
    expect(ok({ quantity: "2147483648" })).toBe(false);
    expect(ok({ quantity: "1e20" })).toBe(false);
    expect(ok({ quantity: "1.5" })).toBe(false);
    expect(ok({ quantity: null })).toBe(true);
  });
});

describe("isProductId", () => {
  it("accepts only product UUIDs", () => {
    expect(isProductId("0b6f5d3e-8f1c-4d2a-9a37-2c1e5b7d9f01")).toBe(true);
    expect(isProductId("0B6F5D3E-8F1C-4D2A-9A37-2C1E5B7D9F01")).toBe(true);
    expect(isProductId("0b6f5d3e-8f1c-4d2a-9a37-2c1e5b7d9f01 ")).toBe(false);
    expect(isProductId("../../etc/passwd")).toBe(false);
    expect(isProductId(42)).toBe(false);
  });
});
