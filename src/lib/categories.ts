import { demoCategories } from "./demo-data";

export type Cat = {
  id: number;
  name: string;
  parentId: number | null;
  active: boolean;
  databaseId?: string;
};
export type NewCat = Omit<Cat, "id">;

// Subcategorías de ejemplo (DEMOSTRATIVO).
const demoChildren: Record<string, string[]> = {
  Auto: ["BMW", "Ferrari"],
  Moto: ["BMW", "Ducati"],
  Gaming: ["PlayStation"],
};

export function initialCategories(): Cat[] {
  let id = 1;
  const out: Cat[] = [];
  for (const name of demoCategories) {
    const parentId = id++;
    out.push({ id: parentId, name, parentId: null, active: true });
    for (const child of demoChildren[name] ?? []) {
      out.push({ id: id++, name: child, parentId, active: true });
    }
  }
  return out;
}

export const nextCatId = (cats: Cat[]): number =>
  Math.max(0, ...cats.map((c) => c.id)) + 1;

/** Primera letra en mayúscula; el resto se deja tal cual lo escribió el usuario. */
export function capitalizeFirst(value: string): string {
  return value.charAt(0).toLocaleUpperCase("it") + value.slice(1);
}

export function validateNewCategory(
  cats: Cat[],
  rawName: string,
  parentId: number | null,
): { ok: true; name: string } | { ok: false; error: string } {
  const name = capitalizeFirst(rawName.trim().replace(/\s+/g, " "));
  if (!name) return { ok: false, error: "Inserisci un nome." };
  const duplicate = cats.some(
    (c) => c.parentId === parentId && c.name.toLowerCase() === name.toLowerCase(),
  );
  if (duplicate) return { ok: false, error: "Esiste già una categoria con questo nome." };
  return { ok: true, name };
}
