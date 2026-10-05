import Link from "next/link";
import { AdminHeader, PreviewBanner } from "@/components/admin/AdminHeader";
import { ProductForm } from "@/components/admin/ProductForm";
import { isDatabaseConfigured } from "@/lib/db";
import { getRequestLocale } from "@/lib/locale";
import { translate } from "@/messages";

export default async function NewProductPage() {
  const locale = await getRequestLocale();
  const databaseConfigured = isDatabaseConfigured();

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
      <ProductForm databaseConfigured={databaseConfigured} />
    </>
  );
}
