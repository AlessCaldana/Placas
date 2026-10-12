// v2: the official sizes and prices replace the test options saved in browsers under v1.
export const productOptionsStorageKey = "placa_product_options_v2";
export const defaultProductSizes = ["20 x 30 cm", "15 x 30 cm", "35 x 35 cm"];
export const defaultProductPrices = [5, 10];
const maxProductDimensionCm = 200;

export function normalizeProductSize(value: string): string | null {
  const match = value.match(/^\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(?:cm)?\s*$/i);
  if (!match) return null;
  const dimensions = match.slice(1).map((part) => Number(part.replace(",", ".")));
  if (dimensions.some((dimension) => !Number.isFinite(dimension) || dimension <= 0 || dimension > maxProductDimensionCm)) {
    return null;
  }
  return `${dimensions[0]} x ${dimensions[1]} cm`;
}

export type ProductOptionPreferences = {
  sizes: string[];
  prices: number[];
};

const productOptionsChangedEvent = "placa-product-options-changed";

export function getProductOptionSnapshot(): string | null {
  try {
    return window.localStorage.getItem(productOptionsStorageKey);
  } catch {
    return null;
  }
}

export function getServerProductOptionSnapshot(): null {
  return null;
}

export function subscribeToProductOptions(onChange: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === productOptionsStorageKey || event.key === null) onChange();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(productOptionsChangedEvent, onChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(productOptionsChangedEvent, onChange);
  };
}

export function saveProductOptionPreferences(
  preferences: ProductOptionPreferences,
): void {
  try {
    window.localStorage.setItem(productOptionsStorageKey, JSON.stringify(preferences));
    window.dispatchEvent(new Event(productOptionsChangedEvent));
  } catch {
    return;
  }
}

function uniqueSizes(values: unknown[]): string[] {
  const sizes = [...defaultProductSizes];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const size = value.trim().replace(/\s+/g, " ");
    if (
      size &&
      !sizes.some((existing) => existing.toLocaleLowerCase() === size.toLocaleLowerCase())
    ) {
      sizes.push(size);
    }
  }
  return sizes;
}

function uniquePrices(values: unknown[]): number[] {
  const prices = [...defaultProductPrices];
  for (const value of values) {
    const price = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(price) || price <= 0) continue;
    const normalized = Math.round(price * 100) / 100;
    if (!prices.some((existing) => existing === normalized)) prices.push(normalized);
  }
  return prices;
}

export function parseProductOptionPreferences(
  raw: string | null,
): ProductOptionPreferences {
  if (!raw) return { sizes: [...defaultProductSizes], prices: [...defaultProductPrices] };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { sizes: [...defaultProductSizes], prices: [...defaultProductPrices] };
    }
    const options = parsed as { sizes?: unknown; prices?: unknown };
    return {
      sizes: uniqueSizes(Array.isArray(options.sizes) ? options.sizes : []),
      prices: uniquePrices(Array.isArray(options.prices) ? options.prices : []),
    };
  } catch {
    return { sizes: [...defaultProductSizes], prices: [...defaultProductPrices] };
  }
}
