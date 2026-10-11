"use client";

import { useState } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useLocale } from "@/components/ui/LocaleProvider";
import { ProductCard } from "@/components/public/ProductCard";
import { ProductDetailsDialog } from "@/components/public/ProductDetailsDialog";
import { ShoppingCart, type CartItem } from "@/components/public/ShoppingCart";
import { SearchBar } from "@/components/public/SearchBar";
import type { PublicCatalogCategory } from "@/lib/services/categories";
import type { PublicCatalogProduct } from "@/lib/services/products";
import { whatsappLink } from "@/lib/site";
import { categoryMessageKey, translate } from "@/messages";
import { matchesMultilingualSearch } from "@/lib/search";
import { canChangeCartQuantity } from "@/lib/cart";
import type { SiteSettings } from "@/lib/services/site-settings";
import { availableShippingCountries } from "@/lib/payments/shipping";

export function HomePage({
  categories,
  products,
  settings,
  paymentsEnabled = false,
}: {
  categories: PublicCatalogCategory[];
  products: PublicCatalogProduct[];
  settings: SiteSettings;
  paymentsEnabled?: boolean;
}) {
  const { locale } = useLocale();
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<PublicCatalogProduct | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const t = (key: string) => translate(locale, key);
  const matchingCategories = categories.filter((category) =>
    matchesMultilingualSearch(query, category.name),
  );
  const visibleCategories = categories.filter((category) =>
    !category.parentId && matchingCategories.some((match) =>
      match.id === category.id || match.parentId === category.id,
    ),
  );
  const visibleSubcategories = categories.filter((category) =>
    category.parentId === expandedCategory && matchesMultilingualSearch(query, category.name),
  );
  const visibleProducts = products.filter((product) =>
    (!selectedCategory || product.categoryIds.includes(selectedCategory)) &&
    matchesMultilingualSearch(query, product.name, product.path),
  );
  const addToCart = (product: PublicCatalogProduct) => {
    if (!product.available) return;
    setCartItems((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      if (!canChangeCartQuantity(product.quantity, existing?.quantity ?? 0, 1)) return current;
      return existing
        ? current.map((item) => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item)
        : [...current, { product, quantity: 1 }];
    });
    setSelectedProduct(null);
  };
  const changeCartQuantity = (productId: string, change: number) => {
    setCartItems((current) => current.flatMap((item) => {
      if (item.product.id !== productId) return [item];
      if (!canChangeCartQuantity(item.product.quantity, item.quantity, change)) return [item];
      const quantity = item.quantity + change;
      return quantity > 0 ? [{ ...item, quantity }] : [];
    }));
  };

  return (
    <>
      <section className="hero">
        <div className="hero-content">
          <div className="eyebrow light"><span /> {t("hero.eyebrow")}</div>
          <h1>{t("hero.title1")}<br />{t("hero.title2")} <em>{t("hero.em")}</em></h1>
          <p>{t("hero.text")}</p>
          <div className="hero-buttons">
            <ButtonLink href="/#catalogo" kind="gold" icon="arrow">{t("cta.catalog")}</ButtonLink>
            <ButtonLink href={whatsappLink(undefined, settings.whatsappNumber)} kind="light" icon="chat">{t("cta.whatsapp")}</ButtonLink>
          </div>
        </div>
      </section>

      <section className="search-section">
        <SearchBar locale={locale} value={query} onChange={setQuery} />
        {query.trim() && visibleCategories.length + visibleProducts.length === 0 && (
          <p className="search-empty" role="status">{t("search.empty")}</p>
        )}
      </section>

      <section className="section" id="catalogo">
        <div className="section-heading"><div>
          <div className="eyebrow"><span /> {t("catalog.eyebrow")}</div>
          <h2>{t("catalog.title")}</h2>
          <p>{t("catalog.text")}</p>
        </div></div>
        <div className="category-grid">
          {visibleCategories.map((category, index) => {
            const label = t(categoryMessageKey(category.name) ?? category.name);
            const isExpanded = expandedCategory === category.id;
            return (
              <button
                className={`category-card tone-${index % 4}${selectedCategory === category.id ? " is-selected" : ""}`}
                data-initial={label.charAt(0)}
                key={category.id}
                type="button"
                aria-expanded={isExpanded}
                aria-pressed={selectedCategory === category.id}
                onClick={() => {
                  if (isExpanded) {
                    setExpandedCategory(null);
                    setSelectedCategory(null);
                  } else {
                    setExpandedCategory(category.id);
                    setSelectedCategory(category.id);
                    if (!categories.some((item) => item.parentId === category.id)) {
                      document.getElementById("prodotti")?.scrollIntoView({ behavior: "smooth" });
                    }
                  }
                }}
              >
                <span className="category-copy"><b>{label}</b><i><Icon name="arrow" size={18} /></i></span>
              </button>
            );
          })}
        </div>
        {expandedCategory && visibleSubcategories.length > 0 && (
          <div className="subcategory-section">
            <div className="category-grid subcategory-grid">
              {visibleSubcategories.map((subcategory, index) => {
                const label = t(categoryMessageKey(subcategory.name) ?? subcategory.name);
                return (
                  <button
                    className={`category-card tone-${index % 4}${selectedCategory === subcategory.id ? " is-selected" : ""}`}
                    data-initial={label.charAt(0)}
                    key={subcategory.id}
                    type="button"
                    aria-pressed={selectedCategory === subcategory.id}
                    onClick={() => {
                      setSelectedCategory((current) => current === subcategory.id ? expandedCategory : subcategory.id);
                      document.getElementById("prodotti")?.scrollIntoView({ behavior: "smooth" });
                    }}
                  >
                    <span className="category-copy"><b>{label}</b><i><Icon name="arrow" size={18} /></i></span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section className="section featured" id="prodotti">
        <div className="section-heading"><div>
          <div className="eyebrow"><span /> {t("featured.eyebrow")}</div>
          <h2>{t("featured.title")}</h2>
        </div></div>
        <div className="products-grid">
          {visibleProducts.map((product) => <ProductCard key={product.id} product={product} locale={locale} onSelect={() => setSelectedProduct(product)} />)}
        </div>
      </section>

      {selectedProduct && <ProductDetailsDialog product={selectedProduct} locale={locale} quantityInCart={cartItems.find((item) => item.product.id === selectedProduct.id)?.quantity ?? 0} onClose={() => setSelectedProduct(null)} onAddToCart={() => addToCart(selectedProduct)} />}
      <ShoppingCart
        items={cartItems}
        locale={locale}
        whatsappNumber={settings.whatsappNumber}
        shippingCountries={availableShippingCountries(settings.shippingRates)}
        paymentsEnabled={paymentsEnabled}
        onChangeQuantity={changeCartQuantity}
        onRemove={(productId) => setCartItems((current) => current.filter((item) => item.product.id !== productId))}
      />

      <section className="section why">
        <div className="eyebrow centered"><span /> {t("why.eyebrow")}</div>
        <h2>{t("why.title")}</h2>
        <div className="benefit-grid">
          {[1, 2, 3].map((index) => <div className="benefit" key={index}>
            <i><Icon name={( ["spark", "box", "chat"] as IconName[])[index - 1]} size={24} /></i>
            <h3>{t(`why.item${index}.title`)}</h3>
            <p>{t(`why.item${index}.text`)}</p>
          </div>)}
        </div>
      </section>

      <section className="cta" id="contatti">
        <div><div className="eyebrow light"><span /> {t("contact.eyebrow")}</div>
          <h2>{t("contact.title1")}<br />{t("contact.title2")}</h2></div>
        <div><p>{t("contact.text")}</p>
          <ButtonLink href={whatsappLink(undefined, settings.whatsappNumber)} kind="gold" icon="chat">{t("cta.whatsapp")}</ButtonLink></div>
      </section>
    </>
  );
}
