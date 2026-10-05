const productStatuses = ["DRAFT", "PUBLISHED", "UNAVAILABLE"] as const;

export type NewProductInput = {
  referenceCode: string;
  name: string;
  description: string | null;
  categoryName: string;
  subcategoryName: string | null;
  brand: string | null;
  model: string | null;
  size: string;
  price: string;
  quantity: number | null;
  material: string | null;
  status: (typeof productStatuses)[number];
};

export function parseNewProductInput(
  value: unknown,
): { ok: true; data: NewProductInput } | { ok: false } {
  if (!value || typeof value !== "object") return { ok: false };
  const input = value as Record<string, unknown>;
  const referenceCode =
    typeof input.referenceCode === "string" ? input.referenceCode.trim() : "";
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const categoryName =
    typeof input.categoryName === "string" ? input.categoryName.trim() : "";
  const subcategoryName =
    typeof input.subcategoryName === "string" ? input.subcategoryName.trim() : "";
  const size = typeof input.size === "string" ? input.size.trim() : "";
  const rawPrice = typeof input.price === "number" ? String(input.price) : input.price;
  const priceText = typeof rawPrice === "string" ? rawPrice.trim().replace(",", ".") : "";
  const price = Number(priceText);
  const rawQuantity = input.quantity;
  const quantityText =
    rawQuantity === null || rawQuantity === undefined || rawQuantity === ""
      ? null
      : String(rawQuantity);
  const quantity = quantityText === null ? null : Number(quantityText);

  if (
    !referenceCode ||
    referenceCode.length > 64 ||
    !name ||
    name.length > 200 ||
    !categoryName ||
    categoryName.length > 120 ||
    subcategoryName.length > 120 ||
    !size ||
    size.length > 80 ||
    !/^\d+(?:\.\d{1,2})?$/.test(priceText) ||
    !Number.isFinite(price) ||
    price <= 0 ||
    price > 99_999_999.99 ||
    (quantity !== null && (!Number.isInteger(quantity) || quantity < 0)) ||
    !productStatuses.includes(input.status as (typeof productStatuses)[number])
  ) {
    return { ok: false };
  }

  const optionalText = (field: unknown): string | null =>
    typeof field === "string" && field.trim() ? field.trim() : null;

  return {
    ok: true,
    data: {
      referenceCode,
      name,
      description: optionalText(input.description),
      categoryName,
      subcategoryName: subcategoryName || null,
      brand: optionalText(input.brand),
      model: optionalText(input.model),
      size,
      price: price.toFixed(2),
      quantity,
      material: optionalText(input.material),
      status: input.status as NewProductInput["status"],
    },
  };
}
