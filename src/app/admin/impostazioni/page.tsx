import { AdminHeader } from "@/components/admin/AdminHeader";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { getRequestLocale } from "@/lib/locale";
import { defaultSiteSettings, getSiteSettings } from "@/lib/services/site-settings";
import { translate } from "@/messages";
import { requireAdminPage } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function Page() {
  // The layout check does not re-run on client navigation; check next to the data.
  await requireAdminPage();
  const locale = await getRequestLocale();
  let settings = defaultSiteSettings();
  let databaseError = false;
  try {
    settings = await getSiteSettings();
  } catch {
    databaseError = true;
  }

  return (
    <>
      <AdminHeader
        title={translate(locale, "admin.settings.title")}
        subtitle={translate(locale, "admin.settings.subtitle")}
      />
      <SettingsForm initialSettings={settings} databaseError={databaseError} />
    </>
  );
}
