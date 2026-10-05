"use client";

import { useImperativeHandle, useRef, useState, type FormEvent, type Ref } from "react";
import { useLocale } from "@/components/ui/LocaleProvider";
import {
  capitalizeFirst,
  validateNewCategory,
  type Cat,
  type NewCat,
} from "@/lib/categories";
import { categoryMessageKey } from "@/messages";

export type CategoryDialogHandle = { open: (parentId?: number) => void };

export function CategoryDialog({
  ref,
  cats,
  onAdd,
}: {
  ref?: Ref<CategoryDialogHandle>;
  cats: Cat[];
  onAdd: (cat: NewCat) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [active, setActive] = useState(true);
  const [error, setError] = useState("");
  const tops = cats.filter((c) => c.parentId === null);
  const { t } = useLocale();

  useImperativeHandle(ref, () => ({
    open(parentId) {
      setName("");
      setParent(parentId ? String(parentId) : "");
      setActive(true);
      setError("");
      dialog.current?.showModal();
    },
  }));

  function submit(e: FormEvent) {
    e.preventDefault();
    const parentId = parent ? Number(parent) : null;
    const result = validateNewCategory(cats, name, parentId);
    if (!result.ok) {
      const key =
        result.error === "Inserisci un nome."
          ? "admin.dialog.emptyName"
          : "admin.dialog.duplicate";
      return setError(t(key));
    }
    onAdd({ name: result.name, parentId, active });
    dialog.current?.close();
  }

  function categoryName(name: string) {
    const key = categoryMessageKey(name);
    return key ? t(key) : name;
  }

  return (
    <dialog
      ref={dialog}
      className="admin-dialog"
      aria-labelledby="cat-dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
    >
      <form onSubmit={submit} noValidate>
        <h2 id="cat-dialog-title">{t("admin.dialog.newCategory")}</h2>
        <p>{t("admin.dialog.subtitle")}</p>
        <label>
          {t("admin.dialog.name")}
          <input
            value={name}
            onChange={(e) => setName(capitalizeFirst(e.target.value))}
            maxLength={60}
            placeholder={t("admin.dialog.namePlaceholder")}
            autoFocus
            aria-invalid={Boolean(error)}
          />
        </label>
        <label>
          {t("admin.dialog.insertWhere")}
          <select value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="">{t("admin.dialog.root")}</option>
            {tops.map((top) => (
              <option key={top.id} value={top.id}>
                {t("admin.dialog.childOf").replace("{name}", categoryName(top.name))}
              </option>
            ))}
          </select>
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          <span>{t("admin.dialog.visible")}</span>
        </label>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="btn btn-line"
            onClick={() => dialog.current?.close()}
          >
            {t("admin.dialog.cancel")}
          </button>
          <button type="submit" className="btn btn-dark">
            {t("admin.dialog.add")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
