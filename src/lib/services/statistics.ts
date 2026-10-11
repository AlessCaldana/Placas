import { getDb } from "@/lib/db";

export const STATISTICS_PERIODS = ["7", "30", "90", "365", "all"] as const;
export type StatisticsPeriod = (typeof STATISTICS_PERIODS)[number];

export function parseStatisticsPeriod(value: unknown): StatisticsPeriod {
  return STATISTICS_PERIODS.includes(value as StatisticsPeriod) ? (value as StatisticsPeriod) : "30";
}

export type SalesKpis = {
  /** What the shop receives: products + shipping, in cents. */
  revenueCents: number;
  orders: number;
  units: number;
  averageOrderCents: number;
};

export type SeriesPoint = { key: string; revenueCents: number; orders: number };

export type SalesStatistics = {
  period: StatisticsPeriod;
  bucket: "day" | "month";
  kpis: SalesKpis;
  /** Same KPIs for the previous period of equal length; null for "all". */
  previous: SalesKpis | null;
  series: SeriesPoint[];
  topProducts: { name: string; referenceCode: string; units: number; revenueCents: number }[];
  unsold: { name: string; referenceCode: string; viewCount: number; quantity: number | null }[];
  byCountry: { country: string; orders: number; revenueCents: number }[];
  mostViewed: { name: string; referenceCode: string; viewCount: number; units: number }[];
};

const TIME_ZONE = "Europe/Rome";
const DAY_MS = 24 * 60 * 60 * 1000;

const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const monthKey = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit" });

function bucketKey(date: Date, bucket: "day" | "month"): string {
  return bucket === "day" ? dayKey.format(date) : monthKey.format(date).slice(0, 7);
}

/** Every bucket key between `from` and `to`, so empty days still show as zero. */
export function bucketKeys(from: Date, to: Date, bucket: "day" | "month"): string[] {
  const keys: string[] = [];
  const cursor = new Date(from);
  while (cursor <= to) {
    const key = bucketKey(cursor, bucket);
    if (keys.at(-1) !== key) keys.push(key);
    cursor.setTime(cursor.getTime() + (bucket === "day" ? DAY_MS : DAY_MS * 27));
  }
  const last = bucketKey(to, bucket);
  if (keys.at(-1) !== last) keys.push(last);
  return keys;
}

type PaidOrder = {
  paidAt: Date | null;
  country: string;
  productsCents: number;
  shippingCents: number;
  itemCount: number;
  items: { productId: string | null; referenceCode: string; name: string; quantity: number; unitPriceCents: number }[];
};

export function summarize(orders: Pick<PaidOrder, "productsCents" | "shippingCents" | "itemCount">[]): SalesKpis {
  const revenueCents = orders.reduce((sum, order) => sum + order.productsCents + order.shippingCents, 0);
  return {
    revenueCents,
    orders: orders.length,
    units: orders.reduce((sum, order) => sum + order.itemCount, 0),
    averageOrderCents: orders.length ? Math.round(revenueCents / orders.length) : 0,
  };
}

const paidStatuses = ["PAID", "NEEDS_REVIEW"] as const;

async function paidOrdersBetween(from: Date | null, to: Date): Promise<PaidOrder[]> {
  return getDb().order.findMany({
    where: { status: { in: [...paidStatuses] }, paidAt: { ...(from ? { gte: from } : {}), lte: to } },
    orderBy: { paidAt: "asc" },
    select: {
      paidAt: true,
      country: true,
      productsCents: true,
      shippingCents: true,
      itemCount: true,
      items: { select: { productId: true, referenceCode: true, name: true, quantity: true, unitPriceCents: true } },
    },
  });
}

export async function getSalesStatistics(period: StatisticsPeriod, now = new Date()): Promise<SalesStatistics> {
  const days = period === "all" ? null : Number(period);
  const from = days ? new Date(now.getTime() - days * DAY_MS) : null;

  const [orders, previousOrders, products] = await Promise.all([
    paidOrdersBetween(from, now),
    from && days ? paidOrdersBetween(new Date(from.getTime() - days * DAY_MS), new Date(from.getTime() - 1)) : null,
    getDb().product.findMany({
      where: { status: "PUBLISHED" },
      select: { id: true, name: true, referenceCode: true, viewCount: true, quantity: true },
    }),
  ]);

  const firstSale = orders[0]?.paidAt ?? now;
  const seriesStart = from ?? firstSale;
  const bucket = days !== null && days <= 90 ? "day" : "month";
  const series = new Map(bucketKeys(seriesStart, now, bucket).map((key) => [key, { key, revenueCents: 0, orders: 0 }]));
  for (const order of orders) {
    if (!order.paidAt) continue;
    const point = series.get(bucketKey(order.paidAt, bucket));
    if (!point) continue;
    point.revenueCents += order.productsCents + order.shippingCents;
    point.orders += 1;
  }

  const soldByProduct = new Map<string, { name: string; referenceCode: string; units: number; revenueCents: number }>();
  const unitsByProductId = new Map<string, number>();
  const countries = new Map<string, { country: string; orders: number; revenueCents: number }>();
  for (const order of orders) {
    for (const item of order.items) {
      const key = item.productId ?? `ref:${item.referenceCode}`;
      const entry = soldByProduct.get(key) ?? { name: item.name, referenceCode: item.referenceCode, units: 0, revenueCents: 0 };
      entry.units += item.quantity;
      entry.revenueCents += item.quantity * item.unitPriceCents;
      soldByProduct.set(key, entry);
      if (item.productId) unitsByProductId.set(item.productId, (unitsByProductId.get(item.productId) ?? 0) + item.quantity);
    }
    const country = countries.get(order.country) ?? { country: order.country, orders: 0, revenueCents: 0 };
    country.orders += 1;
    country.revenueCents += order.productsCents + order.shippingCents;
    countries.set(order.country, country);
  }

  return {
    period,
    bucket,
    kpis: summarize(orders),
    previous: previousOrders ? summarize(previousOrders) : null,
    series: [...series.values()],
    topProducts: [...soldByProduct.values()]
      .sort((a, b) => b.units - a.units || b.revenueCents - a.revenueCents)
      .slice(0, 10),
    unsold: products
      .filter((product) => !unitsByProductId.has(product.id))
      .sort((a, b) => b.viewCount - a.viewCount)
      .slice(0, 10)
      .map(({ name, referenceCode, viewCount, quantity }) => ({ name, referenceCode, viewCount, quantity })),
    byCountry: [...countries.values()].sort((a, b) => b.revenueCents - a.revenueCents),
    mostViewed: [...products]
      .filter((product) => product.viewCount > 0)
      .sort((a, b) => b.viewCount - a.viewCount)
      .slice(0, 5)
      .map((product) => ({
        name: product.name,
        referenceCode: product.referenceCode,
        viewCount: product.viewCount,
        units: unitsByProductId.get(product.id) ?? 0,
      })),
  };
}
