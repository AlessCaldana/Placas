"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { ButtonLink } from "@/components/ui/Button";
import { LocaleSwitcher } from "@/components/ui/LocaleSwitcher";
import { useLocale } from "@/components/ui/LocaleProvider";
import { Brand } from "./Brand";
import { whatsappLink } from "@/lib/site";
import type { SiteSettings } from "@/lib/services/site-settings";

export function PublicHeader({ settings }: { settings: SiteSettings }) {
  const { locale, t } = useLocale();
  const links = [
    { href: "/", label: t("nav.home") },
    { href: "/#catalogo", label: t("nav.catalog") },
    { href: "/#contatti", label: t("nav.contact") },
  ];
  const [open, setOpen] = useState(false);

  return (
    <header className="public-header">
      <div className="nav-wrap">
        <Brand locale={locale} settings={settings} />
        <nav
          id="main-nav"
          className={open ? "nav-links open" : "nav-links"}
          aria-label={t("nav.main")}
        >
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)}>
              {l.label}
            </Link>
          ))}
          <Link
            className="nav-reserved-mobile"
            href="/admin/dashboard"
            onClick={() => setOpen(false)}
          >
            {t("nav.reserved")}
          </Link>
        </nav>
        <div className="nav-actions">
          <LocaleSwitcher />
          <ButtonLink href={whatsappLink(undefined, settings.whatsappNumber)} kind="gold" icon="chat">
            {t("cta.whatsapp")}
          </ButtonLink>
          <Link className="btn btn-gold reserved-link" href="/admin/dashboard">
            {t("nav.reserved")}
          </Link>
        </div>
        <button
          className="mobile-menu"
          aria-label={open ? t("admin.closeMenu") : t("admin.openMenu")}
          aria-expanded={open}
          aria-controls="main-nav"
          onClick={() => setOpen(!open)}
        >
          <Icon name={open ? "x" : "menu"} />
        </button>
      </div>
    </header>
  );
}
