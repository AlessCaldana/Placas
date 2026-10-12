// E.164: "+" followed by 7-15 digits, the first one not zero (Stripe Checkout
// returns collected phone numbers in this format).
const E164 = /^\+[1-9]\d{6,14}$/;
const MAX_PHONE_LENGTH = 32;

/** Returns the phone in E.164 format, or null when it is missing or malformed. */
export function parseE164Phone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const phone = value.trim().slice(0, MAX_PHONE_LENGTH);
  return E164.test(phone) ? phone : null;
}
