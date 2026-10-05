"use client";

import { useState } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useLocale } from "@/components/ui/LocaleProvider";
import { ProductCard } from "@/components/public/ProductCard";
import { SearchBar } from "@/components/public/SearchBar";
import { demoCategories, demoProducts } from "@/lib/demo-data";
import { whatsappLink } from "@/lib/site";
import { categoryMessageKey, translate } from "@/messages";
import { matchesMultilingualSearch } from "@/lib/search";

export default function Home() {
  const { locale } = useLocale();
  const [query, setQuery] = useState("");
  const t = (key: string) => translate(locale, key);
  const visibleCategories = demoCategories.filter((name) =>
    matchesMultilingualSearch(query, name),
  );
  const visibleProducts = demoProducts.filter((product) =>
    matchesMultilingualSearch(query, product.name, product.path),
  );

  return (
    <>
      <section className="hero">
        <div className="hero-content">
          <div className="eyebrow light">
            <span /> {t("hero.eyebrow")}
          </div>
          <h1>
            {t("hero.title1")}
            <br />
            {t("hero.title2")} <em>{t("hero.em")}</em>
          </h1>
          <p>{t("hero.text")}</p>
          <div className="hero-buttons">
            <ButtonLink href="/#catalogo" kind="gold" icon="arrow">
              {t("cta.catalog")}
            </ButtonLink>
            <ButtonLink href={whatsappLink()} kind="light" icon="chat">
              {t("cta.whatsapp")}
            </ButtonLink>
          </div>
        </div>
      </section>

      <section className="search-section">
        <SearchBar locale={locale} value={query} onChange={setQuery} />
        {query.trim() && visibleCategories.length + visibleProducts.length === 0 && (
          <p className="search-empty" role="status">
            {t("search.empty")}
          </p>
        )}
      </section>

      <section className="section" id="catalogo">
        <div className="section-heading">
          <div>
            <div className="eyebrow">
              <span /> {t("catalog.eyebrow")}
            </div>
            <h2>{t("catalog.title")}</h2>
            <p>{t("catalog.text")}</p>
          </div>
        </div>
        <div className="category-grid">
          {visibleCategories.map((name, i) => (
            <div
              className={`category-card tone-${i % 4}`}
              data-initial={t(categoryMessageKey(name) ?? "catalog.title").charAt(0)}
              key={name}
            >
              <span className="category-copy">
                <b>{t(categoryMessageKey(name) ?? "catalog.title")}</b>
                <i>
                  <Icon name="arrow" size={18} />
                </i>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="section featured">
        <div className="section-heading">
          <div>
            <div className="eyebrow">
              <span /> {t("featured.eyebrow")}
            </div>
            <h2>{t("featured.title")}</h2>
          </div>
        </div>
        <div className="products-grid">
          {visibleProducts.map((p) => (
            <ProductCard key={p.name} product={p} locale={locale} />
          ))}
        </div>
      </section>

      <section className="section why">
        <div className="eyebrow centered">
          <span /> {t("why.eyebrow")}
        </div>
        <h2>{t("why.title")}</h2>
        <div className="benefit-grid">
          {[1, 2, 3].map((index) => (
            <div className="benefit" key={index}>
              <i>
                <Icon
                  name={(["spark", "box", "chat"] as IconName[])[index - 1]}
                  size={24}
                />
              </i>
              <h3>{t(`why.item${index}.title`)}</h3>
              <p>{t(`why.item${index}.text`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="cta" id="contatti">
        <div>
          <div className="eyebrow light">
            <span /> {t("contact.eyebrow")}
          </div>
          <h2>
            {t("contact.title1")}
            <br />
            {t("contact.title2")}
          </h2>
        </div>
        <div>
          <p>{t("contact.text")}</p>
          <ButtonLink href={whatsappLink()} kind="gold" icon="chat">
            {t("cta.whatsapp")}
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
