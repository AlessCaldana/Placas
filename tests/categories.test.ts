import { describe, expect, it } from "vitest";
import {
  capitalizeFirst,
  initialCategories,
  validateNewCategory,
} from "@/lib/categories";

describe("capitalizeFirst", () => {
  it("pone la primera letra en mayúscula y deja el resto igual", () => {
    expect(capitalizeFirst("cucina")).toBe("Cucina");
    expect(capitalizeFirst("moto GP")).toBe("Moto GP");
    expect(capitalizeFirst("")).toBe("");
  });
});

describe("validateNewCategory", () => {
  const cats = initialCategories();

  it("rechaza nombres vacíos", () => {
    expect(validateNewCategory(cats, "   ", null)).toEqual({
      ok: false,
      error: "Inserisci un nome.",
    });
  });

  it("limpia espacios y capitaliza", () => {
    expect(validateNewCategory(cats, "  sport   estremi ", null)).toEqual({
      ok: true,
      name: "Sport estremi",
    });
  });

  it("rechaza duplicados en el mismo nivel sin distinguir mayúsculas", () => {
    expect(validateNewCategory(cats, "cucina", null).ok).toBe(false);
    expect(validateNewCategory(cats, "AUTO", null).ok).toBe(false);
  });

  it("permite el mismo nombre en otro nivel", () => {
    const moto = cats.find((c) => c.name === "Moto")!;
    expect(validateNewCategory(cats, "Cucina", moto.id).ok).toBe(true);
  });
});
