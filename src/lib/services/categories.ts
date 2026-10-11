import { getDb } from "@/lib/db";

export type AdminCategory = {
  id: string;
  name: string;
  parentId: string | null;
  active: boolean;
};

export type PublicCatalogCategory = Pick<AdminCategory, "id" | "name" | "parentId">;

export async function listPublicCategories(): Promise<PublicCatalogCategory[]> {
  return getDb().category.findMany({
    where: { active: true },
    select: { id: true, name: true, parentId: true },
    orderBy: [{ parentId: "asc" }, { name: "asc" }],
  });
}

function toSlug(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("it")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "categoria"
  );
}

export async function listAdminCategories(): Promise<AdminCategory[]> {
  return getDb().category.findMany({
    select: { id: true, name: true, parentId: true, active: true },
    orderBy: [{ parentId: "asc" }, { name: "asc" }],
  });
}

export async function createAdminCategory(input: {
  name: string;
  parentId: string | null;
  active: boolean;
}): Promise<AdminCategory> {
  return getDb().$transaction(async (transaction) => {
    const parent = input.parentId
      ? await transaction.category.findUnique({ where: { id: input.parentId } })
      : null;
    if (input.parentId && !parent) throw new Error("category_parent_not_found");

    const duplicate = await transaction.category.findFirst({
      where: {
        parentId: input.parentId,
        name: { equals: input.name, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (duplicate) throw new Error("category_exists");

    const slug = parent
      ? `${parent.slug}-${toSlug(input.name)}`
      : toSlug(input.name);
    return transaction.category.create({
      data: {
        slug,
        name: input.name,
        parentId: input.parentId,
        active: input.active,
      },
      select: { id: true, name: true, parentId: true, active: true },
    });
  });
}

export async function setAdminCategoryActive(
  id: string,
  active: boolean,
): Promise<AdminCategory | null> {
  const existing = await getDb().category.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return null;
  return getDb().category.update({
    where: { id },
    data: { active },
    select: { id: true, name: true, parentId: true, active: true },
  });
}

export async function deleteAdminCategory(
  id: string,
): Promise<"deleted" | "not_found" | "in_use"> {
  return getDb().$transaction(async (transaction) => {
    const category = await transaction.category.findUnique({
      where: { id },
      select: {
        _count: { select: { children: true, products: true } },
      },
    });
    if (!category) return "not_found";
    if (category._count.children > 0 || category._count.products > 0) return "in_use";
    await transaction.category.delete({ where: { id } });
    return "deleted";
  });
}
