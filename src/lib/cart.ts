/** `null` stock means there is no quantity limit. */
export function canChangeCartQuantity(
  stock: number | null,
  currentQuantity: number,
  change: number,
): boolean {
  const nextQuantity = currentQuantity + change;
  return nextQuantity >= 0 && (stock === null || nextQuantity <= stock);
}
