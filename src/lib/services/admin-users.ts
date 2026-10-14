import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import {
  checkPasswordPolicy,
  hashPassword,
  needsRehash,
  verifyPassword,
  type PasswordPolicyError,
} from "@/lib/password";
import type {
  AdminRoleName,
  CreateAdminUserInput,
  UpdateAdminUserInput,
} from "@/lib/validators/admin-user";

/** Panel account as returned by the API. Never includes the password hash. */
export type AdminUserSummary = {
  id: string;
  email: string;
  name: string;
  role: AdminRoleName;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

/** Fields needed to validate a session against the database. */
export type AdminSessionUser = {
  id: string;
  email: string;
  name: string;
  role: AdminRoleName;
  active: boolean;
  sessionVersion: number;
};

export type AdminUserErrorCode =
  | "email_in_use"
  | "user_not_found"
  | "last_superadmin"
  | "cannot_deactivate_self"
  | "cannot_demote_self"
  | "use_account_password"
  | "weak_password"
  | "invalid_current_password"
  | "no_account";

export class AdminUserError extends Error {
  constructor(
    readonly code: AdminUserErrorCode,
    readonly reason?: PasswordPolicyError,
  ) {
    super(code);
    this.name = "AdminUserError";
  }
}

const SUMMARY_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

function toSummary(user: {
  id: string;
  email: string;
  name: string;
  role: AdminRoleName;
  active: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}): AdminUserSummary {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    active: user.active,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
  };
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}

// ---------------------------------------------------------------------------
// Pure guard logic (unit-tested in tests/admin-users.test.ts)
// ---------------------------------------------------------------------------

export type GuardTarget = { id: string; role: AdminRoleName; active: boolean };

/**
 * Rules for PATCH /api/admin/users/[id]:
 * - an account cannot deactivate or demote itself;
 * - its own password is changed with the current one (account endpoint);
 * - at least one active SUPERADMIN must remain.
 * activeSuperadmins is the current count, including the target if it is one.
 */
export function checkUserUpdateGuards(input: {
  actorId: string;
  target: GuardTarget;
  changes: Pick<UpdateAdminUserInput, "role" | "active" | "password">;
  activeSuperadmins: number;
}): AdminUserErrorCode | null {
  const { actorId, target, changes, activeSuperadmins } = input;
  const isSelf = actorId === target.id;
  if (isSelf && changes.active === false) return "cannot_deactivate_self";
  if (isSelf && changes.role !== undefined && changes.role !== target.role) return "cannot_demote_self";
  if (isSelf && changes.password !== undefined) return "use_account_password";

  const wasActiveSuperadmin = target.active && target.role === "SUPERADMIN";
  const nextRole = changes.role ?? target.role;
  const nextActive = changes.active ?? target.active;
  const staysActiveSuperadmin = nextActive && nextRole === "SUPERADMIN";
  if (wasActiveSuperadmin && !staysActiveSuperadmin && activeSuperadmins <= 1) return "last_superadmin";
  return null;
}

/** A new account may be an ADMIN only when an active SUPERADMIN already exists. */
export function checkUserCreateGuard(input: {
  role: AdminRoleName;
  activeSuperadmins: number;
}): AdminUserErrorCode | null {
  return input.role !== "SUPERADMIN" && input.activeSuperadmins === 0 ? "last_superadmin" : null;
}

/** Whether the change must log the user out everywhere. */
export function invalidatesSessions(changes: UpdateAdminUserInput): boolean {
  return changes.password !== undefined || changes.active === false;
}

// ---------------------------------------------------------------------------
// Database access
// ---------------------------------------------------------------------------

/**
 * Number of accounts. With missingTableAsEmpty, a missing table (migration not
 * applied yet) counts as zero; otherwise the error is thrown (fail closed).
 */
export async function countAdminUsers(
  options: { missingTableAsEmpty?: boolean } = {},
): Promise<number> {
  try {
    return await getDb().adminUser.count();
  } catch (error) {
    if (options.missingTableAsEmpty && hasPrismaCode(error, "P2021")) return 0;
    throw error;
  }
}

export async function findSessionUser(id: string): Promise<AdminSessionUser | null> {
  return getDb().adminUser.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true, active: true, sessionVersion: true },
  });
}

export async function findLoginUser(
  email: string,
): Promise<(AdminSessionUser & { passwordHash: string }) | null> {
  return getDb().adminUser.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      sessionVersion: true,
      passwordHash: true,
    },
  });
}

/**
 * Records a successful login. When the stored hash uses weaker scrypt
 * parameters than the current ones, it is replaced with a fresh hash of the
 * same password (no session is invalidated). The replacement only applies if
 * the hash did not change meanwhile.
 */
export async function recordAdminLogin(
  id: string,
  rehash?: { currentHash: string; password: string },
): Promise<void> {
  const db = getDb();
  await db.adminUser.update({ where: { id }, data: { lastLoginAt: new Date() } });
  if (rehash && needsRehash(rehash.currentHash)) {
    try {
      const passwordHash = await hashPassword(rehash.password);
      await db.adminUser.updateMany({
        where: { id, passwordHash: rehash.currentHash },
        data: { passwordHash },
      });
    } catch {
      // Best effort: the old hash still works and is retried at the next login.
    }
  }
}

export async function listAdminUsers(): Promise<AdminUserSummary[]> {
  const users = await getDb().adminUser.findMany({
    select: SUMMARY_SELECT,
    orderBy: [{ createdAt: "asc" }, { email: "asc" }],
  });
  return users.map(toSummary);
}

// Guards read and then write; Serializable makes two concurrent requests
// (e.g. two superadmins demoting each other) unable to both pass.
async function serializable<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await getDb().$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (attempt < 3 && hasPrismaCode(error, "P2034")) continue;
      throw error;
    }
  }
}

function countActiveSuperadmins(tx: Prisma.TransactionClient): Promise<number> {
  return tx.adminUser.count({ where: { role: "SUPERADMIN", active: true } });
}

export async function createAdminUser(input: CreateAdminUserInput): Promise<AdminUserSummary> {
  const passwordHash = await hashPassword(input.password);
  try {
    return await serializable(async (tx) => {
      const guard = checkUserCreateGuard({
        role: input.role,
        activeSuperadmins: await countActiveSuperadmins(tx),
      });
      if (guard) throw new AdminUserError(guard);
      if (await tx.adminUser.findUnique({ where: { email: input.email }, select: { id: true } })) {
        throw new AdminUserError("email_in_use");
      }
      const user = await tx.adminUser.create({
        data: { email: input.email, name: input.name, role: input.role, passwordHash },
        select: SUMMARY_SELECT,
      });
      return toSummary(user);
    });
  } catch (error) {
    if (hasPrismaCode(error, "P2002")) throw new AdminUserError("email_in_use");
    throw error;
  }
}

export async function updateAdminUser(
  actorId: string,
  id: string,
  changes: UpdateAdminUserInput,
): Promise<AdminUserSummary> {
  // Hash outside the transaction: scrypt is slow on purpose.
  let passwordHash: string | undefined;
  if (changes.password !== undefined) {
    const target = await getDb().adminUser.findUnique({ where: { id }, select: { email: true } });
    if (!target) throw new AdminUserError("user_not_found");
    if (actorId === id) throw new AdminUserError("use_account_password");
    const reason = checkPasswordPolicy(changes.password, target.email);
    if (reason) throw new AdminUserError("weak_password", reason);
    passwordHash = await hashPassword(changes.password);
  }

  return serializable(async (tx) => {
    const target = await tx.adminUser.findUnique({
      where: { id },
      select: { id: true, role: true, active: true },
    });
    if (!target) throw new AdminUserError("user_not_found");
    const guard = checkUserUpdateGuards({
      actorId,
      target,
      changes,
      activeSuperadmins: await countActiveSuperadmins(tx),
    });
    if (guard) throw new AdminUserError(guard);

    const user = await tx.adminUser.update({
      where: { id },
      data: {
        ...(changes.name !== undefined && { name: changes.name }),
        ...(changes.role !== undefined && { role: changes.role }),
        ...(changes.active !== undefined && { active: changes.active }),
        ...(passwordHash !== undefined && { passwordHash }),
        ...(invalidatesSessions(changes) && { sessionVersion: { increment: 1 } }),
      },
      select: SUMMARY_SELECT,
    });
    return toSummary(user);
  });
}

/**
 * Changes the password of the signed-in account after checking the current
 * one. Returns the new sessionVersion so the caller can re-issue its cookie;
 * every other session of the account stops working.
 */
export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ sessionVersion: number }> {
  const db = getDb();
  const user = await db.adminUser.findUnique({
    where: { id: userId },
    select: { email: true, active: true, passwordHash: true, sessionVersion: true },
  });
  if (!user || !user.active) throw new AdminUserError("no_account");
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new AdminUserError("invalid_current_password");
  }
  const reason = checkPasswordPolicy(newPassword, user.email);
  if (reason) throw new AdminUserError("weak_password", reason);
  const passwordHash = await hashPassword(newPassword);
  // Only applies if nothing changed the account meanwhile (another reset or a deactivation).
  const result = await db.adminUser.updateManyAndReturn({
    where: { id: userId, active: true, sessionVersion: user.sessionVersion },
    data: { passwordHash, sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });
  if (result.length !== 1) throw new AdminUserError("no_account");
  return { sessionVersion: result[0].sessionVersion };
}
