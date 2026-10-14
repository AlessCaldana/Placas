import { describe, expect, it } from "vitest";
import {
  buildProductSearchText,
  localizeProductText,
} from "@/lib/product-translations";
import { parseNewProductInput, parseProductTranslationsInput } from "@/lib/validators/product";

const baseProduct = {
  referenceCode: "PF-900",
  name: "Targa garage",
  categoryName: "Auto",
  size: "30 × 40 cm",
  price: "5",
  status: "PUBLISHED",
};

describe("parseProductTranslationsInput", () => {
  it("returns undefined when translations are not sent", () => {
    expect(parseProductTranslationsInput(undefined)).toEqual({ ok: true, data: undefined });
    expect(parseProductTranslationsInput(null)).toEqual({ ok: true, data: undefined });
  });

  it("trims values, fills missing fields and ignores unknown keys", () => {
    expect(
      parseProductTranslationsInput({
        fr: { name: "  Plaque garage ", description: " Belle plaque " },
        en: { name: "Garage sign" },
        nl: {},
        it: { name: "ignored" },
        de: { name: "ignored" },
      }),
    ).toEqual({
      ok: true,
      data: {
        fr: { name: "Plaque garage", description: "Belle plaque" },
        en: { name: "Garage sign", description: "" },
        nl: { name: "", description: "" },
      },
    });
  });

  it("rejects wrong types and values over the limits", () => {
    expect(parseProductTranslationsInput("fr").ok).toBe(false);
    expect(parseProductTranslationsInput([]).ok).toBe(false);
    expect(parseProductTranslationsInput({ fr: "Plaque" }).ok).toBe(false);
    expect(parseProductTranslationsInput({ es: { name: 42 } }).ok).toBe(false);
    expect(parseProductTranslationsInput({ en: { description: ["x"] } }).ok).toBe(false);
    expect(parseProductTranslationsInput({ nl: { name: "x".repeat(201) } }).ok).toBe(false);
    expect(parseProductTranslationsInput({ nl: { description: "x".repeat(5001) } }).ok).toBe(
      false,
    );
    expect(parseProductTranslationsInput({ nl: { name: "x".repeat(200) } }).ok).toBe(true);
  });
});

describe("parseNewProductInput translations", () => {
  it("omits translations when the body has none (update keeps stored ones)", () => {
    const parsed = parseNewProductInput(baseProduct);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.data).not.toHaveProperty("translations");
  });

  it("includes parsed translations", () => {
    expect(
      parseNewProductInput({ ...baseProduct, translations: { es: { name: " Placa " } } }),
    ).toMatchObject({
      ok: true,
      data: { translations: { es: { name: "Placa", description: "" } } },
    });
  });

  it("marks the product invalid when translations are malformed", () => {
    expect(parseNewProductInput({ ...baseProduct, translations: { fr: { name: 1 } } }).ok).toBe(
      false,
    );
    expect(parseNewProductInput({ ...baseProduct, translations: "fr" }).ok).toBe(false);
  });
});

describe("localizeProductText", () => {
  const base = { name: "Targa garage", description: "Descrizione italiana" };
  const translations = [
    { locale: "FR" as const, name: "Plaque garage", description: "Description française" },
    { locale: "EN" as const, name: "Garage sign", description: "   " },
    { locale: "ES" as const, name: " ", description: "Descripción" },
  ];

  it("uses the Italian base fields for Italian", () => {
    expect(localizeProductText(base, translations, "it")).toEqual(base);
  });

  it("uses the translation when both fields are present", () => {
    expect(localizeProductText(base, translations, "fr")).toEqual({
      name: "Plaque garage",
      description: "Description française",
    });
  });

  it("falls back to Italian per field when blank or missing", () => {
    expect(localizeProductText(base, translations, "en")).toEqual({
      name: "Garage sign",
      description: "Descrizione italiana",
    });
    expect(localizeProductText(base, translations, "es")).toEqual({
      name: "Targa garage",
      description: "Descripción",
    });
    expect(localizeProductText(base, translations, "nl")).toEqual(base);
    expect(localizeProductText({ name: "X", description: null }, [], "nl")).toEqual({
      name: "X",
      description: "",
    });
  });

  it("ignores stored Italian rows", () => {
    expect(
      localizeProductText(base, [{ locale: "IT", name: "Altro", description: "Altro" }], "it"),
    ).toEqual(base);
  });
});

describe("buildProductSearchText", () => {
  it("joins the Italian name, translated names, brand and model without duplicates", () => {
    expect(
      buildProductSearchText({ name: "Targa garage", brand: "BMW", model: "S1000RR" }, [
        { locale: "FR", name: "Plaque garage", description: null },
        { locale: "EN", name: "Garage sign", description: null },
        { locale: "NL", name: "Targa garage", description: null },
        { locale: "ES", name: " ", description: null },
        { locale: "IT", name: "Ignorato", description: null },
      ]),
    ).toBe("Targa garage · Plaque garage · Garage sign · BMW · S1000RR");
  });

  it("works without translations or brand", () => {
    expect(buildProductSearchText({ name: "Targa" })).toBe("Targa");
  });
});
