import Link from "next/link";
import { AdminHeader, PreviewBanner } from "@/components/admin/AdminHeader";
import { Icon, type IconName } from "@/components/ui/Icon";
import { adminProducts, adminSales } from "@/lib/demo-data";
import { eur } from "@/lib/format";
import { getRequestLocale } from "@/lib/locale";
import { translate } from "@/messages";

export default async function Dashboard() {
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);
  // Todo se calcula a partir de los datos demostrativos (como se hará con los reales).
  const available = adminProducts.filter(
    (p) => p.state === "published" && (p.qty ?? 0) > 0,
  ).length;
  const revenue = adminSales.reduce((sum, s) => sum + s.qty * s.unit, 0);
  const units = adminSales.reduce((sum, s) => sum + s.qty, 0);

  const sold = new Map<string, number>();
  adminProducts.forEach((p) => sold.set(p.name, 0));
  adminSales.forEach((s) => sold.set(s.product, (sold.get(s.product) ?? 0) + s.qty));
  const ranking = [...sold.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranking.slice(0, 4);
  const low = [...ranking].reverse().slice(0, 3);
  const max = Math.max(...ranking.map(([, n]) => n), 1);

  const stats: { name: string; value: string; icon: IconName }[] = [
    {
      name: t("admin.dashboard.totalProducts"),
      value: String(adminProducts.length),
      icon: "box",
    },
    {
      name: t("admin.dashboard.availableProducts"),
      value: String(available),
      icon: "category",
    },
    {
      name: t("admin.dashboard.monthSales"),
      value: String(adminSales.length),
      icon: "bag",
    },
    { name: t("admin.dashboard.revenue"), value: eur(revenue), icon: "bar" },
  ];

  return (
    <div className="dashboard-page">
      <AdminHeader
        title={t("admin.dashboard.title")}
        subtitle={t("admin.dashboard.subtitle")}
      />
      <PreviewBanner />

      <section className="dashboard-welcome">
        <div>
          <h2>{t("admin.dashboard.welcome")}</h2>
          <p>{t("admin.dashboard.welcomeText")}</p>
        </div>
        <div className="welcome-actions">
          <Link className="btn btn-gold" href="/admin/prodotti/nuovo">
            {t("admin.dashboard.addProduct")} <Icon name="plus" size={18} />
          </Link>
          <Link className="btn btn-light" href="/admin/vendite">
            {t("admin.dashboard.recordSale")} <Icon name="bag" size={18} />
          </Link>
        </div>
      </section>

      <div className="stats-grid">
        {stats.map((s) => (
          <div className="stat-card" key={s.name}>
            <div className="stat-top">
              <span>{s.name}</span>
              <i>
                <Icon name={s.icon} />
              </i>
            </div>
            <b>{s.value}</b>
          </div>
        ))}
      </div>

      <div className="dashboard-grid">
        <section className="admin-card">
          <div className="card-head">
            <div>
              <h2>{t("admin.dashboard.salesOverTime")}</h2>
              <p>
                {units} {t("admin.dashboard.unitsInPeriod")}
              </p>
            </div>
            <select aria-label={t("admin.dashboard.period")} defaultValue="30">
              <option value="7">{t("admin.dashboard.last7")}</option>
              <option value="30">{t("admin.dashboard.last30")}</option>
              <option value="month">{t("admin.dashboard.thisMonth")}</option>
              <option value="year">{t("admin.dashboard.thisYear")}</option>
            </select>
          </div>
          <svg
            className="line-chart"
            viewBox="0 0 700 210"
            preserveAspectRatio="none"
            role="img"
            aria-label={t("admin.dashboard.chartLabel")}
          >
            <defs>
              <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#d7ad58" stopOpacity=".35" />
                <stop offset="1" stopColor="#d7ad58" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0 176 C60 150 70 156 110 125 S180 145 220 100 S290 120 335 76 S410 112 455 64 S530 92 575 46 S650 70 700 22 L700 210 L0 210Z"
              fill="url(#area)"
            />
            <path
              d="M0 176 C60 150 70 156 110 125 S180 145 220 100 S290 120 335 76 S410 112 455 64 S530 92 575 46 S650 70 700 22"
              fill="none"
              stroke="#d7ad58"
              strokeWidth="3"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </section>

        <section className="admin-card">
          <div className="card-head">
            <div>
              <h2>{t("admin.dashboard.bestSellers")}</h2>
              <p>{t("admin.dashboard.units")}</p>
            </div>
          </div>
          {top.map(([name, n], i) => (
            <div className="rank-row" key={name}>
              <span>{i + 1}</span>
              <b>{name}</b>
              <strong>{n}</strong>
            </div>
          ))}
        </section>
      </div>

      <div className="dashboard-grid">
        <section className="admin-card">
          <div className="card-head">
            <div>
              <h2>{t("admin.dashboard.latestSales")}</h2>
              <p>{t("admin.dashboard.recentlyRecorded")}</p>
            </div>
            <Link href="/admin/vendite">{t("admin.dashboard.viewAll")}</Link>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("admin.dashboard.product")}</th>
                  <th>{t("admin.dashboard.date")}</th>
                  <th>{t("admin.dashboard.quantity")}</th>
                  <th>{t("admin.dashboard.total")}</th>
                </tr>
              </thead>
              <tbody>
                {adminSales.map((s, i) => (
                  <tr key={i}>
                    <td>
                      <b>{s.product}</b>
                    </td>
                    <td>
                      {new Intl.DateTimeFormat(locale).format(
                        new Date(`${s.date}T00:00:00`),
                      )}
                    </td>
                    <td>{s.qty}</td>
                    <td>
                      <b>{eur(s.qty * s.unit)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="admin-card">
          <div className="card-head">
            <div>
              <h2>{t("admin.dashboard.leastSold")}</h2>
              <p>{t("admin.dashboard.withoutSales")}</p>
            </div>
          </div>
          {low.map(([name, n]) => (
            <div className="low-row" key={name}>
              <div>
                <b>{name}</b>
                <span>
                  {n} {t(n === 1 ? "admin.dashboard.sale" : "admin.dashboard.sales")}
                </span>
              </div>
              <i>
                <span style={{ width: `${(n / max) * 100}%` }} />
              </i>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
