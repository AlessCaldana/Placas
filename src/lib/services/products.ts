import { randomUUID } from "node:crypto";
import type { AdminProduct, AdminState } from "@/lib/demo-data";
import type { Prisma } from "@/generated/prisma/client";
import type { CatalogLocale } from "@/generated/prisma/enums";
import { getDb } from "@/lib/db";
import {
  buildProductSearchText,
  emptyProductTranslations,
  fromCatalogLocale,
  localizeProductText,
  productTranslationLocales,
  toCatalogLocale,
  type ProductTranslations,
} from "@/lib/product-translations";
import type { Locale } from "@/messages";
import { draftCategoryPlaceholder, type NewProductInput } from "@/lib/validators/product";

export type PublicCatalogProduct = {
  id: string;
  name: string;
  description: string;
  path: string;
  size: string;
  price: string;
  priceCents: number;
  referenceCode?: string;
  brand?: string | null;
  model?: string | null;
  material?: string | null;
  tone: number;
  categoryIds: string[];
  available: boolean;
  imageUrl: string | null;
  quantity: number | null;
  /** Italian name, every translated name, brand and model, for the public search. */
  searchText: string;
};

/** `null` quantity means stock is not tracked, so the product never runs out. */
function isOutOfStock(quantity: number | null): boolean {
  return quantity !== null && quantity <= 0;
}

/**
 * Published products with `name`/`description` in `locale`; each field falls
 * back to the Italian text when its translation is missing or blank.
 */
export async function listPublicProducts(locale: Locale = "it"): Promise<PublicCatalogProduct[]> {
  const products = await getDb().product.findMany({
    where: { status: "PUBLISHED", category: { active: true } },
    include: {
      category: { include: { parent: true } },
      images: { orderBy: { position: "asc" }, take: 1 },
      translations: { select: { locale: true, name: true, description: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return products.map((product, index) => {
    const category = product.category;
    const names = category.parent
      ? [category.parent.name, category.name]
      : [category.name];
    const text = localizeProductText(product, product.translations, locale);
    return {
      id: product.id,
      name: text.name,
      description: text.description,
      path: names.join(" · "),
      size: product.size,
      price: `€ ${product.price.toFixed(2).replace(".", ",")}`,
      priceCents: Number(product.price.toFixed(2).replace(".", "")),
      referenceCode: product.referenceCode,
      brand: product.brand,
      model: product.model,
      material: product.material,
      tone: index % 4,
      available: product.status === "PUBLISHED" && !isOutOfStock(product.quantity),
      imageUrl: product.images[0]?.url ?? null,
      quantity: product.quantity,
      categoryIds: category.parent
        ? [category.id, category.parent.id]
        : [category.id],
      searchText: buildProductSearchText(product, product.translations),
    };
  });
}

/**
 * Ids of the products to feature on the home page: available products ranked by
 * pieces sold online, then by page views, then newest first.
 */
export async function listFeaturedProductIds(limit = 8): Promise<string[]> {
  const db = getDb();
  const [products, sales] = await Promise.all([
    db.product.findMany({
      where: { status: "PUBLISHED", category: { active: true } },
      select: { id: true, quantity: true, viewCount: true, createdAt: true },
    }),
    db.orderItem.groupBy({
      by: ["productId"],
      where: { productId: { not: null }, order: { status: { in: ["PAID", "NEEDS_REVIEW"] } } },
      _sum: { quantity: true },
    }),
  ]);
  const sold = new Map(sales.map((row) => [row.productId, row._sum.quantity ?? 0]));
  return products
    .filter((product) => !isOutOfStock(product.quantity))
    .sort((a, b) =>
      (sold.get(b.id) ?? 0) - (sold.get(a.id) ?? 0) ||
      b.viewCount - a.viewCount ||
      b.createdAt.getTime() - a.createdAt.getTime(),
    )
    .slice(0, limit)
    .map((product) => product.id);
}

export type HeroProduct = {
  id: string;
  /** Name in the requested locale, falling back to Italian. */
  name: string;
  referenceCode: string;
  /** First image of the product (lowest `position`). */
  imageUrl: string;
  /** Stored alt text of that image, or the localized name when it is empty. */
  altText: string;
};

const heroProductInclude = {
  images: { orderBy: { position: "asc" }, take: 1, select: { url: true, altText: true } },
  translations: { select: { locale: true, name: true, description: true } },
} satisfies Prisma.ProductInclude;

type HeroProductRow = Prisma.ProductGetPayload<{ include: typeof heroProductInclude }>;

function toHeroProduct(product: HeroProductRow, locale: Locale): HeroProduct | null {
  const image = product.images[0];
  if (!image) return null;
  const { name } = localizeProductText(product, product.translations, locale);
  return {
    id: product.id,
    name,
    referenceCode: product.referenceCode,
    imageUrl: image.url,
    altText: image.altText?.trim() || name,
  };
}

/**
 * Products for the home page hero carousel: available products marked
 * `showOnHero` that have at least one image, most recently updated first.
 * When none is marked, falls back to the featured products (same order as
 * `listFeaturedProductIds`) that have an image, so the hero is never empty.
 */
export async function listHeroProducts(locale: Locale = "it", limit = 8): Promise<HeroProduct[]> {
  const db = getDb();
  const visible = {
    status: "PUBLISHED",
    category: { active: true },
    images: { some: {} },
  } satisfies Prisma.ProductWhereInput;
  const marked = await db.product.findMany({
    where: { ...visible, showOnHero: true },
    include: heroProductInclude,
    orderBy: { updatedAt: "desc" },
    // Headroom for out-of-stock ones, which are skipped below.
    take: limit * 4,
  });
  const chosen = marked
    .filter((product) => !isOutOfStock(product.quantity))
    .flatMap((product) => toHeroProduct(product, locale) ?? [])
    .slice(0, limit);
  if (chosen.length) return chosen;

  // Headroom so featured ones without images can be skipped.
  const featuredIds = await listFeaturedProductIds(limit * 4);
  if (!featuredIds.length) return [];
  const featured = await db.product.findMany({
    where: { ...visible, id: { in: featuredIds } },
    include: heroProductInclude,
  });
  const byId = new Map(featured.map((product) => [product.id, product]));
  return featuredIds
    .flatMap((id) => {
      const product = byId.get(id);
      if (!product || isOutOfStock(product.quantity)) return [];
      return toHeroProduct(product, locale) ?? [];
    })
    .slice(0, limit);
}

function toSlug(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("it")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "categoria"
  );
}

function toAdminProduct(product: {
  name: string;
  referenceCode: string;
  size: string;
  price: { toNumber: () => number };
  quantity: number | null;
  status: string;
  category: { name: string };
  images?: { url: string }[];
}): AdminProduct {
  return {
    name: product.name || "—",
    reference: product.referenceCode,
    imageUrl: product.images?.[0]?.url ?? null,
    category: product.category.name === draftCategoryPlaceholder ? "—" : product.category.name,
    size: product.size,
    price: product.price.toNumber(),
    qty: product.quantity,
    // A published product with no stock left is shown as unavailable automatically.
    state: product.status === "PUBLISHED" && isOutOfStock(product.quantity)
      ? "unavailable"
      : product.status.toLocaleLowerCase("en") as AdminState,
  };
}

export async function listAdminProducts(): Promise<AdminProduct[]> {
  const products = await getDb().product.findMany({
    include: { category: true, images: { orderBy: { position: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  return products.map(toAdminProduct);
}

export type AdminProductDetails = {
  referenceCode: string;
  name: string;
  description: string;
  categoryName: string;
  subcategoryName: string;
  brand: string;
  model: string;
  size: string;
  price: number;
  quantity: number | null;
  material: string;
  status: AdminState;
  /** Shown in the home page hero carousel. */
  showOnHero: boolean;
  images: string[];
  /** Translations for fr/es/en/nl; empty strings when missing. Italian is `name`/`description`. */
  translations: ProductTranslations;
};

function toAdminTranslations(
  rows: { locale: CatalogLocale; name: string; description: string | null }[],
): ProductTranslations {
  const translations = emptyProductTranslations();
  for (const row of rows) {
    const locale = fromCatalogLocale(row.locale);
    if (locale) translations[locale] = { name: row.name, description: row.description ?? "" };
  }
  return translations;
}

/**
 * Upserts the non-empty translations sent and deletes the ones sent empty.
 * Locales not present in `translations` are left untouched; Italian is never stored here.
 */
async function saveProductTranslations(
  transaction: Prisma.TransactionClient,
  productId: string,
  translations: NewProductInput["translations"],
): Promise<void> {
  if (!translations) return;
  for (const locale of productTranslationLocales) {
    const entry = translations[locale];
    if (!entry) continue;
    const catalogLocale = toCatalogLocale(locale);
    if (!entry.name && !entry.description) {
      await transaction.productTranslation.deleteMany({
        where: { productId, locale: catalogLocale },
      });
      continue;
    }
    const data = { name: entry.name, description: entry.description || null };
    await transaction.productTranslation.upsert({
      where: { productId_locale: { productId, locale: catalogLocale } },
      update: data,
      create: { productId, locale: catalogLocale, ...data },
    });
  }
}

export async function getAdminProduct(referenceCode: string): Promise<AdminProductDetails | null> {
  const product = await getDb().product.findUnique({
    where: { referenceCode },
    include: {
      category: { include: { parent: true } },
      images: { orderBy: { position: "asc" } },
      translations: { select: { locale: true, name: true, description: true } },
    },
  });
  if (!product) return null;
  return {
    referenceCode: product.referenceCode,
    name: product.name,
    description: product.description ?? "",
    categoryName: product.category.name === draftCategoryPlaceholder
      ? ""
      : product.category.parent?.name ?? product.category.name,
    subcategoryName: product.category.name === draftCategoryPlaceholder
      ? ""
      : product.category.parent ? product.category.name : "",
    brand: product.brand ?? "",
    model: product.model ?? "",
    size: product.size,
    price: product.price.toNumber(),
    quantity: product.quantity,
    material: product.material ?? "",
    status: product.status.toLocaleLowerCase("en") as AdminState,
    showOnHero: product.showOnHero,
    images: product.images.map((image) => image.url),
    translations: toAdminTranslations(product.translations),
  };
}

export async function deleteAdminProduct(referenceCode: string): Promise<string[] | null> {
  return getDb().$transaction(async (transaction) => {
    const product = await transaction.product.findUnique({
      where: { referenceCode },
      select: { images: { select: { url: true } } },
    });
    if (!product) return null;
    await transaction.product.delete({ where: { referenceCode } });
    return product.images.map((image) => image.url);
  });
}

export async function createAdminProduct(
  input: NewProductInput,
  imageUrls: string[] = [],
): Promise<AdminProduct> {
  const db = getDb();
  return db.$transaction(async (transaction) => {
    const rootSlug = toSlug(input.categoryName);
    const root = await transaction.category.upsert({
      where: { slug: rootSlug },
      update: { name: input.categoryName },
      create: { slug: rootSlug, name: input.categoryName },
    });

    let category = root;
    if (input.subcategoryName) {
      const subcategorySlug = `${rootSlug}-${toSlug(input.subcategoryName)}`;
      category = await transaction.category.upsert({
        where: { slug: subcategorySlug },
        update: { name: input.subcategoryName, parentId: root.id },
        create: {
          slug: subcategorySlug,
          name: input.subcategoryName,
          parentId: root.id,
        },
      });
    }

    const product = await transaction.product.create({
      data: {
        referenceCode: input.referenceCode || `DRAFT-${randomUUID()}`,
        name: input.name,
        description: input.description,
        categoryId: category.id,
        brand: input.brand,
        model: input.model,
        size: input.size,
        price: input.price,
        quantity: input.quantity,
        material: input.material,
        status: input.status,
        showOnHero: input.showOnHero ?? false,
        images: {
          create: imageUrls.map((url, position) => ({
            url,
            altText: input.name,
            position,
          })),
        },
      },
      include: { category: true, images: { orderBy: { position: "asc" } } },
    });
    await saveProductTranslations(transaction, product.id, input.translations);
    return toAdminProduct(product);
  });
}

export async function updateAdminProduct(
  referenceCode: string,
  input: NewProductInput,
  imageUrls?: string[],
) {
  const db = getDb();
  return db.$transaction(async (transaction) => {
    const rootSlug = toSlug(input.categoryName);
    const root = await transaction.category.upsert({
      where: { slug: rootSlug },
      update: { name: input.categoryName },
      create: { slug: rootSlug, name: input.categoryName },
    });
    let category = root;
    if (input.subcategoryName) {
      const slug = `${rootSlug}-${toSlug(input.subcategoryName)}`;
      category = await transaction.category.upsert({
        where: { slug },
        update: { name: input.subcategoryName, parentId: root.id },
        create: { slug, name: input.subcategoryName, parentId: root.id },
      });
    }
    const previousImages = imageUrls
      ? await transaction.productImage.findMany({
          where: { product: { referenceCode } },
          select: { url: true },
        })
      : [];
    const product = await transaction.product.update({
      where: { referenceCode },
      data: {
        referenceCode: input.referenceCode || referenceCode,
        name: input.name,
        description: input.description,
        categoryId: category.id,
        brand: input.brand,
        model: input.model,
        size: input.size,
        price: input.price,
        quantity: input.quantity,
        material: input.material,
        status: input.status,
        // Omitted `showOnHero` keeps the stored value.
        ...(input.showOnHero === undefined ? {} : { showOnHero: input.showOnHero }),
        ...(imageUrls
          ? {
              images: {
                deleteMany: {},
                create: imageUrls.map((url, position) => ({ url, altText: input.name, position })),
              },
            }
          : {}),
      },
      include: { category: true, images: { orderBy: { position: "asc" } } },
    });
    await saveProductTranslations(transaction, product.id, input.translations);
    return { product: toAdminProduct(product), previousImages: previousImages.map((image) => image.url) };
  });
}

export async function replaceAdminProductImage(referenceCode: string, url: string) {
  return getDb().$transaction(async (transaction) => {
    const product = await transaction.product.findUnique({
      where: { referenceCode },
      include: { images: { orderBy: { position: "asc" } } },
    });
    if (!product) return null;

    const currentImage = product.images[0];
    if (currentImage) {
      await transaction.productImage.update({
        where: { id: currentImage.id },
        data: { url, altText: product.name },
      });
    } else {
      await transaction.productImage.create({
        data: { productId: product.id, url, altText: product.name },
      });
    }

    const updated = await transaction.product.findUniqueOrThrow({
      where: { id: product.id },
      include: {
        category: true,
        images: { orderBy: { position: "asc" } },
      },
    });
    return {
      product: toAdminProduct(updated),
      previousUrl: currentImage?.url ?? null,
    };
  });
}
