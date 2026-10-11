import { CategoryManager } from "@/components/admin/CategoryManager";
import { isDatabaseConfigured } from "@/lib/db";
import { listAdminCategories, type AdminCategory } from "@/lib/services/categories";

export default async function CategoriesPage() {
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
