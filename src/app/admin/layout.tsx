import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { canManageUsers, requireAdminPage } from "@/lib/admin-auth";
import { defaultSiteSettings, getSiteSettings } from "@/lib/services/site-settings";
import "@fontsource/shrikhand/latin-400.css";
import "./admin.css";

export const metadata: Metadata = {
  title: { absolute: "PFdeco — Gestione" },
  robots: { index: false, follow: false },
};

// Se evalúa en cada petición (no en el build).
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Redirects to /login without a valid session. The identity (name, role)
  // is also available via getCurrentAdmin() from "@/lib/admin-auth".
  const identity = await requireAdminPage();
  const user = {
    name: identity.name,
    role: identity.role,
    dev: identity.dev,
    bootstrap: identity.bootstrap,
    canManageUsers: canManageUsers(identity),
  };
  const shopName = await getSiteSettings()
    .then((settings) => settings.name)
    .catch(() => defaultSiteSettings().name);
  return (
    // Only the local development identity (ADMIN_AUTH=off on this machine) has no session to close.
    <AdminShell showLogout={!identity.dev} shopName={shopName} user={user}>
      {children}
    </AdminShell>
  );
}
