import type { AdminRoleName } from "@/lib/validators/admin-user";

// Same limits as src/lib/password-core.mjs, checked here to warn early.
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 200;
export const NAME_MAX_LENGTH = 120;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const roleLabelKey = (role: AdminRoleName) => `admin.role.${role}`;

export type ApiError = { error: string; reason?: string };

/** Message key for a password that the server would reject, or null. */
export function passwordProblemKey(password: string, email = ""): string | null {
  const length = [...password].length;
  if (length < PASSWORD_MIN_LENGTH) return "admin.password.tooShort";
  if (length > PASSWORD_MAX_LENGTH) return "admin.password.tooLong";
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail && password.trim().toLowerCase() === normalizedEmail) return "admin.password.sameAsEmail";
  return null;
}

export function isValidEmailInput(value: string): boolean {
  const email = value.trim();
  return email.length <= 254 && EMAIL.test(email);
}

export function isValidNameInput(value: string): boolean {
  const name = value.trim();
  return name.length > 0 && [...name].length <= NAME_MAX_LENGTH;
}

export async function readApiError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => null)) as { error?: unknown; reason?: unknown } | null;
  return {
    error: typeof body?.error === "string" ? body.error : "",
    reason: typeof body?.reason === "string" ? body.reason : undefined,
  };
}

const ERROR_KEYS: Record<string, string> = {
  unauthorized: "admin.errors.sessionExpired",
  auth_unavailable: "admin.errors.authUnavailable",
  forbidden: "admin.errors.forbidden",
  database_not_configured: "admin.errors.noDatabase",
  invalid_request: "admin.errors.invalidRequest",
  users_unavailable: "admin.users.errorUnavailable",
  invalid_current_password: "admin.account.errorCurrent",
  too_many_attempts: "admin.account.errorTooMany",
  no_account: "admin.account.errorNoAccount",
  invalid_user: "admin.users.errorInvalid",
  email_in_use: "admin.users.errorEmailInUse",
  last_superadmin: "admin.users.errorLastSuperadmin",
  cannot_deactivate_self: "admin.users.errorDeactivateSelf",
  cannot_demote_self: "admin.users.errorDemoteSelf",
  use_account_password: "admin.users.errorUseAccount",
  user_not_found: "admin.users.errorNotFound",
};

const PASSWORD_REASON_KEYS: Record<string, string> = {
  too_short: "admin.password.tooShort",
  too_long: "admin.password.tooLong",
  same_as_email: "admin.password.sameAsEmail",
};

/** Message key for an error returned by the account and users routes. */
export function apiErrorKey({ error, reason }: ApiError, fallback: string): string {
  if (error === "weak_password") return PASSWORD_REASON_KEYS[reason ?? ""] ?? "admin.password.tooShort";
  return ERROR_KEYS[error] ?? fallback;
}
