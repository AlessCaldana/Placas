import { describe, expect, it } from "vitest";
import {
  emptySiteLegalInfo,
  normalizePecEmail,
  normalizeTaxCode,
  normalizeVatNumber,
  parseSiteLegalInput,
} from "@/lib/validators/site-legal";

describe("normalizeVatNumber", () => {
  it("accepts empty values", () => {
    expect(normalizeVatNumber("")).toBe("");
    expect(normalizeVatNumber("   ")).toBe("");
  });

  it("normalises Italian Partita IVA to 11 digits", () => {
    expect(normalizeVatNumber("12345678901")).toBe("12345678901");
    expect(normalizeVatNumber("IT12345678901")).toBe("12345678901");
    expect(normalizeVatNumber(" it 123 456 789 01 ")).toBe("12345678901");
  });

  it("rejects malformed Italian numbers", () => {
    expect(normalizeVatNumber("1234567890")).toBeNull();
    expect(normalizeVatNumber("123456789012")).toBeNull();
    expect(normalizeVatNumber("IT1234567890A")).toBeNull();
    expect(normalizeVatNumber("IT123")).toBeNull();
  });

  it("accepts other EU VAT formats in upper case", () => {
    expect(normalizeVatNumber("fr 12 345678901")).toBe("FR12345678901");
    expect(normalizeVatNumber("DE123456789")).toBe("DE123456789");
    expect(normalizeVatNumber("NL123456789B01")).toBe("NL123456789B01");
  });

  it("rejects other garbage", () => {
    expect(normalizeVatNumber("F1")).toBeNull();
    expect(normalizeVatNumber("12-345")).toBeNull();
    expect(normalizeVatNumber("FR1")).toBeNull();
    expect(normalizeVatNumber("FR12345678901234567")).toBeNull();
    expect(normalizeVatNumber("FR-1234567890")).toBeNull();
  });
});

describe("normalizeTaxCode", () => {
  it("accepts personal and company codes, upper-cased", () => {
    expect(normalizeTaxCode("rssmra80a01h501u")).toBe("RSSMRA80A01H501U");
    expect(normalizeTaxCode(" 12345678901 ")).toBe("12345678901");
    expect(normalizeTaxCode("")).toBe("");
  });

  it("rejects wrong lengths and symbols", () => {
    expect(normalizeTaxCode("1234567890")).toBeNull();
    expect(normalizeTaxCode("RSSMRA80A01H501UX")).toBeNull();
    expect(normalizeTaxCode("RSSMRA80-01H501U")).toBeNull();
  });
});

describe("normalizePecEmail", () => {
  it("accepts empty or valid addresses", () => {
    expect(normalizePecEmail("")).toBe("");
    expect(normalizePecEmail("  shop@pec.it ")).toBe("shop@pec.it");
  });

  it("rejects invalid or too long addresses", () => {
    expect(normalizePecEmail("shop@pec")).toBeNull();
    expect(normalizePecEmail("shop pec@pec.it")).toBeNull();
    expect(normalizePecEmail(`${"a".repeat(250)}@pec.it`)).toBeNull();
  });
});

describe("parseSiteLegalInput", () => {
  it("normalises all fields", () => {
    const result = parseSiteLegalInput({
      legalName: "  PFdeco   di  Mario Rossi ",
      vatNumber: "IT 12345678901",
      taxCode: "rssmra80a01h501u",
      legalAddress: "Via Roma 1\n00100   Roma (RM)",
      pecEmail: "pfdeco@pec.it",
      reaNumber: " RM - 123456 ",
    });
    expect(result).toEqual({
      ok: true,
      value: {
        legalName: "PFdeco di Mario Rossi",
        vatNumber: "12345678901",
        taxCode: "RSSMRA80A01H501U",
        legalAddress: "Via Roma 1 00100 Roma (RM)",
        pecEmail: "pfdeco@pec.it",
        reaNumber: "RM - 123456",
      },
    });
  });

  it("keeps empty strings so the caller can clear a value", () => {
    expect(parseSiteLegalInput({ ...emptySiteLegalInfo() })).toEqual({ ok: true, value: emptySiteLegalInfo() });
  });

  it("omits absent fields (older forms) so stored values are kept", () => {
    expect(parseSiteLegalInput({})).toEqual({ ok: true, value: {} });
    expect(parseSiteLegalInput({ legalName: null, vatNumber: "12345678901" })).toEqual({
      ok: true,
      value: { vatNumber: "12345678901" },
    });
  });

  it("reports the first invalid field", () => {
    expect(parseSiteLegalInput({ vatNumber: "123" })).toEqual({ ok: false, field: "vatNumber" });
    expect(parseSiteLegalInput({ taxCode: "abc" })).toEqual({ ok: false, field: "taxCode" });
    expect(parseSiteLegalInput({ pecEmail: "nope" })).toEqual({ ok: false, field: "pecEmail" });
  });

  it("rejects non-string values", () => {
    expect(parseSiteLegalInput({ legalName: new File(["x"], "x.txt") })).toEqual({ ok: false, field: "legalName" });
    expect(parseSiteLegalInput({ reaNumber: 42 })).toEqual({ ok: false, field: "reaNumber" });
  });

  it("enforces max lengths after collapsing spaces", () => {
    expect(parseSiteLegalInput({ legalName: "a".repeat(160) }).ok).toBe(true);
    expect(parseSiteLegalInput({ legalName: "a".repeat(161) })).toEqual({ ok: false, field: "legalName" });
    expect(parseSiteLegalInput({ legalName: `  ${"a ".repeat(80)}   ` }).ok).toBe(true);
    expect(parseSiteLegalInput({ legalAddress: "a".repeat(256) })).toEqual({ ok: false, field: "legalAddress" });
    expect(parseSiteLegalInput({ reaNumber: "a".repeat(41) })).toEqual({ ok: false, field: "reaNumber" });
  });

  it("rejects control and invisible format characters in free text", () => {
    expect(parseSiteLegalInput({ legalName: "PF\u0000deco" })).toEqual({ ok: false, field: "legalName" });
    expect(parseSiteLegalInput({ legalAddress: "Via‮Roma" })).toEqual({ ok: false, field: "legalAddress" });
    expect(parseSiteLegalInput({ reaNumber: "RM\u0007123" })).toEqual({ ok: false, field: "reaNumber" });
  });
});
