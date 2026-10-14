"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useLocale } from "@/components/ui/LocaleProvider";
import { languages as localeLanguages } from "@/components/ui/LocaleSwitcher";
import { initialCategories, nextCatId, type Cat, type NewCat } from "@/lib/categories";
import { categoryMessageKey } from "@/messages";
import type { AdminProductDetails } from "@/lib/services/products";
import type { AdminCategory } from "@/lib/services/categories";
import {
  defaultProductPrices,
  defaultProductSizes,
  getProductOptionSnapshot,
  getServerProductOptionSnapshot,
  normalizeProductSize,
  parseProductOptionPreferences,
  saveProductOptionPreferences,
  subscribeToProductOptions,
} from "@/lib/product-options";
import {
  emptyProductTranslations,
  productTranslationDescriptionMaxLength,
  productTranslationLocales,
  productTranslationNameMaxLength,
  type ProductTranslationLocale,
  type ProductTranslationText,
  type ProductTranslations,
} from "@/lib/product-translations";
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
] as const;

function mapDatabaseCategories(categories: AdminCategory[]): Cat[] {
  const idMap = new Map(categories.map((category, index) => [category.id, index + 1]));
  return categories.map((category, index) => ({
    id: index + 1,
    name: category.name,
    parentId: category.parentId ? idMap.get(category.parentId) ?? null : null,
    active: category.active,
    databaseId: category.id,
  }));
}

function categoriesFor(
  product: AdminProductDetails | null,
  databaseCategories: AdminCategory[] | null,
): Cat[] {
  const cats = databaseCategories ? mapDatabaseCategories(databaseCategories) : initialCategories();
  if (!product) return cats;
  let root = cats.find((cat) => cat.parentId === null && cat.name === product.categoryName);
  if (!root) {
    const id = nextCatId(cats);
    root = { id, name: product.categoryName, parentId: null, active: true };
    cats.push(root);
  }
  if (product.subcategoryName && !cats.some((cat) => cat.parentId === root?.id && cat.name === product.subcategoryName)) {
    cats.push({ id: nextCatId(cats), name: product.subcategoryName, parentId: root.id, active: true });
  }
  return cats;
}

export function ProductForm({
  databaseConfigured,
  initialProduct = null,
  initialDatabaseCategories = null,
}: {
  databaseConfigured: boolean;
  initialProduct?: AdminProductDetails | null;
  initialDatabaseCategories?: AdminCategory[] | null;
}) {
  const [cats, setCats] = useState<Cat[]>(() => categoriesFor(initialProduct, initialDatabaseCategories));
  const initialRoot = cats.find((cat) => cat.parentId === null && cat.name === initialProduct?.categoryName);
  const initialSub = cats.find((cat) => cat.parentId === initialRoot?.id && cat.name === initialProduct?.subcategoryName);
  const [category, setCategory] = useState(initialRoot ? String(initialRoot.id) : "");
  const [sub, setSub] = useState(initialSub ? String(initialSub.id) : "");
  const savedOptions = useSyncExternalStore(
    subscribeToProductOptions,
    getProductOptionSnapshot,
    getServerProductOptionSnapshot,
  );
  const { sizes, prices } = parseProductOptionPreferences(savedOptions);
  const [selectedSize, setSelectedSize] = useState(initialProduct?.size ?? defaultProductSizes[0]);
  const [selectedPrice, setSelectedPrice] = useState((initialProduct?.price ?? defaultProductPrices[0]).toFixed(2));
  const [selectedStatus, setSelectedStatus] = useState(initialProduct?.status ?? "published");
  const [showOnHero, setShowOnHero] = useState(initialProduct?.showOnHero ?? false);
  const isDraft = selectedStatus === "draft";
  const formSizes = sizes.includes(selectedSize) ? sizes : [selectedSize, ...sizes];
  const formPrices = prices.some((price) => price.toFixed(2) === selectedPrice)
    ? prices
    : [Number(selectedPrice), ...prices];
  const [activeOption, setActiveOption] = useState<"size" | "price" | null>(null);
  const [optionDraft, setOptionDraft] = useState("");
  const [optionError, setOptionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [deleteError, setDeleteError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [translations, setTranslations] = useState<ProductTranslations>(
    () => initialProduct?.translations ?? emptyProductTranslations(),
  );
  const [translationLocale, setTranslationLocale] = useState<ProductTranslationLocale>(
    productTranslationLocales[0],
  );
  const dialog = useRef<CategoryDialogHandle>(null);
  const optionDialog = useRef<HTMLDialogElement>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
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

  function clearFieldError(name: string) {
    setFieldErrors((errors) => {
      if (!errors[name]) return errors;
      const next = { ...errors };
      delete next[name];
      return next;
    });
  }

  function updateTranslation(
    locale: ProductTranslationLocale,
    field: keyof ProductTranslationText,
    text: string,
  ) {
    setTranslations((current) => ({
      ...current,
      [locale]: { ...current[locale], [field]: text },
    }));
  }

  function translationTabId(locale: ProductTranslationLocale) {
    return `product-translation-tab-${locale}`;
  }

  function onTranslationTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const items = productTranslationLocales;
    const index = items.indexOf(translationLocale);
    let next: ProductTranslationLocale | null = null;
    if (event.key === "ArrowRight") next = items[(index + 1) % items.length];
    else if (event.key === "ArrowLeft") next = items[(index - 1 + items.length) % items.length];
    else if (event.key === "Home") next = items[0];
    else if (event.key === "End") next = items[items.length - 1];
    if (!next) return;
    event.preventDefault();
    setTranslationLocale(next);
    document.getElementById(translationTabId(next))?.focus();
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
      const size = normalizeProductSize(optionDraft);
      if (!optionDraft.trim()) return setOptionError(t("admin.form.optionRequired"));
      if (!size) return setOptionError(t("admin.form.sizeInvalid"));
      const existing = sizes.find((value) => {
        const normalizedExisting = normalizeProductSize(value);
        return normalizedExisting === size || value.toLocaleLowerCase() === size.toLocaleLowerCase();
      });
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
    setFieldErrors({});

    if (!databaseConfigured) {
      setSaveError(t("admin.form.databaseNotConfigured"));
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const value = (name: string) => String(formData.get(name) ?? "").trim();
    const selectedCategory = cats.find((cat) => cat.id === Number(sub || category));
    const rootCategory = selectedCategory?.parentId
      ? cats.find((cat) => cat.id === selectedCategory.parentId)
      : selectedCategory;
    const errors: Record<string, string> = {};
    const requiredError = t("admin.form.requiredField");
    const name = value("name");
    const reference = value("reference");
    const size = value("size");
    const priceText = value("price").replace(",", ".");
    const price = Number(priceText);
    const quantity = value("qty");
    if (!isDraft && !name) errors.name = requiredError;
    else if (name.length > 200) errors.name = t("admin.form.nameTooLong");
    if (!isDraft && !reference) errors.reference = requiredError;
    else if (reference.length > 64) errors.reference = t("admin.form.referenceTooLong");
    if (!isDraft && (!selectedCategory || !rootCategory)) errors.category = requiredError;
    if (!isDraft && !size) errors.size = requiredError;
    else if (size.length > 80) errors.size = t("admin.form.sizeTooLong");
    if ((!isDraft || priceText) && (!/^\d+(?:\.\d{1,2})?$/.test(priceText) || !Number.isFinite(price) || price <= 0 || price > 99_999_999.99)) {
      errors.price = t("admin.form.priceInvalid");
    }
    if (quantity && (!/^\d+$/.test(quantity) || Number(quantity) > 2_147_483_647)) {
      errors.qty = t("admin.form.quantityInvalid");
    }
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      requestAnimationFrame(() => {
        form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
      return;
    }
    if (!isDraft && (!selectedCategory || !rootCategory)) return;

    const product = {
      referenceCode: value("reference"),
      name: value("name"),
      description: value("description"),
      categoryName: rootCategory?.name ?? "",
      subcategoryName:
        selectedCategory && rootCategory && selectedCategory.id !== rootCategory.id
          ? selectedCategory.name
          : "",
      brand: value("brand"),
      model: value("model"),
      size,
      price: value("price"),
      quantity: value("qty"),
      material: value("material"),
      status: selectedStatus.toLocaleUpperCase("en"),
      showOnHero,
      // Always send all four languages with both fields: a missing field would clear it.
      translations: Object.fromEntries(
        productTranslationLocales.map((locale) => [
          locale,
          {
            name: translations[locale].name.trim(),
            description: translations[locale].description.trim(),
          },
        ]),
      ) as ProductTranslations,
    };
    const requestBody = new FormData();
    requestBody.set("product", JSON.stringify(product));
    for (const entry of formData.getAll("photos")) {
      if (entry instanceof File && entry.size > 0) requestBody.append("photos", entry);
    }
    setSaving(true);
    try {
      const response = await fetch(
        initialProduct
          ? `/api/admin/products/${encodeURIComponent(initialProduct.referenceCode)}`
          : "/api/admin/products",
        {
        method: initialProduct ? "PUT" : "POST",
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

      if (!initialProduct) {
        form.reset();
        setCategory("");
        setSub("");
        setShowOnHero(false);
        setTranslations(emptyProductTranslations());
        setTranslationLocale(productTranslationLocales[0]);
      }
      setSaveMessage(t("admin.form.saveSuccess"));
    } catch {
      setSaveError(t("admin.form.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct() {
    if (!initialProduct || saving || deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const response = await fetch(
        `/api/admin/products/${encodeURIComponent(initialProduct.referenceCode)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        setDeleteError(t("admin.products.deleteFailed"));
        return;
      }
      deleteDialog.current?.close();
      router.push("/admin/prodotti");
      router.refresh();
    } catch {
      setDeleteError(t("admin.products.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <form className="form-layout" onSubmit={saveProduct} noValidate>
        <div className="form-main">
          <section className="admin-card form-card">
            <h2>{t("admin.form.main")}</h2>
            <p>{t("admin.form.mainHint")}</p>
            {!isDraft && <p className="required-legend">* {t("admin.form.requiredLegend")}</p>}
            <label>
              <span>{t("admin.products.name")}{!isDraft && <b className="required-mark" aria-hidden="true">*</b>}</span>
              <input
                name="name"
                placeholder="Es. BMW S1000RR — Garage Edition"
                defaultValue={initialProduct?.name}
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? "product-name-error" : undefined}
                onChange={() => clearFieldError("name")}
              />
              {fieldErrors.name && <small className="field-inline-error" id="product-name-error" role="alert">{fieldErrors.name}</small>}
            </label>
            <label>
              <span>{t("admin.form.reference")}{!isDraft && <b className="required-mark" aria-hidden="true">*</b>}</span>
              <input
                name="reference"
                placeholder={t("admin.form.referencePlaceholder")}
                defaultValue={initialProduct?.referenceCode}
                aria-invalid={Boolean(fieldErrors.reference)}
                aria-describedby={fieldErrors.reference ? "product-reference-error" : undefined}
                onChange={() => clearFieldError("reference")}
              />
              {fieldErrors.reference && <small className="field-inline-error" id="product-reference-error" role="alert">{fieldErrors.reference}</small>}
            </label>
            <label>
              {t("admin.form.description")}
              <textarea
                name="description"
                placeholder={t("admin.form.descriptionPlaceholder")}
                defaultValue={initialProduct?.description}
              />
            </label>
            <div className="form-row">
              <div className="field-with-action">
                <label>
                  <span>{t("admin.form.category")}{!isDraft && <b className="required-mark" aria-hidden="true">*</b>}</span>
                  <select
                    name="category"
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value);
                      setSub("");
                      clearFieldError("category");
                    }}
                    aria-invalid={Boolean(fieldErrors.category)}
                    aria-describedby={fieldErrors.category ? "product-category-error" : undefined}
                  >
                    <option value="">{t("admin.form.selectCategory")}</option>
                    {tops.map((c) => (
                      <option key={c.id} value={c.id}>
                        {categoryName(c.name)}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.category && <small className="field-inline-error" id="product-category-error" role="alert">{fieldErrors.category}</small>}
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
                <input name="brand" placeholder="Es. BMW" defaultValue={initialProduct?.brand} />
              </label>
              <label>
                {t("admin.form.model")}
                <input name="model" placeholder="Es. S1000RR" defaultValue={initialProduct?.model} />
              </label>
            </div>
          </section>

          <section className="admin-card form-card">
            <h2>{t("admin.form.priceAvailability")}</h2>
            <p>{t("admin.form.priceHint")}</p>
            <div className="form-row three">
              <div className="field-with-action">
                <label>
                  <span>{t("admin.form.priceEuro")}{!isDraft && <b className="required-mark" aria-hidden="true">*</b>}</span>
                  <select
                    name="price"
                    value={selectedPrice}
                    onChange={(event) => {
                      setSelectedPrice(event.target.value);
                      clearFieldError("price");
                    }}
                    aria-invalid={Boolean(fieldErrors.price)}
                    aria-describedby={fieldErrors.price ? "product-price-error" : undefined}
                  >
                    {formPrices.map((price) => (
                      <option key={price} value={price.toFixed(2)}>
                        {currency.format(price)}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.price && <small className="field-inline-error" id="product-price-error" role="alert">{fieldErrors.price}</small>}
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
                  <span>{t("admin.form.size")}{!isDraft && <b className="required-mark" aria-hidden="true">*</b>}</span>
                  <select
                    name="size"
                    value={selectedSize}
                    onChange={(event) => {
                      setSelectedSize(event.target.value);
                      clearFieldError("size");
                    }}
                    aria-invalid={Boolean(fieldErrors.size)}
                    aria-describedby={fieldErrors.size ? "product-size-error" : undefined}
                  >
                    {formSizes.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.size && <small className="field-inline-error" id="product-size-error" role="alert">{fieldErrors.size}</small>}
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
                <span>{t("admin.form.quantity")}</span>
                <input
                  name="qty"
                  type="number"
                  min="0"
                  placeholder="0"
                  defaultValue={initialProduct?.quantity ?? ""}
                  aria-invalid={Boolean(fieldErrors.qty)}
                  aria-describedby={fieldErrors.qty ? "product-quantity-error" : undefined}
                  onChange={() => clearFieldError("qty")}
                />
                {fieldErrors.qty && <small className="field-inline-error" id="product-quantity-error" role="alert">{fieldErrors.qty}</small>}
              </label>
            </div>
            <label>
              {t("admin.form.material")}
                <input name="material" placeholder="Es. Alluminio" defaultValue={initialProduct?.material} />
            </label>
          </section>

          <section className="admin-card form-card" aria-labelledby="product-translations-title">
            <h2 id="product-translations-title">{t("admin.form.translations")}</h2>
            <p>{t("admin.form.translationsHint")}</p>
            <div
              className="translation-tabs"
              role="tablist"
              aria-label={t("admin.form.translationsLanguage")}
            >
              {productTranslationLocales.map((locale) => {
                const selected = translationLocale === locale;
                const filled = Boolean(
                  translations[locale].name.trim() || translations[locale].description.trim(),
                );
                return (
                  <button
                    key={locale}
                    type="button"
                    role="tab"
                    id={translationTabId(locale)}
                    aria-selected={selected}
                    aria-controls="product-translation-panel"
                    tabIndex={selected ? 0 : -1}
                    className={selected ? "translation-tab active" : "translation-tab"}
                    onClick={() => setTranslationLocale(locale)}
                    onKeyDown={onTranslationTabKeyDown}
                  >
                    <span aria-hidden="true">{localeLanguages[locale].flag}</span>
                    <span lang={locale}>{localeLanguages[locale].name}</span>
                    {filled && (
                      <span className="translation-filled">
                        <span className="translation-filled-dot" aria-hidden="true" />
                        <span className="translation-sr-only">{t("admin.form.translationFilled")}</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div
              className="translation-panel"
              id="product-translation-panel"
              role="tabpanel"
              aria-labelledby={translationTabId(translationLocale)}
            >
              <label>
                {t("admin.form.translationName")}
                <input
                  lang={translationLocale}
                  maxLength={productTranslationNameMaxLength}
                  value={translations[translationLocale].name}
                  onChange={(event) =>
                    updateTranslation(translationLocale, "name", event.target.value)
                  }
                />
              </label>
              <label>
                {t("admin.form.translationDescription")}
                <textarea
                  lang={translationLocale}
                  maxLength={productTranslationDescriptionMaxLength}
                  value={translations[translationLocale].description}
                  onChange={(event) =>
                    updateTranslation(translationLocale, "description", event.target.value)
                  }
                />
              </label>
            </div>
          </section>
        </div>

        <aside className="form-side">
          <section className="admin-card form-card">
            <h2>{t("admin.form.photos")}</h2>
            {initialProduct?.images.map((image) => (
              <a key={image} href={image} target="_blank" rel="noreferrer">
                {image.split("/").at(-1)}
              </a>
            ))}
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
            {states.map((s) => (
              <label className="radio-row" key={s.value}>
                <input
                  type="radio"
                  name="state"
                  value={s.value}
                  checked={selectedStatus === s.value}
                  onChange={() => {
                    setSelectedStatus(s.value);
                    if (s.value === "draft") setFieldErrors({});
                  }}
                />
                <span>
                  <b>{t(s.label)}</b>
                  <small>{t(s.hint)}</small>
                </span>
              </label>
            ))}
            {isDraft && <p className="draft-note">{t("admin.form.draftOptionalNote")}</p>}
          </section>
          <section className="admin-card form-card">
            <h2>{t("admin.form.heroSection")}</h2>
            <label className="radio-row checkbox-row">
              <input
                type="checkbox"
                name="showOnHero"
                checked={showOnHero}
                onChange={(event) => setShowOnHero(event.target.checked)}
              />
              <span>
                <b>{t("admin.form.showOnHero")}</b>
                <small>{t("admin.form.showOnHeroHint")}</small>
              </span>
            </label>
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
          {deleteError && (
            <p className="field-error" role="alert">
              {deleteError}
            </p>
          )}
          <button
            type="submit"
            className="btn btn-gold"
            disabled={!databaseConfigured || saving}
          >
            {t(saving ? "admin.form.saving" : initialProduct ? "admin.products.edit" : "admin.form.save")}
          </button>
          {initialProduct && (
            <button
              type="button"
              className="btn btn-danger"
              style={{ backgroundColor: "#dc2626", color: "#fff" }}
              onClick={() => deleteDialog.current?.showModal()}
              disabled={deleting || saving}
            >
              {t("admin.products.delete")}
            </button>
          )}
        </aside>
      </form>
      {initialProduct && (
        <dialog
          ref={deleteDialog}
          className="admin-dialog"
          aria-labelledby="delete-product-title"
          aria-describedby="delete-product-warning"
          onClick={(event) => {
            if (event.target === event.currentTarget) event.currentTarget.close();
          }}
        >
          <h2 id="delete-product-title">{t("admin.products.deleteConfirmTitle")}</h2>
          <p id="delete-product-warning">{t("admin.products.deleteConfirmText")}</p>
          <div className="dialog-actions">
            <button
              type="button"
              className="btn btn-line"
              onClick={() => deleteDialog.current?.close()}
              disabled={deleting}
            >
              {t("admin.products.deleteCancel")}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              style={{ backgroundColor: "#dc2626", color: "#fff" }}
              onClick={deleteProduct}
              disabled={deleting}
            >
              {t(deleting ? "admin.products.deleteWorking" : "admin.products.delete")}
            </button>
          </div>
        </dialog>
      )}
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
              onChange={(event) => {
                setOptionDraft(event.target.value);
                if (optionError) setOptionError("");
              }}
              aria-invalid={Boolean(optionError)}
              aria-describedby={optionError ? "product-option-error" : undefined}
            />
          </label>
          {optionError && (
            <p className="field-error" id="product-option-error" role="alert">
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
