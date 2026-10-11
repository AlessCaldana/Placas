import { describe, expect, it } from "vitest";
import { locales, translations, translate } from "@/messages";

describe("interface translations", () => {
  it("provides the same interface keys in every locale", () => {
    const italianKeys = Object.keys(translations.it).sort();
    for (const locale of locales) {
      expect(Object.keys(translations[locale]).sort()).toEqual(italianKeys);
    }
  });

  it("uses the requested locale and falls back only for unknown keys", () => {
    expect(translate("es", "admin.nav.categories")).toBe("Categorías");
    expect(translate("fr", "missing.key")).toBe("missing.key");
  });
});
