import { isValidEmail, normalizeEmail } from "@/lib/password-core.mjs";
import {
  PASSWORD_INPUT_MAX_LENGTH,
  checkPasswordPolicy,
  type PasswordPolicyError,
} from "@/lib/password";

export type AdminRoleName = "SUPERADMIN" | "ADMIN";

export type CreateAdminUserInput = {
  email: string;
  name: string;
  role: AdminRoleName;
  password: string;
};

export type UpdateAdminUserInput = {
  name?: string;
  role?: AdminRoleName;
  active?: boolean;
  password?: string;
};

export type PasswordChangeInput = {
  currentPassword: string;
  newPassword: string;
};

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: "invalid_user" | "invalid_request" }
  | { ok: false; error: "weak_password"; reason: PasswordPolicyError };

const NAME_MAX_LENGTH = 120;
const PASSWORD_FIELD_MAX = PASSWORD_INPUT_MAX_LENGTH;
// Control and invisible formatting characters (bidi overrides, zero-width...).
const UNSAFE_NAME_CHARS = /[\u0000-\u001F\u007F-\u009F\p{Cf}]/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseAdminEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = normalizeEmail(value);
  return isValidEmail(email) ? email : null;
}

export function parseAdminName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || [...name].length > NAME_MAX_LENGTH || UNSAFE_NAME_CHARS.test(name)) return null;
  return name;
}

export function parseAdminRole(value: unknown): AdminRoleName | null {
  return value === "SUPERADMIN" || value === "ADMIN" ? value : null;
}

function parsePasswordField(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= PASSWORD_FIELD_MAX ? value : null;
}

/** Body of POST /api/admin/users. */
export function parseCreateAdminUserInput(body: unknown): ParseResult<CreateAdminUserInput> {
  if (!isRecord(body)) return { ok: false, error: "invalid_user" };
  const email = parseAdminEmail(body.email);
  const name = parseAdminName(body.name);
  const role = parseAdminRole(body.role);
  if (!email || !name || !role || typeof body.password !== "string") {
    return { ok: false, error: "invalid_user" };
  }
  const reason = checkPasswordPolicy(body.password, email);
  if (reason) return { ok: false, error: "weak_password", reason };
  return { ok: true, value: { email, name, role, password: body.password } };
}

/**
 * Body of PATCH /api/admin/users/[id]. Unknown fields are ignored; at least one
 * known field is required. The password policy needs the target's email, so it
 * is applied by the service.
 */
export function parseUpdateAdminUserInput(body: unknown): ParseResult<UpdateAdminUserInput> {
  if (!isRecord(body)) return { ok: false, error: "invalid_user" };
  const value: UpdateAdminUserInput = {};
  if (body.name !== undefined) {
    const name = parseAdminName(body.name);
    if (!name) return { ok: false, error: "invalid_user" };
    value.name = name;
  }
  if (body.role !== undefined) {
    const role = parseAdminRole(body.role);
    if (!role) return { ok: false, error: "invalid_user" };
    value.role = role;
  }
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") return { ok: false, error: "invalid_user" };
    value.active = body.active;
  }
  if (body.password !== undefined) {
    if (typeof body.password !== "string" || body.password.length > PASSWORD_FIELD_MAX) {
      return { ok: false, error: "invalid_user" };
    }
    value.password = body.password;
  }
  if (Object.keys(value).length === 0) return { ok: false, error: "invalid_user" };
  return { ok: true, value };
}

/** Body of POST /api/admin/account/password. */
export function parsePasswordChangeInput(body: unknown): ParseResult<PasswordChangeInput> {
  if (!isRecord(body)) return { ok: false, error: "invalid_request" };
  const currentPassword = parsePasswordField(body.currentPassword);
  const newPassword = typeof body.newPassword === "string" && body.newPassword.length <= PASSWORD_FIELD_MAX
    ? body.newPassword
    : null;
  if (!currentPassword || newPassword === null) return { ok: false, error: "invalid_request" };
  return { ok: true, value: { currentPassword, newPassword } };
}
