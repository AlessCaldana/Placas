import { getDb } from "@/lib/db";
import { getSalesStatistics } from "@/lib/services/statistics";

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
  // Fewest pieces first: those are the ones to restock soonest.
  const lowStock = published
    .filter((product) => product.quantity !== null && product.quantity >= 0 && product.quantity <= lowStockLimit)
    .sort((a, b) => (a.quantity ?? 0) - (b.quantity ?? 0));

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

export type DashboardOverview = {
  /** Last 30 days, same figures as Statistiche (products + shipping). */
  sales: { revenueCents: number; orders: number; previousRevenueCents: number | null };
  series: { key: string; revenueCents: number }[];
  toShip: number;
  needsReview: number;
  pendingReviews: number;
  outOfStock: number;
  lowStock: { id: string; name: string; referenceCode: string; quantity: number; imageUrl: string | null }[];
  recentOrders: {
    id: string;
    orderNumber: string;
    customerName: string;
    receivedCents: number;
    paidAt: string | null;
    shipped: boolean;
    needsReview: boolean;
  }[];
};

/** Everything the Panoramica shows: money, work to do today and the latest orders. */
export async function getDashboardOverview(now = new Date()): Promise<DashboardOverview> {
  const db = getDb();
  const paidStatuses = ["PAID", "NEEDS_REVIEW"] as const;
  const [stats, toShip, needsReview, pendingReviews, products, recentOrders] = await Promise.all([
    getSalesStatistics("30", now),
    db.order.count({ where: { status: { in: [...paidStatuses] }, shippedAt: null } }),
    db.order.count({ where: { status: "NEEDS_REVIEW" } }),
    db.review.count({ where: { status: "PENDING" } }),
    db.product.findMany({
      where: { status: "PUBLISHED", quantity: { not: null, lte: lowStockLimit } },
      orderBy: [{ quantity: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        referenceCode: true,
        quantity: true,
        images: { orderBy: { position: "asc" }, take: 1, select: { url: true } },
      },
    }),
    db.order.findMany({
      where: { status: { in: [...paidStatuses] } },
      orderBy: { paidAt: "desc" },
      take: 6,
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        productsCents: true,
        shippingCents: true,
        paidAt: true,
        shippedAt: true,
        status: true,
      },
    }),
  ]);

  return {
    sales: {
      revenueCents: stats.kpis.revenueCents,
      orders: stats.kpis.orders,
      previousRevenueCents: stats.previous?.revenueCents ?? null,
    },
    series: stats.series.map((point) => ({ key: point.key, revenueCents: point.revenueCents })),
    toShip,
    needsReview,
    pendingReviews,
    outOfStock: products.filter((product) => product.quantity === 0).length,
    lowStock: products.map((product) => ({
      id: product.id,
      name: product.name,
      referenceCode: product.referenceCode,
      quantity: product.quantity ?? 0,
      imageUrl: product.images[0]?.url ?? null,
    })),
    recentOrders: recentOrders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber ?? "",
      customerName: order.customerName ?? "",
      receivedCents: order.productsCents + order.shippingCents,
      paidAt: order.paidAt?.toISOString() ?? null,
      shipped: order.shippedAt !== null,
      needsReview: order.status === "NEEDS_REVIEW",
    })),
  };
}
