"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { StatusBadge } from "@/components/admin/AdminHeader";
import { Icon } from "@/components/ui/Icon";
import { useLocale } from "@/components/ui/LocaleProvider";
import type { AdminProduct } from "@/lib/demo-data";
import { matchesMultilingualSearch } from "@/lib/search";
import { categoryMessageKey } from "@/messages";

export function ProductSearchTable({ products }: { products: AdminProduct[] }) {
  const { locale, t } = useLocale();
  const currency = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" });
  const [query, setQuery] = useState("");
  const visibleProducts = products.filter((product) =>
    matchesMultilingualSearch(query, product.name, product.reference, product.category),
  );

  return (
    <>
      <label className="category-search product-search">
        <Icon name="search" size={18} />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("admin.products.search")}
          aria-label={t("admin.products.search")}
        />
      </label>
      <section className="admin-card table-card product-table-card">
        <div className="table-scroll admin-scroll-box">
          <table className="product-table">
            <thead>
              <tr>
                <th>{t("admin.products.name")}</th>
                <th>{t("admin.products.reference")}</th>
                <th>{t("admin.products.category")}</th>
                <th>{t("admin.products.size")}</th>
                <th>{t("admin.products.price")}</th>
                <th>{t("admin.products.quantity")}</th>
                <th>{t("admin.products.state")}</th>
                <th>{t("admin.products.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {visibleProducts.map((product) => {
                const categoryKey = categoryMessageKey(product.category);
                return (
                  <tr key={product.reference}>
                    <td className="product-cell-name">
                      <div className="product-name-cell">
                        {product.imageUrl ? (
                          <Image
                            className="product-thumbnail"
                            src={product.imageUrl}
                            alt=""
                            width={48}
                            height={48}
                          />
                        ) : (
                          <span
                            className="product-thumbnail-placeholder"
                            aria-hidden="true"
                          >
                            {product.name.charAt(0).toLocaleUpperCase(locale)}
                          </span>
                        )}
                        <b>{product.name}</b>
                      </div>
                    </td>
                    {/* data-label: column name shown on each field when the table becomes cards (narrow screens). */}
                    <td data-label={t("admin.products.reference")}>
                      <code>{product.reference}</code>
                    </td>
                    <td data-label={t("admin.products.category")}>{categoryKey ? t(categoryKey) : product.category}</td>
                    <td data-label={t("admin.products.size")}>{product.size || "—"}</td>
                    <td data-label={t("admin.products.price")}>
                      <b>{product.price > 0 ? currency.format(product.price) : "—"}</b>
                    </td>
                    <td data-label={t("admin.products.quantity")}>{product.qty ?? "—"}</td>
                    <td data-label={t("admin.products.state")}>
                      <StatusBadge state={product.state} />
                    </td>
                    <td className="product-cell-actions">
                      <Link
                        className="row-link"
                        href={`/admin/prodotti/${encodeURIComponent(product.reference)}/modifica`}
                      >
                        {t("admin.products.edit")}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {visibleProducts.length === 0 && (
          <p className="category-search-empty">{t("admin.products.noResults")}</p>
        )}
      </section>
    </>
  );
}
