import { AdminHeader } from "@/components/admin/AdminHeader";
import { UserManager, type ManagedUser } from "@/components/admin/UserManager";
import { requireAdminPage } from "@/lib/admin-auth";
import { isDatabaseConfigured } from "@/lib/db";
import { getRequestLocale } from "@/lib/locale";
import { listAdminUsers } from "@/lib/services/admin-users";
import { translate } from "@/messages";

export default async function Page() {
  // Only a SUPERADMIN gets here; an ADMIN is sent back to /admin.
  const identity = await requireAdminPage({ role: "SUPERADMIN" });
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);

  let users: ManagedUser[] = [];
  let loadError: "noDatabase" | "unavailable" | null = null;
  if (!isDatabaseConfigured()) {
    loadError = "noDatabase";
  } else {
    try {
      users = (await listAdminUsers()).map((user) => ({ ...user, isSelf: user.id === identity.id }));
    } catch {
      loadError = "unavailable";
    }
  }

  return (
    <>
      <AdminHeader title={t("admin.users.title")} subtitle={t("admin.users.subtitle")} />
      <section className="admin-card users-roles" aria-labelledby="users-roles-title">
        <h2 id="users-roles-title">{t("admin.users.rolesTitle")}</h2>
        <ul>
          <li>
            <span className="status role-super">{t("admin.role.SUPERADMIN")}</span>
            <span>{t("admin.users.roleSuperDesc")}</span>
          </li>
          <li>
            <span className="status draft">{t("admin.role.ADMIN")}</span>
            <span>{t("admin.users.roleAdminDesc")}</span>
          </li>
        </ul>
      </section>
      <UserManager initialUsers={users} loadError={loadError} bootstrap={identity.bootstrap} />
    </>
  );
}
