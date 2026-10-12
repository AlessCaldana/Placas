import { whatsappLink } from "@/lib/site";

const MIN_DIGITS = 8;
const MAX_DIGITS = 15;

/**
 * Digits of a phone number as wa.me expects them (international format,
 * no "+", spaces or symbols). Returns null when it cannot be a valid number.
 */
export function whatsappDigits(phone: string | null): string | null {
  if (typeof phone !== "string") return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= MIN_DIGITS && digits.length <= MAX_DIGITS ? digits : null;
}

/** wa.me link to write to a customer, or null when their phone is not usable. */
export function customerWhatsappLink(phone: string | null, message?: string): string | null {
  const digits = whatsappDigits(phone);
  return digits ? whatsappLink(message, digits) : null;
}
