import Image from "next/image";
import Link from "next/link";
import { AdminHeader, PreviewBanner } from "@/components/admin/AdminHeader";
import { Icon, type IconName } from "@/components/ui/Icon";
import { adminProducts, adminSales } from "@/lib/demo-data";
import { getRequestLocale } from "@/lib/locale";
import { translate, type Locale } from "@/messages";
import { isDatabaseConfigured } from "@/lib/db";
import { getDashboardOverview, type DashboardOverview } from "@/lib/services/dashboard";
import { bucketKeys } from "@/lib/services/statistics";
import { requireAdminPage } from "@/lib/admin-auth";

const DATE_TIME_ZONE = "Europe/Rome";
const EMPTY = "—";
const LOW_STOCK_LIMIT = 5;

type Translate = (key: string, values?: Record<string, string | number>) => string;

export default async function Dashboard() {
  // The layout check does not re-run on client navigation; check next to the data.
  await requireAdminPage();
  const locale = await getRequestLocale();
  const t: Translate = (key, values = {}) =>
    Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), translate(locale, key));
  const databaseConfigured = isDatabaseConfigured();

  let overview: DashboardOverview | null = null;
  let databaseError = false;
  if (databaseConfigured) {
    try {
      overview = await getDashboardOverview();
    } catch {
      databaseError = true;
    }
  } else {
    // Without a database the page shows the demo data, as before.
    overview = demoOverview();
  }

  return (
    <div className="dashboard-page">
      <AdminHeader
        title={t("admin.dashboard.title")}
        subtitle={t("admin.dashboard.subtitle")}
        action={
          <Link className="btn btn-gold" href="/admin/prodotti/nuovo">
            {t("admin.dashboard.addProduct")} <Icon name="plus" size={18} />
          </Link>
        }
      />
      {!databaseConfigured ? (
        <PreviewBanner />
      ) : databaseError ? (
        <p className="field-error" role="alert">{t("admin.database.unavailable")}</p>
      ) : null}

      <KpiTiles overview={overview} locale={locale} t={t} />

      {overview ? (
        <DashboardContent overview={overview} locale={locale} t={t} />
      ) : (
        <section className="admin-card">
          <h2>{t("admin.dashboard.dataUnavailable")}</h2>
          <p className="dashboard-empty">{t("admin.database.unavailable")}</p>
        </section>
      )}
    </div>
  );
}

function moneyFormat(locale: Locale) {
  const currency = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" });
  return (cents: number) => currency.format(cents / 100);
}

/** Picks the zero / one / other text for a counter; the zero form is only asked for where it exists. */
function countText(t: Translate, base: string, n: number) {
  return t(`${base}.${n === 0 ? "zero" : n === 1 ? "one" : "other"}`, { n });
}

function KpiTiles({ overview, locale, t }: { overview: DashboardOverview | null; locale: Locale; t: Translate }) {
  const money = moneyFormat(locale);
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const toShip = overview?.toShip ?? 0;

  return (
    <section className="stats-grid dashboard-kpis" aria-label={t("admin.dashboard.kpis")}>
      <div className="stat-card dashboard-kpi accent-teal">
        <div className="stat-top">
          <span>{t("admin.dashboard.revenue30")}</span>
          <i><Icon name="bar" size={18} /></i>
        </div>
        <b>{overview ? money(overview.sales.revenueCents) : EMPTY}</b>
        {overview && (
          <RevenueDelta
            current={overview.sales.revenueCents}
            previous={overview.sales.previousRevenueCents}
            locale={locale}
            t={t}
          />
        )}
      </div>

      <div className="stat-card dashboard-kpi accent-mustard">
        <div className="stat-top">
          <span>{t("admin.dashboard.orders30")}</span>
          <i><Icon name="bag" size={18} /></i>
        </div>
        <b>{overview ? number(overview.sales.orders) : EMPTY}</b>
      </div>

      <Link
        className={`stat-card dashboard-kpi accent-terracotta is-link${toShip > 0 ? " is-alert" : ""}`}
        href="/admin/spedizioni"
      >
        <div className="stat-top">
          <span>{t("admin.dashboard.toShip")}</span>
          <i><Icon name="truck" size={18} /></i>
        </div>
        <b>{overview ? number(toShip) : EMPTY}</b>
      </Link>

      <Link className="stat-card dashboard-kpi accent-ink is-link" href="/admin/prodotti">
        <div className="stat-top">
          <span>{t("admin.dashboard.lowStock")}</span>
          <i><Icon name="box" size={18} /></i>
        </div>
        <b>{overview ? number(overview.lowStock.length) : EMPTY}</b>
      </Link>
    </section>
  );
}

function RevenueDelta({
  current,
  previous,
  locale,
  t,
}: {
  current: number;
  previous: number | null;
  locale: Locale;
  t: Translate;
}) {
  if (!previous) {
    return current > 0 ? <small className="stat-delta is-new">{t("admin.dashboard.newRevenue")}</small> : null;
  }
  const change = (current - previous) / previous;
  const formatted = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
    signDisplay: "exceptZero",
  }).format(change);
  const direction = change > 0 ? "up" : change < 0 ? "down" : "flat";
  return (
    <small className={`stat-delta is-${direction}`}>
      <span aria-hidden="true">{direction === "up" ? "▲" : direction === "down" ? "▼" : "■"}</span> {formatted}{" "}
      {t("admin.dashboard.vsPrevious")}
    </small>
  );
}

function DashboardContent({ overview, locale, t }: { overview: DashboardOverview; locale: Locale; t: Translate }) {
  const money = moneyFormat(locale);
  const orderDate = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: DATE_TIME_ZONE });

  return (
    <>
      <div className="dashboard-columns">
        <TodoCard overview={overview} t={t} />
        <SalesCard overview={overview} locale={locale} t={t} money={money} />
      </div>

      <div className="dashboard-columns">
        <section className="admin-card">
          <div className="card-head">
            <div>
              <h2>{t("admin.dashboard.latestOrders")}</h2>
              <p>{t("admin.dashboard.latestOrdersHint")}</p>
            </div>
            <Link href="/admin/vendite">{t("admin.dashboard.viewAll")}</Link>
          </div>
          {overview.recentOrders.length ? (
            <ul className="dashboard-list">
              {overview.recentOrders.map((order) => {
                const [chipClass, chipKey] = order.needsReview
                  ? ["pending", "admin.orders.needsReview"]
                  : order.shipped
                    ? ["published", "admin.shipments.shipped"]
                    : ["attention", "admin.dashboard.toShip"];
                return (
                  <li className="dashboard-order-row" key={order.id}>
                    <div>
                      <b>{order.orderNumber || EMPTY}</b>
                      <small className="dashboard-reference">
                        {order.customerName || EMPTY}
                        {order.paidAt && (
                          <>
                            {" · "}
                            <time dateTime={order.paidAt}>{orderDate.format(new Date(order.paidAt))}</time>
                          </>
                        )}
                      </small>
                    </div>
                    <div className="dashboard-order-side">
                      <strong>{money(order.receivedCents)}</strong>
                      <span className={`status ${chipClass}`}>{t(chipKey)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="dashboard-empty">{t("admin.dashboard.noOrders")}</p>
          )}
        </section>

        <section className="admin-card">
          <div className="card-head">
            <div>
              <h2>{t("admin.dashboard.lowStock")}</h2>
              <p>{t("admin.dashboard.lowStockHint")}</p>
            </div>
            <Link href="/admin/prodotti">{t("admin.dashboard.goToProducts")}</Link>
          </div>
          {overview.lowStock.length ? (
            <ul className="dashboard-scroll-list dashboard-list">
              {overview.lowStock.map((product) => (
                <li className="dashboard-stock-row" key={product.id}>
                  {product.imageUrl ? (
                    <Image className="product-thumbnail" src={product.imageUrl} alt="" width={44} height={44} />
                  ) : (
                    <span className="product-thumbnail-placeholder" aria-hidden="true">
                      {product.name.charAt(0).toLocaleUpperCase(locale)}
                    </span>
                  )}
                  <div>
                    <b>{product.name}</b>
                    <small className="dashboard-reference">{product.referenceCode}</small>
                  </div>
                  {product.quantity === 0 ? (
                    <span className="status attention">{t("admin.dashboard.soldOut")}</span>
                  ) : (
                    <span className="dashboard-stock-qty">{t("admin.dashboard.remaining", { n: product.quantity })}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="dashboard-empty">{t("admin.dashboard.noLowStock")}</p>
          )}
        </section>
      </div>
    </>
  );
}

function TodoCard({ overview, t }: { overview: DashboardOverview; t: Translate }) {
  const tasks: { key: string; count: number; href: string; icon: IconName; base: string; hideWhenDone?: boolean }[] = [
    { key: "ship", count: overview.toShip, href: "/admin/spedizioni", icon: "truck", base: "admin.dashboard.todo.ship" },
    { key: "reviews", count: overview.pendingReviews, href: "/admin/recensioni", icon: "chat", base: "admin.dashboard.todo.reviews" },
    {
      key: "verify",
      count: overview.needsReview,
      href: "/admin/vendite",
      icon: "eye",
      base: "admin.dashboard.todo.verify",
      hideWhenDone: true,
    },
    { key: "soldOut", count: overview.outOfStock, href: "/admin/prodotti", icon: "box", base: "admin.dashboard.todo.soldOut" },
  ];
  const visible = tasks.filter((task) => task.count > 0 || !task.hideWhenDone);
  const allClear = tasks.every((task) => task.count === 0);

  return (
    <section className="admin-card">
      <div className="card-head">
        <div>
          <h2>{t("admin.dashboard.todo")}</h2>
          <p>{t("admin.dashboard.todoHint")}</p>
        </div>
      </div>
      {allClear ? (
        <p className="dashboard-all-clear">
          <i aria-hidden="true"><Icon name="check" size={18} /></i>
          {t("admin.dashboard.allClear")}
        </p>
      ) : (
        <ul className="dashboard-todo">
          {visible.map((task) => (
            <li key={task.key}>
              {task.count > 0 ? (
                <Link className={`dashboard-task is-${task.key}`} href={task.href}>
                  <i aria-hidden="true"><Icon name={task.icon} size={18} /></i>
                  <span>{countText(t, task.base, task.count)}</span>
                  <Icon name="arrow" size={18} />
                </Link>
              ) : (
                <div className="dashboard-task is-done">
                  <i aria-hidden="true"><Icon name="check" size={18} /></i>
                  <span>{countText(t, task.base, 0)}</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SalesCard({
  overview,
  locale,
  t,
  money,
}: {
  overview: DashboardOverview;
  locale: Locale;
  t: Translate;
  money: (cents: number) => string;
}) {
  const { series, sales } = overview;
  const max = Math.max(...series.map((point) => point.revenueCents), 1);
  const dayLabel = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const label = (key: string) => dayLabel.format(new Date(`${key}T12:00:00`));
  const ticks = series.length ? [series[0], series[Math.floor((series.length - 1) / 2)], series[series.length - 1]] : [];

  return (
    <section className="admin-card">
      <div className="card-head">
        <div>
          <h2>{t("admin.dashboard.chartTitle")}</h2>
          <p>{t("admin.dashboard.chartTotal", { total: money(sales.revenueCents) })}</p>
        </div>
        <Link href="/admin/statistiche">{t("admin.dashboard.viewStats")}</Link>
      </div>
      {sales.revenueCents === 0 ? (
        <p className="dashboard-empty">{t("admin.dashboard.noSales30")}</p>
      ) : (
        <figure className="sales-chart dashboard-chart">
          <div className="sales-chart-scale" aria-hidden="true">
            <span>{money(max)}</span>
            <span>{money(0)}</span>
          </div>
          <div
            className="sales-chart-plot"
            role="img"
            aria-label={t("admin.dashboard.chartLabel", { total: money(sales.revenueCents), orders: sales.orders })}
          >
            {series.map((point) => (
              <div key={point.key} className="sales-chart-col" data-tip={`${label(point.key)} · ${money(point.revenueCents)}`}>
                <span className="sales-chart-bar" style={{ height: `${(point.revenueCents / max) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="dashboard-chart-axis" aria-hidden="true">
            {ticks.map((point, index) => (
              <span key={`${point.key}-${index}`}>{label(point.key)}</span>
            ))}
          </div>
        </figure>
      )}
    </section>
  );
}

/** Demo figures shown while no database is configured (preview mode). */
function demoOverview(now = new Date()): DashboardOverview {
  const keys = bucketKeys(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000), now, "day");
  const revenueByDay = new Map<string, number>();
  for (const sale of adminSales) {
    revenueByDay.set(sale.date, (revenueByDay.get(sale.date) ?? 0) + sale.qty * sale.unit * 100);
  }
  const series = keys.map((key) => ({ key, revenueCents: revenueByDay.get(key) ?? 0 }));
  const published = adminProducts.filter((product) => product.state === "published" && product.qty !== null);
  const lowStock = published
    .filter((product) => (product.qty ?? 0) <= LOW_STOCK_LIMIT)
    .sort((a, b) => (a.qty ?? 0) - (b.qty ?? 0))
    .map((product) => ({
      id: product.reference,
      name: product.name,
      referenceCode: product.reference,
      quantity: product.qty ?? 0,
      imageUrl: product.imageUrl ?? null,
    }));

  return {
    sales: {
      revenueCents: series.reduce((sum, point) => sum + point.revenueCents, 0),
      orders: adminSales.filter((sale) => keys.includes(sale.date)).length,
      previousRevenueCents: null,
    },
    series,
    toShip: 0,
    needsReview: 0,
    pendingReviews: 0,
    outOfStock: published.filter((product) => product.qty === 0).length,
    lowStock,
    recentOrders: [],
  };
}
