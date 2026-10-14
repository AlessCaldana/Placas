// Password hashing and policy shared by the app (src/lib/password.ts) and the
// owner's CLI (scripts/admin-user.mjs). Plain ESM with JSDoc types so Node can
// import it directly; keep the hash format defined only here.
//
// Hash format: scrypt$N$r$p$saltBase64$hashBase64 (standard base64 with padding).
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// N = 2^15 (32 MiB per hash with r = 8). Raise it here; stored hashes carry
// their own parameters and weaker ones are re-hashed at the next login.
export const SCRYPT_N = 32768;
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;
export const SCRYPT_KEY_LENGTH = 64;
const SALT_BYTES = 16;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 200;
/**
 * Hard limit (UTF-16 units) for any password read from a request or prompt,
 * also for login attempts. Longer input is rejected, never truncated.
 * The policy limit (PASSWORD_MAX_LENGTH code points) is always below it.
 */
export const PASSWORD_INPUT_MAX_LENGTH = 1000;
const MAX_SCRYPT_MEMORY = 64 * 1024 * 1024;

/**
 * @param {string} password
 * @param {Buffer} salt
 * @param {{ N: number, r: number, p: number, keyLength: number }} params
 * @returns {Promise<Buffer>}
 */
function deriveKey(password, salt, params) {
  const { N, r, p, keyLength } = params;
  return new Promise((resolve, reject) => {
    // maxmem covers 128 * N * r with margin; the parameters are bounded in parseHash.
    scrypt(password.normalize("NFC"), salt, keyLength, { N, r, p, maxmem: 256 * N * r + 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

/**
 * Hashes a password with a fresh random salt.
 * @param {string} password
 * @returns {Promise<string>}
 */
export async function hashPassword(password) {
  if (password.length > PASSWORD_INPUT_MAX_LENGTH) throw new RangeError("password_too_long");
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(password, salt, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    keyLength: SCRYPT_KEY_LENGTH,
  });
  return ["scrypt", SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString("base64"), key.toString("base64")].join("$");
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Parses a stored hash. Parameters are bounded so a corrupted row cannot make
 * verification allocate excessive memory or CPU.
 * @param {string} stored
 * @returns {{ N: number, r: number, p: number, salt: Buffer, key: Buffer } | null}
 */
function parseHash(stored) {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const [, nText, rText, pText, saltText, keyText] = parts;
  if (![nText, rText, pText].every((value) => /^\d{1,7}$/.test(value))) return null;
  const N = Number(nText);
  const r = Number(rText);
  const p = Number(pText);
  const powerOfTwo = N >= 1024 && N <= 1 << 20 && (N & (N - 1)) === 0;
  if (!powerOfTwo || r < 1 || r > 32 || p < 1 || p > 16) return null;
  if (128 * N * r > MAX_SCRYPT_MEMORY) return null;
  if (!BASE64.test(saltText) || !BASE64.test(keyText)) return null;
  const salt = Buffer.from(saltText, "base64");
  const key = Buffer.from(keyText, "base64");
  if (salt.length < 8 || key.length < 16 || key.length > 128) return null;
  return { N, r, p, salt, key };
}

/**
 * Checks a password against a stored hash in constant time. Returns false for
 * malformed hashes instead of throwing.
 * @param {string} password
 * @param {string} stored
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, stored) {
  if (password.length > PASSWORD_INPUT_MAX_LENGTH) return false;
  const parsed = parseHash(stored);
  if (!parsed) return false;
  const key = await deriveKey(password, parsed.salt, {
    N: parsed.N,
    r: parsed.r,
    p: parsed.p,
    keyLength: parsed.key.length,
  });
  return timingSafeEqual(key, parsed.key);
}

/**
 * True when a (valid) stored hash uses weaker parameters than the current
 * ones, so it should be replaced after a successful verification.
 * @param {string} stored
 * @returns {boolean}
 */
export function needsRehash(stored) {
  const parsed = parseHash(stored);
  if (!parsed) return false;
  return (
    parsed.N < SCRYPT_N ||
    parsed.r < SCRYPT_R ||
    parsed.p < SCRYPT_P ||
    parsed.key.length < SCRYPT_KEY_LENGTH
  );
}

/**
 * Password policy. Returns null when the password is acceptable, otherwise the
 * reason code: "too_short" | "too_long" | "same_as_email".
 * Length is counted in characters (code points), not bytes.
 * @param {string} password
 * @param {string} [email]
 * @returns {"too_short" | "too_long" | "same_as_email" | null}
 */
export function checkPasswordPolicy(password, email = "") {
  const length = [...password].length;
  if (length < PASSWORD_MIN_LENGTH) return "too_short";
  if (length > PASSWORD_MAX_LENGTH) return "too_long";
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail && password.trim().toLowerCase() === normalizedEmail) return "same_as_email";
  return null;
}

/**
 * Canonical form of an account email: trimmed and lowercase.
 * @param {string} email
 * @returns {string}
 */
export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

/**
 * Basic shape check for an account email (already normalized), max 254 chars.
 * @param {string} email
 * @returns {boolean}
 */
export function isValidEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
