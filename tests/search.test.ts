import { describe, expect, it } from "vitest";
import { matchesMultilingualSearch } from "@/lib/search";

describe("matchesMultilingualSearch", () => {
  it("finds the same category with terms in Italian, Spanish, French, or English", () => {
    for (const query of ["auto", "car", "carro", "macchina", "voiture", "coche"]) {
      expect(matchesMultilingualSearch(query, "Auto")).toBe(true);
    }
  });

  it("finds localized category terms inside catalog paths", () => {
    expect(matchesMultilingualSearch("music", "Rock Edition", "Musica · Rock")).toBe(
      true,
    );
    expect(matchesMultilingualSearch("cocina", "Cucina")).toBe(true);
  });

  it("finds categories with German terms", () => {
    expect(matchesMultilingualSearch("motorrad", "Moto")).toBe(true);
    expect(matchesMultilingualSearch("Motorräder", "Moto")).toBe(true);
    expect(matchesMultilingualSearch("küche", "Cucina")).toBe(true);
    expect(matchesMultilingualSearch("fußball", "Sport")).toBe(true);
    expect(matchesMultilingualSearch("motorrad", "Cucina")).toBe(false);
  });

  it("ignores accents and letter case", () => {
    expect(matchesMultilingualSearch("CAMION", "Camión")).toBe(true);
  });

  it("does not match unrelated categories", () => {
    expect(matchesMultilingualSearch("carro", "Gaming")).toBe(false);
  });

  it("matches product reference codes", () => {
    expect(
      matchesMultilingualSearch("PL-001", "BMW S1000RR — Garage Edition", "PL-001"),
    ).toBe(true);
  });
});
