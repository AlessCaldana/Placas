import { randomBytes } from "node:crypto";

// Public order reference: "PL-" + 6 characters. The alphabet leaves out
// 0/O and 1/I so it can be read out or typed without confusion. It has 32
// symbols, so masking a random byte with 31 picks each one with equal odds.
export const ORDER_NUMBER_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const ORDER_NUMBER_PREFIX = "PL-";
const ORDER_NUMBER_LENGTH = 6;
const MAX_INPUT_LENGTH = 32;

export function generateOrderNumber(): string {
  const bytes = randomBytes(ORDER_NUMBER_LENGTH);
  let suffix = "";
  for (const byte of bytes) suffix += ORDER_NUMBER_ALPHABET[byte & 31];
  return `${ORDER_NUMBER_PREFIX}${suffix}`;
}

// Orders created before order numbers existed were backfilled with hex
// characters (0-9, A-F), so lookups accept any digit or letter.
const TYPED_ORDER_NUMBER = /^(?:PL[-\s]?)?([0-9A-Z]{6})$/;

/**
 * Normalises what the buyer typed ("pl-abc234", " ABC234 ", "PL ABC234") to
 * "PL-ABC234". Returns null when it cannot be an order number.
 */
export function normalizeOrderNumber(value: unknown): string | null {
  if (typeof value !== "string" || value.length > MAX_INPUT_LENGTH) return null;
  const match = TYPED_ORDER_NUMBER.exec(value.trim().toUpperCase());
  return match ? `${ORDER_NUMBER_PREFIX}${match[1]}` : null;
}
