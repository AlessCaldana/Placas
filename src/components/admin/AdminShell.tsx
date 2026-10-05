"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { LocaleSwitcher } from "@/components/ui/LocaleSwitcher";
import { useLocale } from "@/components/ui/LocaleProvider";

const items: { href: string; label: string; icon: IconName }[] = [
  { href: "/admin/dashboard", label: "admin.nav.dashboard", icon: "home" },
  { href: "/admin/prodotti", label: "admin.nav.products", icon: "box" },
  { href: "/admin/categorie", label: "admin.nav.categories", icon: "category" },
  { href: "/admin/vendite", label: "admin.nav.sales", icon: "bag" },
  { href: "/admin/statistiche", label: "admin.nav.stats", icon: "bar" },
  { href: "/admin/richieste", label: "admin.nav.requests", icon: "inbox" },
  { href: "/admin/impostazioni", label: "admin.nav.settings", icon: "settings" },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { t } = useLocale();
  return (
    <div className="admin-shell">
      <aside className={open ? "admin-side open" : "admin-side"} id="admin-side">
        <Link
          href="/admin/dashboard"
          className="brand admin-brand"
          aria-label={t("brand.admin")}
        >
          <span>PL</span>PLACA<small>GESTIONE</small>
        </Link>
        <nav aria-label={t("admin.menu")}>
          <small>{t("admin.menu")}</small>
          {items.map((item) => {
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
          <LocaleSwitcher />
          <Link href="/">
            <Icon name="arrow" size={19} />
            {t("admin.publicSite")}
          </Link>
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
          <b>PLACA</b>
        </div>
        <main className="admin-main">{children}</main>
      </div>
    </div>
  );
}
