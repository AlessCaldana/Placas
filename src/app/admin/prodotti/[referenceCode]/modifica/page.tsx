import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { ProductForm } from "@/components/admin/ProductForm";
import { isDatabaseConfigured } from "@/lib/db";
import { getRequestLocale } from "@/lib/locale";
import { getAdminProduct } from "@/lib/services/products";
import { listAdminCategories } from "@/lib/services/categories";
import { translate } from "@/messages";
import { requireAdminPage } from "@/lib/admin-auth";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ referenceCode: string }>;
}) {
  // The layout check does not re-run on client navigation; check next to the data.
  await requireAdminPage();
  if (!isDatabaseConfigured()) notFound();
  const { referenceCode } = await params;
  const product = await getAdminProduct(referenceCode).catch(() => null);
  if (!product) notFound();
  const initialDatabaseCategories = await listAdminCategories().catch(() => null);

  const locale = await getRequestLocale();
  return (
    <>
      <AdminHeader
        title={translate(locale, "admin.products.edit")}
        subtitle={translate(locale, "admin.newProduct.subtitle")}
        action={
          <Link className="btn btn-light" href="/admin/prodotti">
            {translate(locale, "admin.newProduct.back")}
          </Link>
        }
      />
      <p className="database-banner" role="status">
        {translate(locale, "admin.database.configured")}
      </p>
      <ProductForm
        key={product.referenceCode}
        databaseConfigured
        initialProduct={product}
        initialDatabaseCategories={initialDatabaseCategories}
      />
    </>
  );
}
