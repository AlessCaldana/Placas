import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import "./admin.css";

export const metadata: Metadata = {
  title: "PLACA — Gestione",
  robots: { index: false, follow: false },
};

// Se evalúa en cada petición (no en el build).
export const dynamic = "force-dynamic";

/**
 * TEMPORAL (solo desarrollo): el panel está abierto sin login.
 * En producción devuelve 404 salvo que se active ADMIN_PREVIEW=1 de forma explícita.
 * La autenticación real llega en la Etapa 2 y este bloque se elimina.
 */
function isAdminOpen(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ADMIN_PREVIEW === "1";
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  if (!isAdminOpen()) notFound();
  return <AdminShell>{children}</AdminShell>;
}
