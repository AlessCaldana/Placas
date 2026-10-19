import { AdminHeader } from "@/components/admin/AdminHeader";
import { MaintenanceSwitch } from "@/components/admin/MaintenanceSwitch";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { getRequestLocale } from "@/lib/locale";
import { defaultSiteSettings, getSiteSettings } from "@/lib/services/site-settings";
import { translate } from "@/messages";
import { hasRole, requireAdminPage } from "@/lib/admin-auth";
import { getMaintenanceState } from "@/lib/services/maintenance";

export const dynamic = "force-dynamic";

export default async function Page() {
  // The layout check does not re-run on client navigation; check next to the data.
  const identity = await requireAdminPage();
  const locale = await getRequestLocale();
  let settings = defaultSiteSettings();
  let databaseError = false;
  try {
    settings = await getSiteSettings();
  } catch {
    databaseError = true;
  }
  const maintenance = await getMaintenanceState();

  return (
    <>
      <AdminHeader
        title={translate(locale, "admin.settings.title")}
        subtitle={translate(locale, "admin.settings.subtitle")}
      />
      <MaintenanceSwitch
        initialState={maintenance}
        canEdit={hasRole(identity, "SUPERADMIN")}
        databaseError={databaseError}
      />
      <SettingsForm initialSettings={settings} databaseError={databaseError} />
    </>
  );
}
