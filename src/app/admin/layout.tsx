import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { ADMIN_SESSION_COOKIE, isAdminAuthRequired, isValidAdminSession } from "@/lib/admin-auth";
import { defaultSiteSettings, getSiteSettings } from "@/lib/services/site-settings";
import "./admin.css";

export const metadata: Metadata = {
  title: { absolute: "PFdeco — Gestione" },
  robots: { index: false, follow: false },
};

// Se evalúa en cada petición (no en el build).
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  if (isAdminAuthRequired() && !isValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)) {
    redirect("/login");
  }
  const shopName = await getSiteSettings()
    .then((settings) => settings.name)
    .catch(() => defaultSiteSettings().name);
  return <AdminShell showLogout={isAdminAuthRequired()} shopName={shopName}>{children}</AdminShell>;
}
