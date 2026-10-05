"use client";

import type { ReactNode } from "react";
import { useLocale } from "@/components/ui/LocaleProvider";

export function AdminHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="admin-header">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

export function PreviewBanner({ saving = false }: { saving?: boolean }) {
  const { t } = useLocale();
  return (
    <p className="preview-banner" role="note">
      {t(saving ? "admin.previewSaving" : "admin.preview")}
    </p>
  );
}

export function ComingSoon({
  title,
  subtitle,
  note,
}: {
  title: string;
  subtitle: string;
  note: string;
}) {
  const { t } = useLocale();
  return (
    <>
      <AdminHeader title={title} subtitle={subtitle} />
      <section className="admin-card coming-soon">
        <h2>{t("admin.comingSoon")}</h2>
        <p>{note}</p>
      </section>
    </>
  );
}

export function StatusBadge({ state }: { state: "published" | "unavailable" | "draft" }) {
  const { t } = useLocale();
  return <span className={`status ${state}`}>{t(`admin.status.${state}`)}</span>;
}
