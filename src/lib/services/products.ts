import { randomUUID } from "node:crypto";
import type { AdminProduct, AdminState } from "@/lib/demo-data";
import { getDb } from "@/lib/db";
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
};

/** `null` quantity means stock is not tracked, so the product never runs out. */
function isOutOfStock(quantity: number | null): boolean {
  return quantity !== null && quantity <= 0;
}

export async function listPublicProducts(): Promise<PublicCatalogProduct[]> {
  const products = await getDb().product.findMany({
    where: { status: "PUBLISHED", category: { active: true } },
    include: {
      category: { include: { parent: true } },
      images: { orderBy: { position: "asc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });
  return products.map((product, index) => {
    const category = product.category;
    const names = category.parent
      ? [category.parent.name, category.name]
      : [category.name];
    return {
      id: product.id,
      name: product.name,
      description: product.description ?? "",
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
    };
  });
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
  images: string[];
};

export async function getAdminProduct(referenceCode: string): Promise<AdminProductDetails | null> {
  const product = await getDb().product.findUnique({
    where: { referenceCode },
    include: { category: { include: { parent: true } }, images: { orderBy: { position: "asc" } } },
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
    images: product.images.map((image) => image.url),
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
