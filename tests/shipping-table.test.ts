import { describe, expect, it } from "vitest";
import {
  estimateParcelGrams,
  plateGrams,
  roundUpToNextHalfEuro,
  shippingPriceFor,
  tablePriceCents,
  TABLE_COUNTRIES,
} from "@/lib/payments/shipping-table";

describe("shipping table", () => {
  it("rounds up to the next half euro, also from a round price", () => {
    expect(roundUpToNextHalfEuro(380)).toBe(400);
    expect(roundUpToNextHalfEuro(430)).toBe(450);
    expect(roundUpToNextHalfEuro(500)).toBe(550);
    expect(roundUpToNextHalfEuro(550)).toBe(600);
    expect(roundUpToNextHalfEuro(2590)).toBe(2600);
  });

  it("estimates plate weight from the size text", () => {
    expect(plateGrams("20 x 30 cm")).toBe(180);
    expect(plateGrams("15 x 30 cm")).toBe(135);
    expect(plateGrams("35×35 cm")).toBe(368);
    expect(plateGrams("10,5 x 10 cm")).toBe(100);
    expect(plateGrams("misura unica")).toBe(250);
    expect(plateGrams(null)).toBe(250);
  });

  it("adds the packaging to the parcel weight", () => {
    expect(estimateParcelGrams([{ size: "20 x 30 cm", quantity: 1 }])).toBe(380);
    expect(estimateParcelGrams([{ size: "20 x 30 cm", quantity: 3 }, { size: "35 x 35 cm", quantity: 1 }])).toBe(1108);
  });

  it("charges the bracket the parcel fits in", () => {
    expect(shippingPriceFor("BE", 380)).toBe(400);
    expect(shippingPriceFor("BE", 500)).toBe(400);
    expect(shippingPriceFor("BE", 501)).toBe(450);
    expect(shippingPriceFor("IT", 380)).toBe(700);
    expect(shippingPriceFor("IT", 1108)).toBe(800);
    expect(shippingPriceFor("FR", 900)).toBe(600);
    expect(shippingPriceFor("PL", 25000)).toBe(3000);
  });

  it("refuses countries outside the table and parcels over 25 kg", () => {
    expect(shippingPriceFor("DE", 380)).toBeNull();
    expect(shippingPriceFor("US", 380)).toBeNull();
    expect(shippingPriceFor("BE", 25001)).toBeNull();
  });

  it("matches the table shown to the owner", () => {
    expect(TABLE_COUNTRIES).toEqual(["BE", "LU", "NL", "FR", "IT", "ES", "PT", "PL"]);
    expect([0, 1, 2, 3, 4, 5].map((index) => tablePriceCents("BE", index))).toEqual([400, 450, 450, 550, 750, 2000]);
    expect([0, 1, 2, 3, 4, 5].map((index) => tablePriceCents("FR", index))).toEqual([500, 600, 700, 750, 1000, 2250]);
    expect([0, 1, 2, 3, 4, 5].map((index) => tablePriceCents("IT", index))).toEqual([700, 750, 800, 950, 1300, 2600]);
  });
});
