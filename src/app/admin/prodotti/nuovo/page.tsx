import Link from "next/link";
import { AdminHeader, PreviewBanner } from "@/components/admin/AdminHeader";
import { ProductForm } from "@/components/admin/ProductForm";
import { isDatabaseConfigured } from "@/lib/db";
import { getRequestLocale } from "@/lib/locale";
import { translate } from "@/messages";
import { listAdminCategories, type AdminCategory } from "@/lib/services/categories";
import { requireAdminPage } from "@/lib/admin-auth";

export default async function NewProductPage() {
  // The layout check does not re-run on client navigation; check next to the data.
  await requireAdminPage();
  const locale = await getRequestLocale();
  const databaseConfigured = isDatabaseConfigured();
  let initialDatabaseCategories: AdminCategory[] | null = null;
  if (databaseConfigured) {
    try {
      initialDatabaseCategories = await listAdminCategories();
    } catch {
      initialDatabaseCategories = null;
    }
  }

  return (
    <>
      <AdminHeader
        title={translate(locale, "admin.newProduct.title")}
        subtitle={translate(locale, "admin.newProduct.subtitle")}
        action={
          <Link className="btn btn-light" href="/admin/prodotti">
            {translate(locale, "admin.newProduct.back")}
          </Link>
        }
      />
      {databaseConfigured ? (
        <p className="database-banner" role="status">
          {translate(locale, "admin.database.configured")}
        </p>
      ) : (
        <PreviewBanner saving />
      )}
        <ProductForm
          databaseConfigured={databaseConfigured}
          initialDatabaseCategories={initialDatabaseCategories}
        />
    </>
  );
}
