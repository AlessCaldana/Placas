import type { AdminProduct, AdminState } from "@/lib/demo-data";
import { getDb } from "@/lib/db";
import type { NewProductInput } from "@/lib/validators/product";

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
    name: product.name,
    reference: product.referenceCode,
    imageUrl: product.images?.[0]?.url ?? null,
    category: product.category.name,
    size: product.size,
    price: product.price.toNumber(),
    qty: product.quantity,
    state: product.status.toLocaleLowerCase("en") as AdminState,
  };
}

export async function listAdminProducts(): Promise<AdminProduct[]> {
  const products = await getDb().product.findMany({
    include: { category: true, images: { orderBy: { position: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  return products.map(toAdminProduct);
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
        referenceCode: input.referenceCode,
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
