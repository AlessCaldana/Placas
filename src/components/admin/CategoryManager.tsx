"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useLocale } from "@/components/ui/LocaleProvider";
import { initialCategories, nextCatId, type Cat, type NewCat } from "@/lib/categories";
import { matchesMultilingualSearch } from "@/lib/search";
import type { AdminCategory } from "@/lib/services/categories";
import { categoryMessageKey } from "@/messages";
import { AdminHeader, PreviewBanner } from "./AdminHeader";
import { CategoryDialog, type CategoryDialogHandle } from "./CategoryDialog";

function mapDatabaseCategories(categories: AdminCategory[]): Cat[] {
  const localIds = new Map(categories.map((category, index) => [category.id, index + 1]));
  return categories.map((category, index) => ({
    id: index + 1,
    name: category.name,
    parentId: category.parentId ? localIds.get(category.parentId) ?? null : null,
    active: category.active,
    databaseId: category.id,
  }));
}

export function CategoryManager({
  initialDatabaseCategories,
  databaseConfigured,
  databaseError,
}: {
  initialDatabaseCategories: AdminCategory[] | null;
  databaseConfigured: boolean;
  databaseError: boolean;
}) {
  const [cats, setCats] = useState<Cat[]>(() =>
    initialDatabaseCategories ? mapDatabaseCategories(initialDatabaseCategories) : initialCategories(),
  );
  const [search, setSearch] = useState("");
  const [busyCategoryId, setBusyCategoryId] = useState<number | null>(null);
  const [mutationError, setMutationError] = useState("");
  const dialog = useRef<CategoryDialogHandle>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const [categoryToDelete, setCategoryToDelete] = useState("");
  const [deletingCategory, setDeletingCategory] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const { t } = useLocale();
  const tops = cats.filter((c) => c.parentId === null);
  const visibleTops = tops.flatMap((top) => {
    const children = cats.filter((c) => c.parentId === top.id);
    const matchingChildren = children.filter((child) =>
      matchesMultilingualSearch(search, child.name),
    );

    if (!search.trim() || matchesMultilingualSearch(search, top.name)) {
      return [{ top, children }];
    }
    return matchingChildren.length > 0 ? [{ top, children: matchingChildren }] : [];
  });

  async function toggle(cat: Cat) {
    if (databaseError || busyCategoryId === cat.id) return;
    const active = !cat.active;
    setMutationError("");
    if (!databaseConfigured) {
      setCats((current) => current.map((item) => item.id === cat.id ? { ...item, active } : item));
      return;
    }
    if (!cat.databaseId) {
      setMutationError(t("admin.categories.saveFailed"));
      return;
    }

    setBusyCategoryId(cat.id);
    try {
      const response = await fetch(`/api/admin/categories/${encodeURIComponent(cat.databaseId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      if (!response.ok) throw new Error("category_save_failed");
      setCats((current) => current.map((item) => item.id === cat.id ? { ...item, active } : item));
    } catch {
      setMutationError(t("admin.categories.saveFailed"));
    } finally {
      setBusyCategoryId(null);
    }
  }

  async function addCategory(category: NewCat) {
    setMutationError("");
    if (databaseError) throw new Error("category_save_failed");
    if (!databaseConfigured) {
      setCats((current) => [...current, { ...category, id: nextCatId(current) }]);
      return;
    }

    const parent = category.parentId === null
      ? null
      : cats.find((item) => item.id === category.parentId);
    if (category.parentId !== null && !parent?.databaseId) {
      throw new Error("category_parent_not_found");
    }
    const response = await fetch("/api/admin/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: category.name,
        parentId: parent?.databaseId ?? null,
        active: category.active,
      }),
    });
    if (!response.ok) {
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(result.error === "category_exists" ? "category_exists" : "category_save_failed");
    }
    const saved = (await response.json()) as AdminCategory;
    setCats((current) => [
      ...current,
      { ...category, id: nextCatId(current), databaseId: saved.id },
    ]);
  }

  async function deleteSelectedCategory() {
    const selected = cats.find(
      (category) => (category.databaseId ?? `local-${category.id}`) === categoryToDelete,
    );
    if (!selected) {
      setDeleteError(t("admin.categories.deleteRequired"));
      return;
    }
    setDeletingCategory(true);
    setDeleteError("");
    try {
      if (databaseConfigured) {
        const response = await fetch(
          `/api/admin/categories/${encodeURIComponent(selected.databaseId!)}`,
          { method: "DELETE" },
        );
        if (!response.ok) {
          const result = (await response.json().catch(() => ({}))) as { error?: string };
          setDeleteError(
            result.error === "category_in_use"
              ? t("admin.categories.inUse")
              : t("admin.categories.deleteFailed"),
          );
          return;
        }
      } else if (cats.some((category) => category.parentId === selected.id)) {
        setDeleteError(t("admin.categories.inUse"));
        return;
      }
      setCats((current) => current.filter((category) => category.id !== selected.id));
      deleteDialog.current?.close();
      setCategoryToDelete("");
    } catch {
      setDeleteError(t("admin.categories.deleteFailed"));
    } finally {
      setDeletingCategory(false);
    }
  }

  function categoryName(name: string) {
    const key = categoryMessageKey(name);
    return key ? t(key) : name;
  }

  const Switch = ({ cat }: { cat: Cat }) => (
    <button
      type="button"
      role="switch"
      aria-checked={cat.active}
      aria-label={`${t(cat.active ? "admin.categories.switchOff" : "admin.categories.switchOn")} ${categoryName(cat.name)}`}
      className={cat.active ? "switch on" : "switch"}
      disabled={databaseError || busyCategoryId === cat.id}
      onClick={() => void toggle(cat)}
    />
  );

  return (
    <>
      <AdminHeader
        title={t("admin.categories.title")}
        subtitle={t("admin.categories.subtitle")}
        action={
          <div className="category-header-actions">
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                setCategoryToDelete("");
                setDeleteError("");
                deleteDialog.current?.showModal();
              }}
              disabled={databaseError || cats.length === 0}
            >
              {t("admin.categories.delete")}
            </button>
            <button
              type="button"
              className="btn btn-gold"
              onClick={() => dialog.current?.open()}
              disabled={databaseError}
            >
              {t("admin.categories.add")} <Icon name="plus" size={18} />
            </button>
          </div>
        }
      />
      {databaseError ? (
        <p className="field-error" role="alert">{t("admin.database.unavailable")}</p>
      ) : databaseConfigured ? (
        <p className="database-banner" role="status">{t("admin.database.connected")}</p>
      ) : (
        <PreviewBanner />
      )}
      {mutationError && <p className="field-error" role="alert">{mutationError}</p>}

      <label className="category-search">
        <Icon name="search" size={18} />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("search.categoryPlaceholder")}
          aria-label={t("search.categoryPlaceholder")}
        />
      </label>

      <div className="tree-grid">
        {visibleTops.map(({ top, children }) => (
          <section
            className={top.active ? "admin-card tree-card" : "admin-card tree-card off"}
            key={top.id}
          >
            <div className="tree-title">
              <span><Icon name="category" /></span>
              <div>
                <h2>{categoryName(top.name)}</h2>
                <small>
                  {top.active
                    ? t("admin.categories.visible")
                    : t("admin.categories.hidden")} · {children.length} {t(
                    children.length === 1
                      ? "admin.categories.subcategory"
                      : "admin.categories.subcategories",
                  )}
                </small>
              </div>
              <Switch cat={top} />
            </div>
            {children.length > 0 && (
              <div className="tree-children">
                {children.map((child) => (
                  <div className={child.active ? "tree-child" : "tree-child off"} key={child.id}>
                    <b>{categoryName(child.name)}</b>
                    <Switch cat={child} />
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              className="tree-add"
              onClick={() => dialog.current?.open(top.id)}
              disabled={databaseError}
            >
              <Icon name="plus" size={16} /> {t("admin.categories.addSubcategory")}
            </button>
          </section>
        ))}
        {visibleTops.length === 0 && (
          <p className="category-search-empty">{t("admin.categories.noResults")}</p>
        )}
      </div>

      <CategoryDialog ref={dialog} cats={cats} onAdd={addCategory} />
      <dialog
        ref={deleteDialog}
        className="admin-dialog"
        aria-labelledby="delete-category-title"
        aria-describedby="delete-category-warning"
        onClick={(event) => {
          if (event.target === event.currentTarget && !deletingCategory) {
            event.currentTarget.close();
          }
        }}
        >
        <h2 id="delete-category-title">{t("admin.categories.deleteTitle")}</h2>
        <p id="delete-category-warning">{t("admin.categories.deleteWarning")}</p>
        <p className="category-delete-restrictions">{t("admin.categories.deleteRestrictions")}</p>
        <label>
          {t("admin.categories.selectDelete")}
          <select
            value={categoryToDelete}
            onChange={(event) => {
              setCategoryToDelete(event.target.value);
              setDeleteError("");
            }}
            disabled={deletingCategory}
          >
            <option value="">{t("admin.categories.selectDelete")}</option>
            {cats.map((category) => {
              const parent = cats.find((item) => item.id === category.parentId);
              const label = parent ? `${parent.name} / ${category.name}` : category.name;
              return (
                <option key={category.id} value={category.databaseId ?? `local-${category.id}`}>
                  {label}
                </option>
              );
            })}
          </select>
        </label>
        {deleteError && <p className="field-error" role="alert">{deleteError}</p>}
        <div className="dialog-actions">
          <button
            type="button"
            className="btn btn-line"
            onClick={() => deleteDialog.current?.close()}
            disabled={deletingCategory}
          >
            {t("admin.dialog.cancel")}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => void deleteSelectedCategory()}
            disabled={deletingCategory}
          >
            {t(deletingCategory ? "admin.categories.deleting" : "admin.categories.confirmDelete")}
          </button>
        </div>
      </dialog>
    </>
  );
}
