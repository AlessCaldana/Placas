"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { BrandSeal } from "@/components/ui/BrandSeal";
import { LocaleSwitcher } from "@/components/ui/LocaleSwitcher";
import { useLocale } from "@/components/ui/LocaleProvider";
import type { AdminRoleName } from "@/lib/validators/admin-user";
import { roleLabelKey } from "./admin-user-ui";

type NavItem = { href: string; label: string; icon: IconName };

/** Signed-in identity shown in the sidebar (no email or id needed here). */
export type AdminShellUser = {
  name: string;
  role: AdminRoleName;
  dev: boolean;
  bootstrap: boolean;
  canManageUsers: boolean;
};

const items: NavItem[] = [
  { href: "/admin/dashboard", label: "admin.nav.dashboard", icon: "home" },
  { href: "/admin/prodotti", label: "admin.nav.products", icon: "box" },
  { href: "/admin/categorie", label: "admin.nav.categories", icon: "category" },
  { href: "/admin/vendite", label: "admin.nav.sales", icon: "bag" },
  { href: "/admin/recensioni", label: "admin.nav.reviews", icon: "chat" },
  { href: "/admin/statistiche", label: "admin.nav.stats", icon: "bar" },
  { href: "/admin/spedizioni", label: "admin.nav.shipments", icon: "truck" },
  { href: "/admin/impostazioni", label: "admin.nav.settings", icon: "settings" },
];
const usersItem: NavItem = { href: "/admin/utenti", label: "admin.nav.users", icon: "users" };
const accountItem: NavItem = { href: "/admin/account", label: "admin.nav.account", icon: "user" };

export function AdminShell({
  children,
  showLogout,
  shopName,
  user,
}: {
  children: ReactNode;
  showLogout: boolean;
  shopName: string;
  user: AdminShellUser;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { t } = useLocale();
  const navItems = user.canManageUsers ? [...items, usersItem, accountItem] : [...items, accountItem];
  const userName = user.dev
    ? t("admin.identity.devName")
    : user.bootstrap
      ? t("admin.identity.bootstrapName")
      : user.name;
  const userRole = user.dev ? t("admin.identity.devRole") : t(roleLabelKey(user.role));

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    router.replace("/login");
    router.refresh();
  };

  return (
    <div className="admin-shell">
      <aside className={open ? "admin-side open" : "admin-side"} id="admin-side">
        <Link
          href="/admin/dashboard"
          className="brand admin-brand"
          aria-label={t("brand.admin")}
        >
          <BrandSeal size={44} />{shopName}<small>GESTIONE</small>
        </Link>
        <nav aria-label={t("admin.menu")}>
          <small>{t("admin.menu")}</small>
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? "active" : undefined}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                <Icon name={item.icon} size={19} />
                {t(item.label)}
              </Link>
            );
          })}
        </nav>
        <div className="side-bottom">
          <p className="admin-identity">
            <span className="admin-identity-icon">
              <Icon name="user" size={17} />
            </span>
            <span className="admin-identity-text">
              <span className="sr-only">{t("admin.identity.label")}: </span>
              <b>{userName}</b>
              <small>{userRole}</small>
            </span>
          </p>
          <LocaleSwitcher />
          <Link href="/" className="admin-public-link">
            <Icon name="arrow" size={19} />
            {t("admin.publicSite")}
          </Link>
          {showLogout && (
            <button type="button" className="admin-logout-link" onClick={logout}>
              <Icon name="lock" size={19} />
              {t("admin.logout")}
            </button>
          )}
        </div>
      </aside>
      {open && (
        <button
          className="admin-scrim"
          aria-label={t("admin.closeMenu")}
          onClick={() => setOpen(false)}
        />
      )}
      <div className="admin-body">
        <div className="mobile-admin-head">
          <button
            onClick={() => setOpen(!open)}
            aria-label={open ? t("admin.closeMenu") : t("admin.openMenu")}
            aria-expanded={open}
            aria-controls="admin-side"
          >
            <Icon name={open ? "x" : "menu"} />
          </button>
          <b className="mobile-admin-brand">
            <BrandSeal size={34} />
            {shopName}
          </b>
        </div>
        <main className="admin-main">{children}</main>
      </div>
    </div>
  );
}
