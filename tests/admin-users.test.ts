import { describe, expect, it } from "vitest";
import {
  checkUserCreateGuard,
  checkUserUpdateGuards,
  invalidatesSessions,
} from "@/lib/services/admin-users";
import {
  parseCreateAdminUserInput,
  parsePasswordChangeInput,
  parseUpdateAdminUserInput,
} from "@/lib/validators/admin-user";

const SELF = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const superadmin = (id: string, active = true) => ({ id, role: "SUPERADMIN" as const, active });
const admin = (id: string, active = true) => ({ id, role: "ADMIN" as const, active });

describe("checkUserUpdateGuards", () => {
  it("does not let an account deactivate or demote itself", () => {
    expect(checkUserUpdateGuards({ actorId: SELF, target: superadmin(SELF), changes: { active: false }, activeSuperadmins: 3 }))
      .toBe("cannot_deactivate_self");
    expect(checkUserUpdateGuards({ actorId: SELF, target: superadmin(SELF), changes: { role: "ADMIN" }, activeSuperadmins: 3 }))
      .toBe("cannot_demote_self");
  });

  it("sends own password changes to the account endpoint", () => {
    expect(checkUserUpdateGuards({ actorId: SELF, target: superadmin(SELF), changes: { password: "x" }, activeSuperadmins: 2 }))
      .toBe("use_account_password");
  });

  it("allows harmless self updates", () => {
    expect(checkUserUpdateGuards({ actorId: SELF, target: superadmin(SELF), changes: { role: "SUPERADMIN", active: true }, activeSuperadmins: 1 }))
      .toBeNull();
  });

  it("keeps at least one active superadmin", () => {
    expect(checkUserUpdateGuards({ actorId: "dev", target: superadmin(OTHER), changes: { active: false }, activeSuperadmins: 1 }))
      .toBe("last_superadmin");
    expect(checkUserUpdateGuards({ actorId: "dev", target: superadmin(OTHER), changes: { role: "ADMIN" }, activeSuperadmins: 1 }))
      .toBe("last_superadmin");
    expect(checkUserUpdateGuards({ actorId: SELF, target: superadmin(OTHER), changes: { active: false }, activeSuperadmins: 2 }))
      .toBeNull();
  });

  it("ignores the count for targets that are not active superadmins", () => {
    expect(checkUserUpdateGuards({ actorId: SELF, target: admin(OTHER), changes: { active: false }, activeSuperadmins: 1 }))
      .toBeNull();
    expect(checkUserUpdateGuards({ actorId: SELF, target: superadmin(OTHER, false), changes: { role: "ADMIN" }, activeSuperadmins: 1 }))
      .toBeNull();
    expect(checkUserUpdateGuards({ actorId: SELF, target: admin(OTHER), changes: { role: "SUPERADMIN" }, activeSuperadmins: 1 }))
      .toBeNull();
  });
});

describe("checkUserCreateGuard", () => {
  it("requires the first active account to be a superadmin", () => {
    expect(checkUserCreateGuard({ role: "ADMIN", activeSuperadmins: 0 })).toBe("last_superadmin");
    expect(checkUserCreateGuard({ role: "SUPERADMIN", activeSuperadmins: 0 })).toBeNull();
    expect(checkUserCreateGuard({ role: "ADMIN", activeSuperadmins: 1 })).toBeNull();
  });
});

describe("invalidatesSessions", () => {
  it("logs the user out on a new password or a deactivation only", () => {
    expect(invalidatesSessions({ password: "new-password-123" })).toBe(true);
    expect(invalidatesSessions({ active: false })).toBe(true);
    expect(invalidatesSessions({ active: true, name: "Maria", role: "ADMIN" })).toBe(false);
  });
});

describe("admin user validators", () => {
  const valid = { email: "  Maria@Example.COM ", name: "  Maria   Rossi ", role: "ADMIN", password: "a-strong-password" };

  it("normalizes a valid new account", () => {
    expect(parseCreateAdminUserInput(valid)).toEqual({
      ok: true,
      value: { email: "maria@example.com", name: "Maria Rossi", role: "ADMIN", password: "a-strong-password" },
    });
  });

  it("rejects invalid fields and weak passwords", () => {
    expect(parseCreateAdminUserInput({ ...valid, email: "nope" })).toEqual({ ok: false, error: "invalid_user" });
    expect(parseCreateAdminUserInput({ ...valid, role: "OWNER" })).toEqual({ ok: false, error: "invalid_user" });
    expect(parseCreateAdminUserInput({ ...valid, name: "x‮y" })).toEqual({ ok: false, error: "invalid_user" });
    expect(parseCreateAdminUserInput({ ...valid, password: "short" }))
      .toEqual({ ok: false, error: "weak_password", reason: "too_short" });
    expect(parseCreateAdminUserInput({ ...valid, password: "maria@example.com" }))
      .toEqual({ ok: false, error: "weak_password", reason: "same_as_email" });
  });

  it("accepts partial updates and requires at least one known field", () => {
    expect(parseUpdateAdminUserInput({ active: false, unknown: 1 })).toEqual({ ok: true, value: { active: false } });
    expect(parseUpdateAdminUserInput({ unknown: 1 })).toEqual({ ok: false, error: "invalid_user" });
    expect(parseUpdateAdminUserInput({ active: "no" })).toEqual({ ok: false, error: "invalid_user" });
    expect(parseUpdateAdminUserInput(null)).toEqual({ ok: false, error: "invalid_user" });
  });

  it("validates the password change body", () => {
    expect(parsePasswordChangeInput({ currentPassword: "old", newPassword: "new" }).ok).toBe(true);
    expect(parsePasswordChangeInput({ currentPassword: "", newPassword: "new" }))
      .toEqual({ ok: false, error: "invalid_request" });
    expect(parsePasswordChangeInput({ currentPassword: "old" })).toEqual({ ok: false, error: "invalid_request" });
  });
});
