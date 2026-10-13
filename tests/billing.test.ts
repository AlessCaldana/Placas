import { describe, expect, it } from "vitest";
import { extractBillingDetails } from "@/lib/validators/billing";
import { formatAddress } from "@/lib/services/orders";

const address = {
  line1: "Rue de la Loi 16",
  line2: null,
  postal_code: "1000",
  city: "Bruxelles",
  state: null,
  country: "BE",
};

describe("extractBillingDetails", () => {
  it("keeps the business name, the first tax ID and the billing address", () => {
    const billing = extractBillingDetails({
      name: "Mario Rossi",
      business_name: "Rossi Design SRL",
      address,
      tax_ids: [
        { type: "eu_vat", value: "BE0123456789" },
        { type: "eu_vat", value: "IT01234567890" },
      ],
    });
    expect(billing).toEqual({
      invoiceRequested: true,
      businessName: "Rossi Design SRL",
      taxIdType: "eu_vat",
      taxId: "BE0123456789",
      address,
    });
    expect(formatAddress(billing.address)).toBe("Rue de la Loi 16, 1000 Bruxelles, BE");
  });

  it("does not request an invoice without tax ID nor business name", () => {
    expect(
      extractBillingDetails({ name: "Mario Rossi", business_name: null, tax_ids: [], address }),
    ).toEqual({
      invoiceRequested: false,
      businessName: null,
      taxIdType: null,
      taxId: null,
      address: null,
    });
    expect(extractBillingDetails(null).invoiceRequested).toBe(false);
    expect(extractBillingDetails({ business_name: "   ", tax_ids: null }).invoiceRequested).toBe(false);
  });

  it("requests an invoice with only a business name", () => {
    const billing = extractBillingDetails({ business_name: "Studio Blu", tax_ids: null, address });
    expect(billing.invoiceRequested).toBe(true);
    expect(billing.businessName).toBe("Studio Blu");
    expect(billing.taxId).toBeNull();
    expect(billing.taxIdType).toBeNull();
    expect(billing.address?.city).toBe("Bruxelles");
  });

  it("requests an invoice with only a tax ID", () => {
    const billing = extractBillingDetails({
      business_name: null,
      tax_ids: [{ type: "gb_vat", value: "GB123456789" }],
    });
    expect(billing.invoiceRequested).toBe(true);
    expect(billing.taxIdType).toBe("gb_vat");
    expect(billing.taxId).toBe("GB123456789");
    expect(billing.address).toBeNull();
  });

  it("removes invisible and unexpected characters and trims lengths", () => {
    const billing = extractBillingDetails({
      business_name: "  Acme‮ SRL​\n\tBis  ",
      tax_ids: [{ type: "EU_VAT", value: " BE 0123.456-789<script>\u0000 " }],
      address: {
        line1: "Via Roma\u0007 1\r\nScala B",
        line2: "​",
        postal_code: "00100",
        city: "x".repeat(300),
        state: 42,
        country: "it",
      },
    });
    expect(billing.businessName).toBe("Acme SRL Bis");
    expect(billing.taxIdType).toBe("eu_vat");
    expect(billing.taxId).toBe("BE 0123.456-789script");
    expect(billing.address).toEqual({
      line1: "Via Roma 1 Scala B",
      line2: null,
      postal_code: "00100",
      city: "x".repeat(200),
      state: null,
      country: "IT",
    });

    const long = extractBillingDetails({
      business_name: "B".repeat(500),
      tax_ids: [{ type: "a_very_long_unknown_type", value: "9".repeat(100) }],
    });
    expect(long.businessName).toHaveLength(200);
    expect(long.taxId).toHaveLength(64);
    expect(long.taxIdType).toBeNull();
  });

  it("ignores malformed tax ID entries", () => {
    expect(extractBillingDetails({ tax_ids: ["BE0123456789"] }).taxId).toBeNull();
    expect(extractBillingDetails({ tax_ids: [{ type: "eu_vat", value: "<>!!" }] })).toMatchObject({
      invoiceRequested: false,
      taxId: null,
      taxIdType: null,
    });
    expect(extractBillingDetails({ tax_ids: { type: "eu_vat", value: "BE1" } }).taxId).toBeNull();
  });
});
