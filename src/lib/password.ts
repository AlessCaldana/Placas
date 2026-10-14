import {
  PASSWORD_INPUT_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  checkPasswordPolicy as checkPolicy,
  hashPassword,
  needsRehash,
  verifyPassword,
} from "./password-core.mjs";

// The hash format and the policy live in password-core.mjs so the CLI
// (scripts/admin-user.mjs) writes exactly the same hashes as the app.
export {
  PASSWORD_INPUT_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  hashPassword,
  needsRehash,
  verifyPassword,
};

export type PasswordPolicyError = "too_short" | "too_long" | "same_as_email";

/** Returns null when the password is acceptable, otherwise the reason code. */
export function checkPasswordPolicy(password: string, email = ""): PasswordPolicyError | null {
  return checkPolicy(password, email);
}

let dummyHash: Promise<string> | null = null;

/**
 * Runs a verification against a throwaway hash so that a login for an unknown
 * email takes about as long as one for a known email. Always resolves false.
 */
export async function verifyAgainstDummyHash(password: string): Promise<false> {
  dummyHash ??= hashPassword("placa-dummy-password-for-timing");
  await verifyPassword(password, await dummyHash);
  return false;
}
