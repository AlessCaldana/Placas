import { AdminHeader, PreviewBanner } from "@/components/admin/AdminHeader";
import { isDatabaseConfigured } from "@/lib/db";
import { getRequestLocale } from "@/lib/locale";
import { listAdminOrders, type AdminOrder } from "@/lib/services/orders";
import { translate } from "@/messages";

export default async function Page() {
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);
  const eur = (cents: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100);

  let orders: AdminOrder[] = [];
  let databaseError = false;
  if (isDatabaseConfigured()) {
    try {
      orders = await listAdminOrders();
    } catch {
      databaseError = true;
    }
  }

  return (
    <>
      <AdminHeader title={t("admin.sales.title")} subtitle={t("admin.orders.subtitle")} />
      {!isDatabaseConfigured() && <PreviewBanner />}
      {databaseError && <p className="field-error" role="alert">{t("admin.database.unavailable")}</p>}
      <section className="admin-card">
        {orders.length === 0 ? (
          <p>{t("admin.orders.empty")}</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("admin.orders.date")}</th>
                  <th>{t("admin.orders.customer")}</th>
                  <th>{t("admin.orders.products")}</th>
                  <th>{t("admin.orders.shipping")}</th>
                  <th>{t("admin.orders.toReceive")}</th>
                  <th>{t("admin.orders.status")}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.paidAt ? new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(order.paidAt) : "—"}</td>
                    <td>
                      <b>{order.customerName || "—"}</b>
                      <br />
                      <small>{order.customerEmail}</small>
                      <br />
                      <small>{order.address}</small>
                    </td>
                    <td>
                      {order.items.map((item) => (
                        <div key={item.referenceCode}>{item.quantity} × {item.name} <small>({item.referenceCode})</small></div>
                      ))}
                    </td>
                    <td>{eur(order.shippingCents)}</td>
                    <td><b>{eur(order.productsCents + order.shippingCents)}</b></td>
                    <td>
                      <span className={`status ${order.status === "PAID" ? "published" : "unavailable"}`}>
                        {t(order.status === "PAID" ? "admin.orders.paid" : "admin.orders.needsReview")}
                      </span>
                      {order.reviewReason && <><br /><small>{order.reviewReason}</small></>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
