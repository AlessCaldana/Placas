import { describe, expect, it } from "vitest";
import { shipmentLocale } from "@/lib/services/shipments";
import { parseE164Phone } from "@/lib/validators/phone";
import { customerWhatsappLink, whatsappDigits } from "@/lib/whatsapp";

describe("parseE164Phone", () => {
  it("accepts E.164 numbers", () => {
    expect(parseE164Phone("+393331234567")).toBe("+393331234567");
    expect(parseE164Phone("+33612345678")).toBe("+33612345678");
    expect(parseE164Phone("+1234567")).toBe("+1234567");
    expect(parseE164Phone("+123456789012345")).toBe("+123456789012345");
  });

  it("trims surrounding whitespace", () => {
    expect(parseE164Phone("  +393331234567 ")).toBe("+393331234567");
  });

  it("rejects missing, non-string and malformed values", () => {
    expect(parseE164Phone(null)).toBeNull();
    expect(parseE164Phone(undefined)).toBeNull();
    expect(parseE164Phone(393331234567)).toBeNull();
    expect(parseE164Phone("")).toBeNull();
    expect(parseE164Phone("393331234567")).toBeNull();
    expect(parseE164Phone("+39 333 1234567")).toBeNull();
    expect(parseE164Phone("+39-333-1234567")).toBeNull();
    expect(parseE164Phone("+0393331234567")).toBeNull();
    expect(parseE164Phone("+123456")).toBeNull();
    expect(parseE164Phone("+1234567890123456")).toBeNull();
    expect(parseE164Phone("+39333abc4567")).toBeNull();
    expect(parseE164Phone(`+39${"1".repeat(40)}`)).toBeNull();
  });
});

describe("whatsappDigits", () => {
  it("keeps only digits", () => {
    expect(whatsappDigits("+39 333 123-4567")).toBe("393331234567");
    expect(whatsappDigits("+393331234567")).toBe("393331234567");
    expect(whatsappDigits("(+33) 6.12.34.56.78")).toBe("33612345678");
  });

  it("accepts 8 to 15 digits", () => {
    expect(whatsappDigits("12345678")).toBe("12345678");
    expect(whatsappDigits("123456789012345")).toBe("123456789012345");
    expect(whatsappDigits("1234567")).toBeNull();
    expect(whatsappDigits("1234567890123456")).toBeNull();
  });

  it("returns null without a usable phone", () => {
    expect(whatsappDigits(null)).toBeNull();
    expect(whatsappDigits("")).toBeNull();
    expect(whatsappDigits("no phone")).toBeNull();
  });
});

describe("customerWhatsappLink", () => {
  it("builds a wa.me link with the encoded message", () => {
    expect(customerWhatsappLink("+39 333 1234567", "Ciao! Codice: RR 123 & co")).toBe(
      "https://wa.me/393331234567?text=Ciao!%20Codice%3A%20RR%20123%20%26%20co",
    );
    expect(customerWhatsappLink("+393331234567")).toBe("https://wa.me/393331234567");
  });

  it("returns null when the phone is not usable", () => {
    expect(customerWhatsappLink(null, "Ciao")).toBeNull();
    expect(customerWhatsappLink("123", "Ciao")).toBeNull();
  });
});

describe("shipmentLocale", () => {
  it("keeps supported locales", () => {
    for (const locale of ["it", "fr", "es", "en", "nl"] as const) {
      expect(shipmentLocale(locale)).toBe(locale);
    }
  });

  it("falls back to Italian", () => {
    expect(shipmentLocale(null)).toBe("it");
    expect(shipmentLocale("")).toBe("it");
    expect(shipmentLocale("de")).toBe("it");
    expect(shipmentLocale("IT")).toBe("it");
  });
});
