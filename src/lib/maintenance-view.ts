import { cache } from "react";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { getMaintenanceState } from "@/lib/services/maintenance";

/** "visitor": maintenance page only; "admin": normal site with a notice; "off": normal site. */
export type MaintenanceView = "off" | "visitor" | "admin";

/**
 * Who sees what while maintenance mode is on, decided once per request and
 * shared by the public layout and every public page.
 */
export const getMaintenanceView = cache(async (): Promise<MaintenanceView> => {
  const maintenance = await getMaintenanceState();
  if (!maintenance.enabled) return "off";
  // getCurrentAdmin() returns null on any failure, so a broken session never opens the site.
  const admin = await getCurrentAdmin().catch(() => null);
  return admin ? "admin" : "visitor";
});

/**
 * True when this request must only get the maintenance page. Public pages call
 * it first and render nothing (no database or Stripe work) when it is true:
 * pages still run and travel in the RSC payload under the layout, and the
 * layout is not re-rendered on client-side navigation.
 */
export async function isMaintenanceVisitor(): Promise<boolean> {
  return (await getMaintenanceView()) === "visitor";
}
