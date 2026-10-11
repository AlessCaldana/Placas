import { getDb } from "@/lib/db";

const lowStockLimit = 5;

export async function getDashboardInventory() {
  const products = await getDb().product.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      referenceCode: true,
      quantity: true,
      viewCount: true,
      status: true,
      createdAt: true,
      category: { select: { name: true } },
    },
  });

  const published = products.filter((product) => product.status === "PUBLISHED");
  const lowStock = published.filter(
    (product) => product.quantity !== null && product.quantity >= 0 && product.quantity <= lowStockLimit,
  );

  return {
    total: products.length,
    available: published.filter((product) => product.quantity === null || product.quantity > 0).length,
    outOfStock: published.filter((product) => product.quantity === 0).length,
    drafts: products.filter((product) => product.status === "DRAFT").length,
    lowStock,
    recent: products.slice(0, 5),
    mostViewed: [...published].sort((a, b) => b.viewCount - a.viewCount)[0]?.viewCount
      ? [...published].sort((a, b) => b.viewCount - a.viewCount)[0]
      : null,
  };
}
