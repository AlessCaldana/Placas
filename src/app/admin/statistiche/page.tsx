import Link from "next/link";
import { AdminHeader, PreviewBanner } from "@/components/admin/AdminHeader";
import { isDatabaseConfigured } from "@/lib/db";
import { getRequestLocale } from "@/lib/locale";
import {
  getSalesStatistics,
  parseStatisticsPeriod,
  STATISTICS_PERIODS,
  type SalesKpis,
  type SalesStatistics,
} from "@/lib/services/statistics";
import { translate, type Locale } from "@/messages";
import { requireAdminPage } from "@/lib/admin-auth";

export default async function StatisticsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // The layout check does not re-run on client navigation; check next to the data.
  await requireAdminPage();
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);
  const period = parseStatisticsPeriod((await searchParams).periodo);

  let stats: SalesStatistics | null = null;
  let databaseError = false;
  if (isDatabaseConfigured()) {
    try {
      stats = await getSalesStatistics(period);
    } catch {
      databaseError = true;
    }
  }

  return (
    <div className="stats-page">
      <AdminHeader title={t("admin.stats.title")} subtitle={t("admin.stats.subtitleLive")} />
      {!isDatabaseConfigured() && <PreviewBanner />}
      {databaseError && <p className="field-error" role="alert">{t("admin.database.unavailable")}</p>}

      <nav className="period-switch" aria-label={t("admin.stats.period")}>
        {STATISTICS_PERIODS.map((value) => (
          <Link
            key={value}
            href={`/admin/statistiche?periodo=${value}`}
            className={value === period ? "active" : undefined}
            aria-current={value === period ? "page" : undefined}
          >
            {t(`admin.stats.period.${value}`)}
          </Link>
        ))}
      </nav>

      {stats && <StatisticsContent stats={stats} locale={locale} />}
    </div>
  );
}

function StatisticsContent({ stats, locale }: { stats: SalesStatistics; locale: Locale }) {
  const t = (key: string) => translate(locale, key);
  const eur = (cents: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100);
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const countryName = (code: string) => {
    try {
      return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
    } catch {
      return code;
    }
  };

  const kpis: { key: keyof SalesKpis; label: string; format: (value: number) => string }[] = [
    { key: "revenueCents", label: t("admin.stats.revenue"), format: eur },
    { key: "orders", label: t("admin.stats.orders"), format: number },
    { key: "units", label: t("admin.stats.units"), format: number },
    { key: "averageOrderCents", label: t("admin.stats.averageOrder"), format: eur },
  ];

  return (
    <>
      <div className="stats-grid">
        {kpis.map((kpi) => (
          <div className="stat-card" key={kpi.key}>
            <div className="stat-top"><span>{kpi.label}</span></div>
            <b>{kpi.format(stats.kpis[kpi.key])}</b>
            {stats.previous && <Delta current={stats.kpis[kpi.key]} previous={stats.previous[kpi.key]} locale={locale} />}
          </div>
        ))}
      </div>

      <section className="admin-card">
        <div className="card-head">
          <div>
            <h2>{t("admin.stats.salesOverTime")}</h2>
            <p>{t(stats.bucket === "day" ? "admin.stats.perDay" : "admin.stats.perMonth")}</p>
          </div>
        </div>
        {stats.kpis.orders === 0 ? (
          <p className="dashboard-empty">{t("admin.stats.noSales")}</p>
        ) : (
          <SalesChart stats={stats} locale={locale} eur={eur} />
        )}
      </section>

      <div className="dashboard-grid">
        <section className="admin-card">
          <div className="card-head"><div><h2>{t("admin.stats.bestSellers")}</h2><p>{t("admin.stats.bestSellersHint")}</p></div></div>
          {stats.topProducts.length ? (
            <div className="table-scroll">
              <table>
                <thead><tr><th>{t("admin.stats.product")}</th><th>{t("admin.stats.units")}</th><th>{t("admin.stats.revenue")}</th></tr></thead>
                <tbody>
                  {stats.topProducts.map((product) => (
                    <tr key={product.referenceCode}>
                      <td><b>{product.name}</b> <small className="dashboard-reference">{product.referenceCode}</small></td>
                      <td>{number(product.units)}</td>
                      <td>{eur(product.revenueCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="dashboard-empty">{t("admin.stats.noSales")}</p>}
        </section>

        <section className="admin-card">
          <div className="card-head"><div><h2>{t("admin.stats.unsold")}</h2><p>{t("admin.stats.unsoldHint")}</p></div></div>
          {stats.unsold.length ? (
            <div className="table-scroll">
              <table>
                <thead><tr><th>{t("admin.stats.product")}</th><th>{t("admin.stats.views")}</th><th>{t("admin.stats.stock")}</th></tr></thead>
                <tbody>
                  {stats.unsold.map((product) => (
                    <tr key={product.referenceCode}>
                      <td><b>{product.name}</b> <small className="dashboard-reference">{product.referenceCode}</small></td>
                      <td>{number(product.viewCount)}</td>
                      <td>{product.quantity === null ? "—" : number(product.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="dashboard-empty">{t("admin.stats.allSold")}</p>}
        </section>
      </div>

      <div className="dashboard-grid">
        <section className="admin-card">
          <div className="card-head"><div><h2>{t("admin.stats.mostViewed")}</h2><p>{t("admin.stats.mostViewedHint")}</p></div></div>
          {stats.mostViewed.length ? (
            <div className="table-scroll">
              <table>
                <thead><tr><th>{t("admin.stats.product")}</th><th>{t("admin.stats.views")}</th><th>{t("admin.stats.unitsSold")}</th></tr></thead>
                <tbody>
                  {stats.mostViewed.map((product) => (
                    <tr key={product.referenceCode}>
                      <td><b>{product.name}</b> <small className="dashboard-reference">{product.referenceCode}</small></td>
                      <td>{number(product.viewCount)}</td>
                      <td>{number(product.units)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="dashboard-empty">{t("admin.dashboard.noViews")}</p>}
        </section>

        <section className="admin-card">
          <div className="card-head"><div><h2>{t("admin.stats.byCountry")}</h2><p>{t("admin.stats.byCountryHint")}</p></div></div>
          {stats.byCountry.length ? (
            <div className="table-scroll">
              <table>
                <thead><tr><th>{t("admin.stats.country")}</th><th>{t("admin.stats.orders")}</th><th>{t("admin.stats.revenue")}</th></tr></thead>
                <tbody>
                  {stats.byCountry.map((row) => (
                    <tr key={row.country}>
                      <td>{countryName(row.country)}</td>
                      <td>{number(row.orders)}</td>
                      <td>{eur(row.revenueCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="dashboard-empty">{t("admin.stats.noSales")}</p>}
        </section>
      </div>
    </>
  );
}

function Delta({ current, previous, locale }: { current: number; previous: number; locale: Locale }) {
  const t = (key: string) => translate(locale, key);
  if (previous === 0) {
    return <small className="stat-delta">{current > 0 ? t("admin.stats.newVsPrevious") : t("admin.stats.sameAsPrevious")}</small>;
  }
  const change = (current - previous) / previous;
  const formatted = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0, signDisplay: "exceptZero" }).format(change);
  const direction = change > 0 ? "up" : change < 0 ? "down" : "flat";
  return (
    <small className={`stat-delta is-${direction}`}>
      <span aria-hidden="true">{direction === "up" ? "▲" : direction === "down" ? "▼" : "■"}</span> {formatted} {t("admin.stats.vsPrevious")}
    </small>
  );
}

function SalesChart({ stats, locale, eur }: { stats: SalesStatistics; locale: Locale; eur: (cents: number) => string }) {
  const t = (key: string) => translate(locale, key);
  const max = Math.max(...stats.series.map((point) => point.revenueCents), 1);
  const label = (key: string) => {
    const date = new Date(stats.bucket === "day" ? `${key}T12:00:00` : `${key}-01T12:00:00`);
    return new Intl.DateTimeFormat(locale, stats.bucket === "day" ? { day: "numeric", month: "short" } : { month: "short", year: "2-digit" }).format(date);
  };
  // Label only a handful of ticks so they never collide.
  const step = Math.max(1, Math.ceil(stats.series.length / 6));
  const summary = `${t("admin.stats.salesOverTime")}: ${eur(stats.kpis.revenueCents)}, ${stats.kpis.orders} ${t("admin.stats.orders").toLowerCase()}`;

  return (
    <figure className="sales-chart">
      <div className="sales-chart-scale" aria-hidden="true"><span>{eur(max)}</span><span>{eur(0)}</span></div>
      <div className="sales-chart-plot" role="img" aria-label={summary}>
        {stats.series.map((point) => (
          <div
            key={point.key}
            className="sales-chart-col"
            tabIndex={0}
            data-tip={`${label(point.key)} · ${eur(point.revenueCents)} · ${point.orders} ${t("admin.stats.orders").toLowerCase()}`}
          >
            <span className="sales-chart-bar" style={{ height: `${(point.revenueCents / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="sales-chart-axis" aria-hidden="true">
        {stats.series.map((point, index) => (
          <span key={point.key}>{index % step === 0 || index === stats.series.length - 1 ? label(point.key) : ""}</span>
        ))}
      </div>
      <details className="sales-chart-table">
        <summary>{t("admin.stats.showTable")}</summary>
        <div className="table-scroll">
          <table>
            <thead><tr><th>{t("admin.orders.date")}</th><th>{t("admin.stats.revenue")}</th><th>{t("admin.stats.orders")}</th></tr></thead>
            <tbody>
              {stats.series.filter((point) => point.orders > 0).map((point) => (
                <tr key={point.key}><td>{label(point.key)}</td><td>{eur(point.revenueCents)}</td><td>{point.orders}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
