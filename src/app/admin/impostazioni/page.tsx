import { ComingSoon } from "@/components/admin/AdminHeader";
import { getRequestLocale } from "@/lib/locale";
import { translate } from "@/messages";

export default async function Page() {
  const locale = await getRequestLocale();
  return (
    <ComingSoon
      title={translate(locale, "admin.settings.title")}
      subtitle={translate(locale, "admin.settings.subtitle")}
      note={translate(locale, "admin.settings.note")}
    />
  );
}
