import { describe, expect, it } from "vitest";
import {
  generateOrderNumber,
  normalizeOrderNumber,
  ORDER_NUMBER_ALPHABET,
} from "@/lib/order-number";
import { normalizeOrderNumber as reexportedNormalize, parseShipmentInput } from "@/lib/services/shipments";
import { buildTrackingUrl, CARRIERS, findCarrier, normalizeHttpsUrl } from "@/lib/shipping-carriers";
import { parseEmail, parseTrackingLookupInput } from "@/lib/validators/shipment";

describe("parseShipmentInput", () => {
  it("accepts a known carrier and ignores trackingUrl and unknown fields", () => {
    expect(
      parseShipmentInput({
        carrier: "brt",
        trackingNumber: "ABC123456",
        trackingUrl: "https://evil.example/x",
        shippedAt: "2020-01-01",
      }),
    ).toEqual({ carrier: "brt", trackingNumber: "ABC123456", trackingUrl: null });
  });

  it("trims and collapses spaces in the tracking number", () => {
    expect(parseShipmentInput({ carrier: "poste", trackingNumber: "  RR 123   456 IT " })?.trackingNumber).toBe(
      "RR 123 456 IT",
    );
  });

  it("accepts hyphens and the length limits", () => {
    expect(parseShipmentInput({ carrier: "dhl", trackingNumber: "12-3" })?.trackingNumber).toBe("12-3");
    expect(parseShipmentInput({ carrier: "dhl", trackingNumber: "A".repeat(64) })).not.toBeNull();
  });

  it("rejects invalid tracking numbers", () => {
    expect(parseShipmentInput({ carrier: "dhl", trackingNumber: "abc" })).toBeNull();
    expect(parseShipmentInput({ carrier: "dhl", trackingNumber: "A".repeat(65) })).toBeNull();
    expect(parseShipmentInput({ carrier: "dhl", trackingNumber: "ABC/123" })).toBeNull();
    expect(parseShipmentInput({ carrier: "dhl", trackingNumber: "<script>" })).toBeNull();
    expect(parseShipmentInput({ carrier: "dhl", trackingNumber: "----" })).toBeNull();
    expect(parseShipmentInput({ carrier: "dhl", trackingNumber: "ÀBC123" })).toBeNull();
    expect(parseShipmentInput({ carrier: "dhl", trackingNumber: 12345678 })).toBeNull();
    expect(parseShipmentInput({ carrier: "dhl" })).toBeNull();
  });

  it("rejects unknown carriers and non-object bodies", () => {
    expect(parseShipmentInput({ carrier: "pony", trackingNumber: "ABC123" })).toBeNull();
    expect(parseShipmentInput({ carrier: "BRT", trackingNumber: "ABC123" })).toBeNull();
    expect(parseShipmentInput(null)).toBeNull();
    expect(parseShipmentInput("brt")).toBeNull();
    expect(parseShipmentInput([{ carrier: "brt", trackingNumber: "ABC123" }])).toBeNull();
  });

  it("requires a valid https link for the other carrier", () => {
    expect(
      parseShipmentInput({ carrier: "other", trackingNumber: "X12345", trackingUrl: " https://track.example.com/X12345 " }),
    ).toEqual({ carrier: "other", trackingNumber: "X12345", trackingUrl: "https://track.example.com/X12345" });
    expect(parseShipmentInput({ carrier: "other", trackingNumber: "X12345" })).toBeNull();
    expect(parseShipmentInput({ carrier: "other", trackingNumber: "X12345", trackingUrl: "http://track.example.com" })).toBeNull();
    expect(parseShipmentInput({ carrier: "other", trackingNumber: "X12345", trackingUrl: "javascript:alert(1)" })).toBeNull();
    expect(parseShipmentInput({ carrier: "other", trackingNumber: "X12345", trackingUrl: "track.example.com" })).toBeNull();
    expect(
      parseShipmentInput({ carrier: "other", trackingNumber: "X12345", trackingUrl: `https://a.example/${"x".repeat(500)}` }),
    ).toBeNull();
  });
});

describe("normalizeHttpsUrl", () => {
  it("rejects credentials and non-https schemes", () => {
    expect(normalizeHttpsUrl("https://user:pass@track.example.com")).toBeNull();
    expect(normalizeHttpsUrl("data:text/html,hi")).toBeNull();
    expect(normalizeHttpsUrl("ftp://track.example.com")).toBeNull();
    expect(normalizeHttpsUrl(42)).toBeNull();
  });
});

describe("buildTrackingUrl", () => {
  it("builds an https link for every known carrier", () => {
    for (const carrier of CARRIERS.filter((entry) => entry.id !== "other")) {
      const url = buildTrackingUrl(carrier.id, "ABC123", null);
      expect(url, carrier.id).toMatch(/^https:\/\//);
      expect(url, carrier.id).toContain("ABC123");
    }
  });

  it("encodes the tracking code", () => {
    const url = buildTrackingUrl("ups", "1Z 99&x=<y>#", null);
    expect(url).toContain(encodeURIComponent("1Z 99&x=<y>#"));
    expect(url).not.toContain("&x=");
    expect(url).not.toContain(" ");
  });

  it("uses the custom link only for the other carrier", () => {
    expect(buildTrackingUrl("other", "X12345", "https://track.example.com/X")).toBe("https://track.example.com/X");
    expect(buildTrackingUrl("other", "X12345", "http://track.example.com/X")).toBeNull();
    expect(buildTrackingUrl("other", "X12345", null)).toBeNull();
    expect(buildTrackingUrl("dhl", "X12345", "https://track.example.com/X")).not.toContain("track.example.com");
  });

  it("returns null without a carrier or a code", () => {
    expect(buildTrackingUrl(null, "X12345", null)).toBeNull();
    expect(buildTrackingUrl("pony", "X12345", null)).toBeNull();
    expect(buildTrackingUrl("dhl", null, null)).toBeNull();
  });

  it("exposes readable carrier names", () => {
    expect(findCarrier("poste")?.name).toBe("Poste Italiane");
    expect(findCarrier("other")?.name).toBe("Altro");
    expect(findCarrier("nope")).toBeNull();
  });
});

describe("generateOrderNumber", () => {
  it("uses the PL- prefix and six unambiguous characters", () => {
    for (let i = 0; i < 500; i += 1) {
      expect(generateOrderNumber()).toMatch(/^PL-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
    }
  });

  it("leaves out ambiguous characters", () => {
    expect(ORDER_NUMBER_ALPHABET).toHaveLength(32);
    expect(ORDER_NUMBER_ALPHABET).not.toMatch(/[01IO]/);
  });

  it("is random", () => {
    const numbers = new Set(Array.from({ length: 200 }, () => generateOrderNumber()));
    expect(numbers.size).toBeGreaterThan(195);
  });

  it("produces numbers that round-trip through normalization", () => {
    const number = generateOrderNumber();
    expect(normalizeOrderNumber(number.toLowerCase())).toBe(number);
  });
});

describe("normalizeOrderNumber", () => {
  it("accepts the number with or without prefix, any case, with spaces around", () => {
    expect(normalizeOrderNumber("PL-ABC234")).toBe("PL-ABC234");
    expect(normalizeOrderNumber("  pl-abc234 ")).toBe("PL-ABC234");
    expect(normalizeOrderNumber("abc234")).toBe("PL-ABC234");
    expect(normalizeOrderNumber("PL ABC234")).toBe("PL-ABC234");
    expect(normalizeOrderNumber("PLABC234")).toBe("PL-ABC234");
    expect(normalizeOrderNumber("PLABCD")).toBe("PL-PLABCD");
  });

  it("accepts backfilled hex numbers", () => {
    expect(normalizeOrderNumber("PL-0A1F9E")).toBe("PL-0A1F9E");
  });

  it("rejects anything else", () => {
    expect(normalizeOrderNumber("PL-ABC23")).toBeNull();
    expect(normalizeOrderNumber("PL-ABC2345")).toBeNull();
    expect(normalizeOrderNumber("PL--ABC234")).toBeNull();
    expect(normalizeOrderNumber("XX-ABC234")).toBeNull();
    expect(normalizeOrderNumber("PL-ABC 234")).toBeNull();
    expect(normalizeOrderNumber("PL-ABC23%")).toBeNull();
    expect(normalizeOrderNumber("")).toBeNull();
    expect(normalizeOrderNumber(" ".repeat(40) + "ABC234")).toBeNull();
    expect(normalizeOrderNumber(123456)).toBeNull();
    expect(normalizeOrderNumber(null)).toBeNull();
  });

  it("is re-exported by the shipments service", () => {
    expect(reexportedNormalize).toBe(normalizeOrderNumber);
  });
});

describe("parseTrackingLookupInput", () => {
  it("normalizes the order number and trims the email", () => {
    expect(parseTrackingLookupInput({ orderNumber: "abc234", email: " Mario@Example.it " })).toEqual({
      orderNumber: "PL-ABC234",
      email: "Mario@Example.it",
    });
  });

  it("rejects invalid input", () => {
    expect(parseTrackingLookupInput({ orderNumber: "abc", email: "mario@example.it" })).toBeNull();
    expect(parseTrackingLookupInput({ orderNumber: "PL-ABC234", email: "mario" })).toBeNull();
    expect(parseTrackingLookupInput({ orderNumber: "PL-ABC234" })).toBeNull();
    expect(parseTrackingLookupInput(null)).toBeNull();
    expect(parseTrackingLookupInput([])).toBeNull();
  });

  it("limits the email length", () => {
    const local = "a".repeat(64);
    expect(parseEmail(`${local}@${"b".repeat(186)}.it`)).not.toBeNull();
    expect(parseEmail(`${local}@${"b".repeat(187)}.it`)).toBeNull();
    expect(parseEmail("mario rossi@example.it")).toBeNull();
    expect(parseEmail("mario@example")).toBeNull();
  });
});
