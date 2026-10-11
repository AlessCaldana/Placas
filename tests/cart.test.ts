import { describe, expect, it } from "vitest";
import { canChangeCartQuantity } from "@/lib/cart";

describe("canChangeCartQuantity", () => {
  it("does not allow adding a product with zero stock", () => {
    expect(canChangeCartQuantity(0, 0, 1)).toBe(false);
  });

  it("allows increasing up to stock, but never past it", () => {
    expect(canChangeCartQuantity(5, 4, 1)).toBe(true);
    expect(canChangeCartQuantity(5, 5, 1)).toBe(false);
  });

  it("allows reducing the cart quantity and treats null stock as unlimited", () => {
    expect(canChangeCartQuantity(5, 1, -1)).toBe(true);
    expect(canChangeCartQuantity(5, 0, -1)).toBe(false);
    expect(canChangeCartQuantity(null, 100, 1)).toBe(true);
  });
});
