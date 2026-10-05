import { ComingSoon } from "@/components/admin/AdminHeader";
import { getRequestLocale } from "@/lib/locale";
import { translate } from "@/messages";

export default async function Page() {
  const locale = await getRequestLocale();
  return (
    <ComingSoon
      title={translate(locale, "admin.requests.title")}
      subtitle={translate(locale, "admin.requests.subtitle")}
      note={translate(locale, "admin.requests.note")}
    />
  );
}
