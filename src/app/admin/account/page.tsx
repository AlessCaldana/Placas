import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { PasswordChangeForm } from "@/components/admin/PasswordChangeForm";
import { roleLabelKey } from "@/components/admin/admin-user-ui";
import { canManageUsers, requireAdminPage } from "@/lib/admin-auth";
import { getRequestLocale } from "@/lib/locale";
import { translate } from "@/messages";

export default async function Page() {
  const identity = await requireAdminPage();
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);
  const name = identity.dev
    ? t("admin.identity.devName")
    : identity.bootstrap
      ? t("admin.identity.bootstrapName")
      : identity.name;

  return (
    <>
      <AdminHeader title={t("admin.account.title")} subtitle={t("admin.account.subtitle")} />
      <div className="account-layout">
        <section className="admin-card form-card" aria-labelledby="account-details-title">
          <h2 id="account-details-title">{t("admin.account.details")}</h2>
          <dl className="account-details">
            <div>
              <dt>{t("admin.account.name")}</dt>
              <dd>{name}</dd>
            </div>
            <div>
              <dt>{t("admin.account.email")}</dt>
              <dd>{identity.email || "—"}</dd>
            </div>
            <div>
              <dt>{t("admin.account.role")}</dt>
              <dd>
                <span className={identity.role === "SUPERADMIN" ? "status role-super" : "status draft"}>
                  {t(roleLabelKey(identity.role))}
                </span>
              </dd>
            </div>
          </dl>
        </section>

        <section className="admin-card form-card" aria-labelledby="account-password-title">
          <h2 id="account-password-title">{t("admin.account.passwordTitle")}</h2>
          {identity.dev ? (
            <p className="account-note">{t("admin.account.devNote")}</p>
          ) : identity.bootstrap ? (
            <>
              <p className="account-note">{t("admin.account.bootstrapNote")}</p>
              {canManageUsers(identity) && (
                <Link className="btn btn-gold account-note-link" href="/admin/utenti">
                  {t("admin.account.goToUsers")}
                </Link>
              )}
            </>
          ) : (
            <>
              <p>{t("admin.account.passwordText")}</p>
              <PasswordChangeForm email={identity.email} />
            </>
          )}
        </section>
      </div>
    </>
  );
}
