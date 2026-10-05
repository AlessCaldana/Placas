import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Icon } from "@/components/ui/Icon";
import { ProductSearchTable } from "@/components/admin/ProductSearchTable";
import { adminProducts } from "@/lib/demo-data";
import { isDatabaseConfigured } from "@/lib/db";
import { getRequestLocale } from "@/lib/locale";
import { listAdminProducts } from "@/lib/services/products";
import { translate } from "@/messages";

export default async function ProductsPage() {
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);
  const databaseConfigured = isDatabaseConfigured();
  let products = adminProducts;
  let databaseError = false;
  let databaseMessage = "admin.database.demoData";

  if (databaseConfigured) {
    try {
      products = await listAdminProducts();
      databaseMessage = "admin.database.connected";
    } catch {
      products = [];
      databaseError = true;
      databaseMessage = "admin.database.unavailable";
    }
  }

  return (
    <>
      <AdminHeader
        title={t("admin.products.title")}
        subtitle={t("admin.products.subtitle")}
        action={
          <Link className="btn btn-gold" href="/admin/prodotti/nuovo">
            {t("admin.products.add")} <Icon name="plus" size={18} />
          </Link>
        }
      />
      <p
        className={databaseError ? "field-error" : "preview-banner"}
        role={databaseError ? "alert" : "status"}
      >
        {t(databaseMessage)}
      </p>
      {databaseError ? null : <ProductSearchTable products={products} />}
    </>
  );
}
