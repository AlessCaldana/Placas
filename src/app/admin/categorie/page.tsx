import { CategoryManager } from "@/components/admin/CategoryManager";
import { isDatabaseConfigured } from "@/lib/db";
import { listAdminCategories, type AdminCategory } from "@/lib/services/categories";
import { requireAdminPage } from "@/lib/admin-auth";

export default async function CategoriesPage() {
  // The layout check does not re-run on client navigation; check next to the data.
  await requireAdminPage();
  const databaseConfigured = isDatabaseConfigured();
  let initialDatabaseCategories: AdminCategory[] | null = null;
  let databaseError = false;
  if (databaseConfigured) {
    try {
      initialDatabaseCategories = await listAdminCategories();
    } catch {
      databaseError = true;
    }
  }

  return (
    <CategoryManager
      initialDatabaseCategories={initialDatabaseCategories}
      databaseConfigured={databaseConfigured && !databaseError}
      databaseError={databaseError}
    />
  );
}
