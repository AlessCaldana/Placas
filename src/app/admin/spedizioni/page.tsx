import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminHeader, PreviewBanner } from "@/components/admin/AdminHeader";
import { ShipmentManager } from "@/components/admin/ShipmentManager";
import { ADMIN_SESSION_COOKIE, isAdminAuthRequired, isValidAdminSession } from "@/lib/admin-auth";
import { isDatabaseConfigured } from "@/lib/db";
import { getRequestLocale } from "@/lib/locale";
import { listShipmentOrders, type ShipmentOrder } from "@/lib/services/shipments";
import { defaultSiteSettings, getSiteSettings } from "@/lib/services/site-settings";
import { translate } from "@/messages";

export default async function Page() {
  // The layout already checks the session; repeat it next to the data access
  // so customer names and addresses never load without one.
  const cookieStore = await cookies();
  if (isAdminAuthRequired() && !isValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)) {
    redirect("/login");
  }
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);

  let toShip: ShipmentOrder[] = [];
  let shipped: ShipmentOrder[] = [];
  let databaseError = false;
  if (isDatabaseConfigured()) {
    try {
      ({ toShip, shipped } = await listShipmentOrders());
    } catch {
      databaseError = true;
    }
  }

  // Shop name signed at the end of the message sent to customers.
  let shopName = defaultSiteSettings().name;
  try {
    shopName = (await getSiteSettings()).name.trim() || shopName;
  } catch {
    // Keep the default name: the panel still works without settings.
  }

  return (
    <>
      <AdminHeader title={t("admin.shipments.title")} subtitle={t("admin.shipments.subtitle")} />
      {!isDatabaseConfigured() && <PreviewBanner />}
      {databaseError && <p className="field-error" role="alert">{t("admin.database.unavailable")}</p>}
      <ShipmentManager initialToShip={toShip} initialShipped={shipped} shopName={shopName} />
    </>
  );
}
