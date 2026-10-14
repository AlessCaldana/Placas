import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  product: { findMany: vi.fn() },
  orderItem: { groupBy: vi.fn() },
}));

vi.mock("@/lib/db", () => ({
  getDb: () => db,
  isDatabaseConfigured: () => true,
}));

import { listHeroProducts } from "@/lib/services/products";
import { parseNewProductInput } from "@/lib/validators/product";

const validProduct = {
  referenceCode: "PL-001",
  name: "Garage plate",
  categoryName: "Auto",
  size: "30 × 40 cm",
  price: "5",
  status: "PUBLISHED",
};

describe("parseNewProductInput showOnHero", () => {
  it("accepts booleans and omits the field when it is not sent", () => {
    const on = parseNewProductInput({ ...validProduct, showOnHero: true });
    const off = parseNewProductInput({ ...validProduct, showOnHero: false });
    const missing = parseNewProductInput(validProduct);
    expect(on).toMatchObject({ ok: true, data: { showOnHero: true } });
    expect(off).toMatchObject({ ok: true, data: { showOnHero: false } });
    expect(missing.ok).toBe(true);
    expect(missing.ok && "showOnHero" in missing.data).toBe(false);
  });

  it("rejects any other type", () => {
    for (const showOnHero of ["true", "1", 1, 0, null, {}, []]) {
      expect(parseNewProductInput({ ...validProduct, showOnHero }).ok).toBe(false);
    }
  });
});

type Row = {
  id: string;
  name: string;
  description: string | null;
  referenceCode: string;
  quantity: number | null;
  viewCount: number;
  createdAt: Date;
  images: { url: string; altText: string | null }[];
  translations: { locale: string; name: string; description: string | null }[];
};

function row(id: string, overrides: Partial<Row> = {}): Row {
  return {
    id,
    name: `Targa ${id}`,
    description: null,
    referenceCode: `PF-${id}`,
    quantity: null,
    viewCount: 0,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    images: [{ url: `/uploads/${id}.webp`, altText: null }],
    translations: [],
    ...overrides,
  };
}

/**
 * Simulates Prisma: the hero query (`showOnHero: true`), the featured ranking
 * query (no `include`) and the fallback query (`id: { in }`).
 */
function mockProducts(marked: Row[], published: Row[]) {
  db.product.findMany.mockImplementation(async (args: { where: Record<string, unknown> }) => {
    const where = args.where;
    const withImages = (rows: Row[]) => rows.filter((item) => item.images.length > 0);
    if (where.showOnHero === true) return withImages(marked);
    const ids = (where.id as { in?: string[] } | undefined)?.in;
    if (ids) return withImages(published.filter((item) => ids.includes(item.id)));
    return published;
  });
}

beforeEach(() => {
  db.product.findMany.mockReset();
  db.orderItem.groupBy.mockReset().mockResolvedValue([]);
});

describe("listHeroProducts", () => {
  it("returns the marked products with their first image and localized name", async () => {
    mockProducts(
      [
        row("a", {
          translations: [{ locale: "EN", name: "Plate A", description: null }],
          images: [{ url: "/uploads/a-1.webp", altText: "Targa A" }],
        }),
        row("b", { quantity: 0 }),
        row("c", { quantity: 3 }),
      ],
      [],
    );
    const hero = await listHeroProducts("en");
    expect(hero).toEqual([
      { id: "a", name: "Plate A", referenceCode: "PF-a", imageUrl: "/uploads/a-1.webp", altText: "Targa A" },
      { id: "c", name: "Targa c", referenceCode: "PF-c", imageUrl: "/uploads/c.webp", altText: "Targa c" },
    ]);
    const heroQuery = db.product.findMany.mock.calls[0][0];
    expect(heroQuery.where).toMatchObject({
      status: "PUBLISHED",
      category: { active: true },
      images: { some: {} },
      showOnHero: true,
    });
    expect(heroQuery.orderBy).toEqual({ updatedAt: "desc" });
    expect(heroQuery.include.images).toMatchObject({ orderBy: { position: "asc" }, take: 1 });
    // Nothing marked was missing, so the featured fallback is not queried.
    expect(db.orderItem.groupBy).not.toHaveBeenCalled();
  });

  it("respects the limit", async () => {
    mockProducts([row("a"), row("b"), row("c")], []);
    expect((await listHeroProducts("it", 2)).map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("falls back to the featured products with an image, in featured order", async () => {
    mockProducts(
      [row("sold-out", { quantity: 0 })],
      [
        row("old", { createdAt: new Date("2026-09-01T00:00:00Z") }),
        row("viewed", { viewCount: 50 }),
        row("no-image", { viewCount: 99, images: [] }),
        row("best-seller"),
        row("out", { quantity: 0, viewCount: 200 }),
      ],
    );
    db.orderItem.groupBy.mockResolvedValue([{ productId: "best-seller", _sum: { quantity: 4 } }]);
    const hero = await listHeroProducts("it");
    expect(hero.map((item) => item.id)).toEqual(["best-seller", "viewed", "old"]);
  });

  it("returns an empty list when there is nothing to show", async () => {
    mockProducts([], []);
    expect(await listHeroProducts("it")).toEqual([]);
  });
});
