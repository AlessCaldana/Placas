import type { PublicCatalogProduct } from "@/lib/services/products";
import { categoryMessageKey, translate, type Locale } from "@/messages";

export function ProductCard({
  product,
  locale,
  onSelect,
}: {
  product: PublicCatalogProduct;
  locale: Locale;
  onSelect: () => void;
}) {
  const unavailable = !product.available;
  const path = product.path
    .split(" · ")
    .map((part) => {
      const key = categoryMessageKey(part);
      return key ? translate(locale, key) : part;
    })
    .join(" · ");

  return (
    <button className="product-card" type="button" onClick={onSelect} aria-label={`${product.name} — ${product.price}`}>
      <div
        className={`product-image tone-${product.tone}${product.imageUrl ? " has-image" : ""}`}
        data-initial={product.name.charAt(0)}
        role={product.imageUrl ? undefined : "img"}
        aria-label={product.imageUrl ? undefined : translate(locale, "featured.preview").replace("{name}", product.name)}
      >
        {product.imageUrl && <img className="product-photo" src={product.imageUrl} alt={product.name} />}
        <span className={`product-status ${unavailable ? "is-unavailable" : "is-available"}`}>
          {translate(locale, unavailable ? "featured.unavailable" : "featured.available")}
        </span>
      </div>
      <div className="product-copy">
        <small>{path}</small>
        <b>{product.name}</b>
        <p>
          <strong>{product.price}</strong>
          <span>{product.size}</span>
        </p>
      </div>
    </button>
  );
}
