import { HomePage } from "@/components/public/HomePage";
import { demoCategories, demoProducts } from "@/lib/demo-data";
import { isDatabaseConfigured } from "@/lib/db";
import { isStripeConfigured } from "@/lib/payments/stripe";
import { listPublicCategories } from "@/lib/services/categories";
import { listFeaturedProductIds, listPublicProducts, type PublicCatalogProduct } from "@/lib/services/products";
import { listPublishedReviews, type PublicReview } from "@/lib/services/reviews";
import { defaultSiteSettings, getSiteSettings } from "@/lib/services/site-settings";

async function loadPublishedReviews(): Promise<PublicReview[]> {
  if (!isDatabaseConfigured()) return [];
  try {
    return await listPublishedReviews(6);
  } catch {
    // Reviews are optional: the home page stays available without them.
    return [];
  }
}

export default async function Home() {
  const reviewsPromise = loadPublishedReviews();
  let settings = defaultSiteSettings();
  try {
    settings = await getSiteSettings();
  } catch {
    // Keep the catalog available if settings cannot be read.
  }
  if (isDatabaseConfigured()) {
    const catalog = await Promise.all([listPublicCategories(), listPublicProducts(), listFeaturedProductIds()])
      // Keep the public page available while the database is being configured.
      .catch(() => null);
    if (catalog) {
      const [categories, products, featuredIds] = catalog;
      return (
        <HomePage
          categories={categories}
          products={products}
          featuredIds={featuredIds}
          settings={settings}
          paymentsEnabled={isStripeConfigured()}
          reviews={await reviewsPromise}
        />
      );
    }
  }

  const categories = demoCategories.map((name) => ({ id: `demo-${name}`, name, parentId: null }));
  const products: PublicCatalogProduct[] = demoProducts.map((product, index) => {
    const categoryName = product.path.split(" · ")[0];
    const category = categories.find((item) => item.name === categoryName);
    return {
      ...product,
      description: product.description,
      referenceCode: product.referenceCode,
      id: `demo-product-${index}`,
      priceCents: Number(product.price.replace(/[^\d,]/g, "").replace(",", "")),
      categoryIds: category ? [category.id] : [],
      available: product.available !== false && product.quantity !== 0,
      imageUrl: product.imageUrl ?? null,
      quantity: product.quantity ?? null,
    };
  });
  return <HomePage categories={categories} products={products} settings={settings} reviews={await reviewsPromise} />;
}
