"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { useLocale } from "@/components/ui/LocaleProvider";
import { initialCategories, nextCatId, type Cat, type NewCat } from "@/lib/categories";
import { categoryMessageKey } from "@/messages";
import {
  defaultProductPrices,
  defaultProductSizes,
  getProductOptionSnapshot,
  getServerProductOptionSnapshot,
  parseProductOptionPreferences,
  saveProductOptionPreferences,
  subscribeToProductOptions,
} from "@/lib/product-options";
import { CategoryDialog, type CategoryDialogHandle } from "./CategoryDialog";

const states = [
  { value: "draft", label: "admin.status.draft", hint: "admin.form.draftHint" },
  {
    value: "published",
    label: "admin.status.published",
    hint: "admin.form.publishedHint",
  },
  {
    value: "unavailable",
    label: "admin.status.unavailable",
    hint: "admin.form.unavailableHint",
  },
];

export function ProductForm({ databaseConfigured }: { databaseConfigured: boolean }) {
  const [cats, setCats] = useState<Cat[]>(initialCategories);
  const [category, setCategory] = useState("");
  const [sub, setSub] = useState("");
  const savedOptions = useSyncExternalStore(
    subscribeToProductOptions,
    getProductOptionSnapshot,
    getServerProductOptionSnapshot,
  );
  const { sizes, prices } = parseProductOptionPreferences(savedOptions);
  const [selectedSize, setSelectedSize] = useState(defaultProductSizes[0]);
  const [selectedPrice, setSelectedPrice] = useState(defaultProductPrices[0].toFixed(2));
  const [activeOption, setActiveOption] = useState<"size" | "price" | null>(null);
  const [optionDraft, setOptionDraft] = useState("");
  const [optionError, setOptionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const dialog = useRef<CategoryDialogHandle>(null);
  const optionDialog = useRef<HTMLDialogElement>(null);
  const { locale, t } = useLocale();
  const currency = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" });

  useEffect(() => {
    if (activeOption && optionDialog.current && !optionDialog.current.open) {
      optionDialog.current.showModal();
    }
  }, [activeOption]);

  const tops = cats.filter((c) => c.parentId === null);
  const subs = category ? cats.filter((c) => c.parentId === Number(category)) : [];

  function categoryName(name: string) {
    const key = categoryMessageKey(name);
    return key ? t(key) : name;
  }

  function addCategory(c: NewCat) {
    const id = nextCatId(cats);
    setCats([...cats, { ...c, id }]);
    if (c.parentId === null) {
      setCategory(String(id));
      setSub("");
    } else {
      setCategory(String(c.parentId));
      setSub(String(id));
    }
  }

  function openOptionDialog(option: "size" | "price") {
    setOptionDraft("");
    setOptionError("");
    setActiveOption(option);
  }

  function addProductOption(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeOption === "size") {
      const size = optionDraft.trim().replace(/\s+/g, " ");
      if (!size) return setOptionError(t("admin.form.optionRequired"));
      const existing = sizes.find(
        (value) => value.toLocaleLowerCase() === size.toLocaleLowerCase(),
      );
      if (existing) {
        setSelectedSize(existing);
      } else {
        saveProductOptionPreferences({ sizes: [...sizes, size], prices });
        setSelectedSize(size);
      }
    } else if (activeOption === "price") {
      const parsed = Number(optionDraft.trim().replace(",", "."));
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return setOptionError(t("admin.form.priceInvalid"));
      }
      const price = Math.round(parsed * 100) / 100;
      const existing = prices.find((value) => value === price);
      const selected = (existing ?? price).toFixed(2);
      if (!existing) saveProductOptionPreferences({ sizes, prices: [...prices, price] });
      setSelectedPrice(selected);
    }
    optionDialog.current?.close();
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError("");
    setSaveMessage("");

    if (!databaseConfigured) {
      setSaveError(t("admin.form.databaseNotConfigured"));
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const selectedCategory = cats.find((cat) => cat.id === Number(sub || category));
    const rootCategory = selectedCategory?.parentId
      ? cats.find((cat) => cat.id === selectedCategory.parentId)
      : selectedCategory;
    if (!selectedCategory || !rootCategory) {
      setSaveError(t("admin.form.invalidProduct"));
      return;
    }

    const value = (name: string) => String(formData.get(name) ?? "").trim();
    const product = {
      referenceCode: value("reference"),
      name: value("name"),
      description: value("description"),
      categoryName: rootCategory.name,
      subcategoryName:
        selectedCategory.id === rootCategory.id ? "" : selectedCategory.name,
      brand: value("brand"),
      model: value("model"),
      size: value("size"),
      price: value("price"),
      quantity: value("qty"),
      material: value("material"),
      status: value("state").toLocaleUpperCase("en"),
    };
    const requestBody = new FormData();
    requestBody.set("product", JSON.stringify(product));
    for (const entry of formData.getAll("photos")) {
      if (entry instanceof File && entry.size > 0) requestBody.append("photos", entry);
    }

    setSaving(true);
    try {
      const response = await fetch("/api/admin/products", {
        method: "POST",
        body: requestBody,
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        const messageKey =
          result.error === "reference_in_use"
            ? "admin.form.referenceInUse"
            : result.error === "invalid_product"
              ? "admin.form.invalidProduct"
              : result.error === "database_not_configured"
                ? "admin.form.databaseNotConfigured"
                : result.error === "too_many_images"
                  ? "admin.form.tooManyImages"
                  : result.error === "image_too_large"
                    ? "admin.form.imageTooLarge"
                    : result.error === "invalid_image_type"
                      ? "admin.form.invalidImageType"
                      : result.error === "request_too_large"
                        ? "admin.form.requestTooLarge"
                        : "admin.form.saveFailed";
        setSaveError(t(messageKey));
        return;
      }

      form.reset();
      setCategory("");
      setSub("");
      setSaveMessage(t("admin.form.saveSuccess"));
    } catch {
      setSaveError(t("admin.form.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <form className="form-layout" onSubmit={saveProduct}>
        <div className="form-main">
          <section className="admin-card form-card">
            <h2>{t("admin.form.main")}</h2>
            <p>{t("admin.form.mainHint")}</p>
            <label>
              {t("admin.products.name")}
              <input
                name="name"
                placeholder="Es. BMW S1000RR — Garage Edition"
                required
              />
            </label>
            <label>
              {t("admin.form.reference")}
              <input
                name="reference"
                placeholder={t("admin.form.referencePlaceholder")}
                required
              />
            </label>
            <label>
              {t("admin.form.description")}
              <textarea
                name="description"
                placeholder={t("admin.form.descriptionPlaceholder")}
              />
            </label>
            <div className="form-row">
              <div className="field-with-action">
                <label>
                  {t("admin.form.category")}
                  <select
                    name="category"
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value);
                      setSub("");
                    }}
                  >
                    <option value="">{t("admin.form.selectCategory")}</option>
                    {tops.map((c) => (
                      <option key={c.id} value={c.id}>
                        {categoryName(c.name)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="field-action"
                  onClick={() => dialog.current?.open()}
                >
                  <Icon name="plus" size={16} /> {t("admin.form.newCategory")}
                </button>
              </div>
              <div className="field-with-action">
                <label>
                  {t("admin.form.subcategory")}
                  <select
                    name="subcategory"
                    value={sub}
                    onChange={(e) => setSub(e.target.value)}
                    disabled={!category}
                  >
                    <option value="">
                      {category
                        ? t("admin.form.none")
                        : t("admin.form.chooseCategoryFirst")}
                    </option>
                    {subs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {categoryName(c.name)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="field-action"
                  disabled={!category}
                  onClick={() => dialog.current?.open(Number(category))}
                >
                  <Icon name="plus" size={16} /> {t("admin.form.newSubcategory")}
                </button>
              </div>
            </div>
            <div className="form-row">
              <label>
                {t("admin.form.brand")}
                <input name="brand" placeholder="Es. BMW" />
              </label>
              <label>
                {t("admin.form.model")}
                <input name="model" placeholder="Es. S1000RR" />
              </label>
            </div>
          </section>

          <section className="admin-card form-card">
            <h2>{t("admin.form.priceAvailability")}</h2>
            <p>{t("admin.form.priceHint")}</p>
            <div className="form-row three">
              <div className="field-with-action">
                <label>
                  {t("admin.form.priceEuro")}
                  <select
                    name="price"
                    value={selectedPrice}
                    onChange={(event) => setSelectedPrice(event.target.value)}
                  >
                    {prices.map((price) => (
                      <option key={price} value={price.toFixed(2)}>
                        {currency.format(price)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="field-action"
                  onClick={() => openOptionDialog("price")}
                >
                  <Icon name="plus" size={16} /> {t("admin.form.addPrice")}
                </button>
              </div>
              <div className="field-with-action">
                <label>
                  {t("admin.form.size")}
                  <select
                    name="size"
                    value={selectedSize}
                    onChange={(event) => setSelectedSize(event.target.value)}
                  >
                    {sizes.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="field-action"
                  onClick={() => openOptionDialog("size")}
                >
                  <Icon name="plus" size={16} /> {t("admin.form.addSize")}
                </button>
              </div>
              <label>
                {t("admin.form.quantity")}
                <input name="qty" type="number" min="0" placeholder="0" />
              </label>
            </div>
            <label>
              {t("admin.form.material")}
              <input name="material" placeholder="Es. Alluminio" />
            </label>
          </section>
        </div>

        <aside className="form-side">
          <section className="admin-card form-card">
            <h2>{t("admin.form.photos")}</h2>
            <label className="upload">
              <Icon name="upload" size={26} />
              <b>{t("admin.form.choosePhotos")}</b>
              <span>{t("admin.form.photoHint")}</span>
              <input
                type="file"
                name="photos"
                accept="image/jpeg,image/png,image/webp"
                multiple
              />
            </label>
          </section>
          <section className="admin-card form-card">
            <h2>{t("admin.form.state")}</h2>
            {states.map((s, i) => (
              <label className="radio-row" key={s.value}>
                <input
                  type="radio"
                  name="state"
                  value={s.value}
                  defaultChecked={i === 0}
                />
                <span>
                  <b>{t(s.label)}</b>
                  <small>{t(s.hint)}</small>
                </span>
              </label>
            ))}
          </section>
          {!databaseConfigured && (
            <p className="field-error" role="note">
              {t("admin.form.databaseNotConfigured")}
            </p>
          )}
          {saveError && (
            <p className="field-error" role="alert">
              {saveError}
            </p>
          )}
          {saveMessage && (
            <p className="field-success" role="status">
              {saveMessage}
            </p>
          )}
          <button
            type="submit"
            className="btn btn-gold"
            disabled={!databaseConfigured || saving}
          >
            {t(saving ? "admin.form.saving" : "admin.form.save")}
          </button>
        </aside>
      </form>
      <dialog
        ref={optionDialog}
        className="admin-dialog"
        aria-labelledby="product-option-title"
        onClose={() => setActiveOption(null)}
      >
        <form onSubmit={addProductOption} noValidate>
          <h2 id="product-option-title">
            {t(
              activeOption === "price"
                ? "admin.form.priceDialogTitle"
                : "admin.form.sizeDialogTitle",
            )}
          </h2>
          <p>{t("admin.form.preferencesNote")}</p>
          <label>
            {t(
              activeOption === "price" ? "admin.form.priceValue" : "admin.form.sizeValue",
            )}
            <input
              autoFocus
              type={activeOption === "price" ? "number" : "text"}
              min={activeOption === "price" ? "0.01" : undefined}
              step={activeOption === "price" ? "0.01" : undefined}
              value={optionDraft}
              onChange={(event) => setOptionDraft(event.target.value)}
              aria-invalid={Boolean(optionError)}
            />
          </label>
          {optionError && (
            <p className="field-error" role="alert">
              {optionError}
            </p>
          )}
          <div className="dialog-actions">
            <button
              type="button"
              className="btn btn-line"
              onClick={() => optionDialog.current?.close()}
            >
              {t("admin.form.cancelOption")}
            </button>
            <button type="submit" className="btn btn-dark">
              {t("admin.form.addOption")}
            </button>
          </div>
        </form>
      </dialog>
      <CategoryDialog ref={dialog} cats={cats} onAdd={addCategory} />
    </>
  );
}
