"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useLocale } from "@/components/ui/LocaleProvider";
import { initialCategories, nextCatId, type Cat } from "@/lib/categories";
import { matchesMultilingualSearch } from "@/lib/search";
import { categoryMessageKey } from "@/messages";
import { AdminHeader } from "./AdminHeader";
import { PreviewBanner } from "./AdminHeader";
import { CategoryDialog, type CategoryDialogHandle } from "./CategoryDialog";

export function CategoryManager() {
  const [cats, setCats] = useState<Cat[]>(initialCategories);
  const [search, setSearch] = useState("");
  const dialog = useRef<CategoryDialogHandle>(null);
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

  function toggle(id: number) {
    setCats(cats.map((c) => (c.id === id ? { ...c, active: !c.active } : c)));
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
      onClick={() => toggle(cat.id)}
    />
  );

  return (
    <>
      <AdminHeader
        title={t("admin.categories.title")}
        subtitle={t("admin.categories.subtitle")}
        action={
          <button
            type="button"
            className="btn btn-gold"
            onClick={() => dialog.current?.open()}
          >
            {t("admin.categories.add")} <Icon name="plus" size={18} />
          </button>
        }
      />
      <PreviewBanner />

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
        {visibleTops.map(({ top, children }) => {
          return (
            <section
              className={top.active ? "admin-card tree-card" : "admin-card tree-card off"}
              key={top.id}
            >
              <div className="tree-title">
                <span>
                  <Icon name="category" />
                </span>
                <div>
                  <h2>{categoryName(top.name)}</h2>
                  <small>
                    {top.active
                      ? t("admin.categories.visible")
                      : t("admin.categories.hidden")}{" "}
                    · {children.length}{" "}
                    {t(
                      children.length === 1
                        ? "admin.categories.subcategory"
                        : "admin.categories.subcategories",
                    )}
                  </small>
                </div>
                <Switch cat={top} />
              </div>
              {children.map((child) => (
                <div
                  className={child.active ? "tree-child" : "tree-child off"}
                  key={child.id}
                >
                  <b>{categoryName(child.name)}</b>
                  <Switch cat={child} />
                </div>
              ))}
              <button
                type="button"
                className="tree-add"
                onClick={() => dialog.current?.open(top.id)}
              >
                <Icon name="plus" size={16} /> {t("admin.categories.addSubcategory")}
              </button>
            </section>
          );
        })}
        {visibleTops.length === 0 && (
          <p className="category-search-empty">{t("admin.categories.noResults")}</p>
        )}
      </div>

      <CategoryDialog
        ref={dialog}
        cats={cats}
        onAdd={(c) => setCats((prev) => [...prev, { ...c, id: nextCatId(prev) }])}
      />
    </>
  );
}
