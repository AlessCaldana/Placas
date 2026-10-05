import type { DemoProduct } from "@/lib/demo-data";
import { categoryMessageKey, translate, type Locale } from "@/messages";

export function ProductCard({
  product,
  locale,
}: {
  product: DemoProduct;
  locale: Locale;
}) {
  const path = product.path
    .split(" · ")
    .map((part) => {
      const key = categoryMessageKey(part);
      return key ? translate(locale, key) : part;
    })
    .join(" · ");

  return (
    <article className="product-card">
      <div
        className={`product-image tone-${product.tone}`}
        data-initial={product.name.charAt(0)}
        role="img"
        aria-label={translate(locale, "featured.preview").replace("{name}", product.name)}
      >
        <span>{translate(locale, "featured.available")}</span>
      </div>
      <div className="product-copy">
        <small>{path}</small>
        <b>{product.name}</b>
        <p>
          <strong>{product.price}</strong>
          <span>{product.size}</span>
        </p>
      </div>
    </article>
  );
}
