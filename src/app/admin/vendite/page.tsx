import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminHeader, PreviewBanner } from "@/components/admin/AdminHeader";
import { SalesList, type SalesOrder } from "@/components/admin/SalesList";
import { ADMIN_SESSION_COOKIE, isAdminAuthRequired, isValidAdminSession } from "@/lib/admin-auth";
import { isDatabaseConfigured } from "@/lib/db";
import { getRequestLocale } from "@/lib/locale";
import { listAdminOrders } from "@/lib/services/orders";
import { translate } from "@/messages";

export default async function Page() {
  // The layout already checks the session; repeat it next to the data access
  // so customer and billing details never load without one.
  const cookieStore = await cookies();
  if (isAdminAuthRequired() && !isValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)) {
    redirect("/login");
  }
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);

  let orders: SalesOrder[] = [];
  let databaseError = false;
  if (isDatabaseConfigured()) {
    try {
      // Dates become ISO strings so the list can be passed to a client component.
      orders = (await listAdminOrders()).map((order) => ({
        ...order,
        paidAt: order.paidAt ? order.paidAt.toISOString() : null,
      }));
    } catch {
      databaseError = true;
    }
  }

  return (
    <>
      <AdminHeader title={t("admin.sales.title")} subtitle={t("admin.orders.subtitle")} />
      {!isDatabaseConfigured() && <PreviewBanner />}
      {databaseError && <p className="field-error" role="alert">{t("admin.database.unavailable")}</p>}
      <SalesList orders={orders} />
    </>
  );
}
