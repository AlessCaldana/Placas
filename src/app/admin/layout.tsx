import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { ADMIN_SESSION_COOKIE, isAdminAuthRequired, isValidAdminSession } from "@/lib/admin-auth";
import "./admin.css";

export const metadata: Metadata = {
  title: "PLACA — Gestione",
  robots: { index: false, follow: false },
};

// Se evalúa en cada petición (no en el build).
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  if (isAdminAuthRequired() && !isValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)) {
    redirect("/login");
  }
  return <AdminShell showLogout={isAdminAuthRequired()}>{children}</AdminShell>;
}
