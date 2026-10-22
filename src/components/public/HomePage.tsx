"use client";

import { useEffect, useRef, useState } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useLocale } from "@/components/ui/LocaleProvider";
import { HeroCarousel } from "@/components/public/HeroCarousel";
import { HeroStripes } from "@/components/public/HeroStripes";
import { ProductCard } from "@/components/public/ProductCard";
import { ProductDetailsDialog } from "@/components/public/ProductDetailsDialog";
import { ReviewsSection } from "@/components/public/ReviewsSection";
import { ShoppingCart, type CartItem } from "@/components/public/ShoppingCart";
import { SearchBar } from "@/components/public/SearchBar";
import type { PublicCatalogCategory } from "@/lib/services/categories";
import type { HeroProduct, PublicCatalogProduct } from "@/lib/services/products";
import type { PublicReview } from "@/lib/services/reviews";
import { whatsappGreeting, whatsappLink } from "@/lib/site";
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
  reviews = [],
  featuredIds,
  heroProducts = [],
}: {
  categories: PublicCatalogCategory[];
  products: PublicCatalogProduct[];
  /** Products to show before the visitor filters; without it the first eight are shown. */
  featuredIds?: string[];
  /** Products for the hero carousel (marked in the admin, or featured as fallback). */
  heroProducts?: HeroProduct[];
  settings: SiteSettings;
  paymentsEnabled?: boolean;
  reviews?: PublicReview[];
}) {
  const { locale } = useLocale();
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<PublicCatalogProduct | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [showAllProducts, setShowAllProducts] = useState(false);
  // Each request takes the visitor to the results once React has rendered the new list.
  const [resultsRequest, setResultsRequest] = useState(0);
  const resultsHeadingRef = useRef<HTMLDivElement>(null);
  const resultsTitleRef = useRef<HTMLHeadingElement>(null);
  const showResults = () => setResultsRequest((current) => current + 1);
  useEffect(() => {
    if (resultsRequest && resultsHeadingRef.current) {
      revealResults(resultsHeadingRef.current, resultsTitleRef.current);
    }
  }, [resultsRequest]);
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
  const isFiltering = Boolean(selectedCategory || query.trim());
  const featuredProducts = featuredIds
    ? featuredIds.flatMap((id) => products.filter((product) => product.id === id))
    : products.slice(0, 8);
  const showFeatured = !isFiltering && !showAllProducts && featuredProducts.length < products.length;
  const visibleProducts = showFeatured ? featuredProducts : products.filter((product) =>
    (!selectedCategory || product.categoryIds.includes(selectedCategory)) &&
    matchesMultilingualSearch(query, product.searchText, product.path),
  );
  // The dialog arrows browse the products currently listed (featured, category or search results).
  const selectedIndex = selectedProduct ? visibleProducts.findIndex((product) => product.id === selectedProduct.id) : -1;
  const selectedCategoryName = categories.find((category) => category.id === selectedCategory)?.name;
  // Cover photo of each category card: an available product with a photo, preferring the
  // plates marked for the hero, then the featured ones (categoryIds already include the parent).
  const heroIds = new Set(heroProducts.map((product) => product.id));
  const featuredIdSet = new Set(featuredIds ?? []);
  const categoryCover = (categoryId: string) => {
    const candidates = products.filter((product) =>
      product.available && product.imageUrl && product.categoryIds.includes(categoryId),
    );
    const cover = candidates.find((product) => heroIds.has(product.id))
      ?? candidates.find((product) => featuredIdSet.has(product.id))
      ?? candidates[0];
    return cover?.imageUrl ?? null;
  };
  const productsTitle = showFeatured
    ? t("featured.title")
    : selectedCategoryName
      ? t(categoryMessageKey(selectedCategoryName) ?? selectedCategoryName)
      : query.trim()
        ? t("featured.searchTitle")
        : t("featured.allTitle");
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
  // Hero plates open the same details dialog as the catalog; otherwise jump to the products.
  const openHeroProduct = (heroProduct: HeroProduct) => {
    const product = products.find((item) => item.id === heroProduct.id);
    if (product) setSelectedProduct(product);
    else document.getElementById("prodotti")?.scrollIntoView({ behavior: scrollBehavior() });
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
      <section className={heroProducts.length ? "hero has-carousel" : "hero"}>
        {heroProducts.length === 0 && <HeroStripes standalone />}
        <div className="hero-content">
          <div className="hero-copy">
            <div className="eyebrow light"><span /> {t("hero.eyebrow")}</div>
            <h1>{t("hero.title1")}<br />{t("hero.title2")} <em>{t("hero.em")}</em></h1>
            <p>{t("hero.text")}</p>
            <div className="hero-buttons">
              <ButtonLink href="/#catalogo" kind="gold" icon="arrow">{t("cta.catalog")}</ButtonLink>
              <ButtonLink href={whatsappLink(whatsappGreeting(t, settings.name), settings.whatsappNumber)} kind="light" icon="chat">{t("cta.whatsapp")}</ButtonLink>
            </div>
          </div>
          {heroProducts.length > 0 && (
            <HeroCarousel
              products={heroProducts}
              locale={locale}
              paused={Boolean(selectedProduct)}
              onSelect={openHeroProduct}
            />
          )}
        </div>
      </section>

      <section className="search-section">
        <SearchBar
          locale={locale}
          value={query}
          onChange={setQuery}
          onSubmit={() => {
            if (query.trim() && visibleProducts.length) showResults();
          }}
        />
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
                    // The plates are listed below every category card: go to them.
                    showResults();
                  }
                }}
              >
                <CategoryPhoto imageUrl={categoryCover(category.id)} initial={label.charAt(0)} />
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
                    key={subcategory.id}
                    type="button"
                    aria-pressed={selectedCategory === subcategory.id}
                    onClick={() => {
                      setSelectedCategory((current) => current === subcategory.id ? expandedCategory : subcategory.id);
                      showResults();
                    }}
                  >
                    <CategoryPhoto imageUrl={categoryCover(subcategory.id)} initial={label.charAt(0)} />
                    <span className="category-copy"><b>{label}</b><i><Icon name="arrow" size={18} /></i></span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <div className="retro-divider" aria-hidden="true" />

      <section className="section featured" id="prodotti">
        <div className="section-heading products-heading" ref={resultsHeadingRef}><div>
          <div className="eyebrow"><span /> {t(showFeatured ? "featured.eyebrow" : "featured.catalogEyebrow")}</div>
          {/* Focusable from script only: after choosing a category, screen readers read the results title. */}
          <h2 className="products-title" ref={resultsTitleRef} tabIndex={-1}>{productsTitle}</h2>
        </div></div>
        <div className="products-grid">
          {visibleProducts.map((product) => <ProductCard key={product.id} product={product} locale={locale} onSelect={() => setSelectedProduct(product)} />)}
        </div>
        {!isFiltering && featuredProducts.length < products.length && (
          <div className="products-more">
            <button
              type="button"
              className="btn btn-dark products-more-button"
              onClick={() => {
                setShowAllProducts((current) => !current);
                if (showAllProducts) document.getElementById("prodotti")?.scrollIntoView({ behavior: scrollBehavior() });
              }}
            >
              {showAllProducts
                ? t("featured.showFeatured")
                : t("featured.showAll").replace("{n}", String(products.length))}
            </button>
          </div>
        )}
      </section>

      {selectedProduct && (
        <ProductDetailsDialog
          product={selectedProduct}
          locale={locale}
          quantityInCart={cartItems.find((item) => item.product.id === selectedProduct.id)?.quantity ?? 0}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={() => addToCart(selectedProduct)}
          whatsappHref={whatsappLink(whatsappGreeting(t, settings.name, selectedProduct), settings.whatsappNumber)}
          {...(selectedIndex >= 0 && {
            position: { index: selectedIndex, total: visibleProducts.length },
            onPrevious: () => setSelectedProduct(visibleProducts[(selectedIndex - 1 + visibleProducts.length) % visibleProducts.length]),
            onNext: () => setSelectedProduct(visibleProducts[(selectedIndex + 1) % visibleProducts.length]),
          })}
        />
      )}
      <ShoppingCart
        items={cartItems}
        locale={locale}
        whatsappNumber={settings.whatsappNumber}
        shippingCountries={availableShippingCountries(settings.shippingRates)}
        paymentsEnabled={paymentsEnabled}
        onChangeQuantity={changeCartQuantity}
        onRemove={(productId) => setCartItems((current) => current.filter((item) => item.product.id !== productId))}
      />

      <div className="retro-divider" aria-hidden="true" />

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

      <ReviewsSection reviews={reviews} locale={locale} />

      <section className="cta" id="contatti">
        <div><div className="eyebrow light"><span /> {t("contact.eyebrow")}</div>
          <h2>{t("contact.title1")}<br />{t("contact.title2")}</h2></div>
        <div><p>{t("contact.text")}</p>
          <ButtonLink href={whatsappLink(whatsappGreeting(t, settings.name), settings.whatsappNumber)} kind="gold" icon="chat">{t("cta.whatsapp")}</ButtonLink></div>
      </section>
    </>
  );
}

/** Smooth scrolling, unless the visitor asked the system for reduced motion. */
function scrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
}

/**
 * Brings the results heading into view, only if it is not already in the upper part of
 * the screen (so the first plates are visible too), and moves focus to its title.
 */
function revealResults(heading: HTMLElement, title: HTMLElement | null) {
  const { top, bottom } = heading.getBoundingClientRect();
  if (top < 0 || bottom > window.innerHeight * 0.6) {
    heading.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  }
  title?.focus({ preventScroll: true });
}

/** Top of a category card: a real plate of the category, or a colour block with its initial. */
function CategoryPhoto({ imageUrl, initial }: { imageUrl: string | null; initial: string }) {
  if (!imageUrl) {
    return <span className="category-photo is-empty" aria-hidden="true">{initial}</span>;
  }
  return (
    <span className="category-photo">
      {/* The category name is the button text, so the photo is decorative. */}
      <img src={imageUrl} alt="" loading="lazy" />
    </span>
  );
}
