import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  findSessionUser: vi.fn(),
  countAdminUsers: vi.fn(),
}));

vi.mock("@/lib/services/admin-users", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/admin-users")>()),
  findSessionUser: mocks.findSessionUser,
  countAdminUsers: mocks.countAdminUsers,
}));

import {
  isBootstrapMode,
  isEnvLoginConfigured,
  isEnvLoginValid,
  isSessionValidForUser,
  rejectWithoutAdminSession,
  requireAdmin,
  resolveAdminSession,
} from "@/lib/admin-auth";
import {
  ADMIN_SESSION_COOKIE,
  ENV_ADMIN_ID,
  SESSION_TTL_SECONDS,
  createSessionToken,
  verifySessionToken,
} from "@/lib/admin-session";
import {
  beginLoginAttempt,
  beginPasswordChangeAttempt,
  completeLoginAttempt,
  completePasswordChangeAttempt,
  loginRetryAfterSeconds,
  releaseLoginAttempt,
  releasePasswordChangeAttempt,
} from "@/lib/login-rate-limit";
import { createRateLimiter } from "@/lib/rate-limit";
import { isCrossOriginRequest } from "@/lib/request-origin";

const env = { ...process.env };
const USER_ID = "3f0c8a52-7d1e-4b8a-9c3e-2a1b4c5d6e7f";

function activeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    email: "maria@example.com",
    name: "Maria",
    role: "ADMIN",
    active: true,
    sessionVersion: 3,
    ...overrides,
  };
}

function requestWith(token: string | null) {
  return new Request("http://localhost/api/admin/products", {
    headers: token ? { cookie: `other=1; ${ADMIN_SESSION_COOKIE}=${token}` } : {},
  });
}

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-with-at-least-32-bytes!!";
  process.env.ADMIN_EMAIL = "Owner@Example.com";
  process.env.ADMIN_PASSWORD = "a-long-test-password";
  // Never reaches a real database: the service functions are mocked.
  process.env.DATABASE_URL = "postgresql://unused:unused@localhost:5432/unused";
  mocks.findSessionUser.mockReset();
  mocks.countAdminUsers.mockReset().mockResolvedValue(1);
});

afterEach(() => {
  process.env = { ...env };
  vi.unstubAllEnvs();
});

describe("session token", () => {
  it("round-trips user id, session version and expiry", () => {
    const now = 1_800_000_000_000;
    const token = createSessionToken(USER_ID, 3, now)!;
    expect(verifySessionToken(token, now)).toEqual({
      userId: USER_ID,
      sessionVersion: 3,
      expiresAt: now + SESSION_TTL_SECONDS * 1000,
    });
  });

  it("rejects tampered signatures and payloads", () => {
    const token = createSessionToken(USER_ID, 3)!;
    expect(verifySessionToken(`${token.slice(0, -2)}xx`)).toBeNull();
    const parts = token.split(".");
    expect(verifySessionToken([parts[0], "4", ...parts.slice(2)].join("."))).toBeNull();
    const otherUser = "00000000-0000-4000-8000-000000000000";
    expect(verifySessionToken([otherUser, ...parts.slice(1)].join("."))).toBeNull();
  });

  it("rejects a token signed with another secret", () => {
    const token = createSessionToken(USER_ID, 0)!;
    process.env.AUTH_SECRET = "another-secret-with-at-least-32-bytes";
    expect(verifySessionToken(token)).toBeNull();
  });

  it("rejects expired tokens", () => {
    const now = 1_800_000_000_000;
    const token = createSessionToken(USER_ID, 0, now)!;
    expect(verifySessionToken(token, now + SESSION_TTL_SECONDS * 1000 - 1)).not.toBeNull();
    expect(verifySessionToken(token, now + SESSION_TTL_SECONDS * 1000)).toBeNull();
  });

  it("rejects the old single-admin format and malformed values", () => {
    expect(verifySessionToken(`${Date.now() + 1000}.abcdefghijklmnopqrstuv.sig`)).toBeNull();
    expect(verifySessionToken("")).toBeNull();
    expect(verifySessionToken("not-a-uuid.0.1800000000000.abcdefghijklmnopqrstuv.sig")).toBeNull();
  });

  it("is not issued without a strong AUTH_SECRET", () => {
    process.env.AUTH_SECRET = "short";
    expect(createSessionToken(USER_ID, 0)).toBeNull();
  });
});

describe("full session check", () => {
  it("accepts an active user with the same session version", async () => {
    mocks.findSessionUser.mockResolvedValue(activeUser());
    const identity = await resolveAdminSession(createSessionToken(USER_ID, 3));
    expect(identity).toEqual({
      id: USER_ID,
      email: "maria@example.com",
      name: "Maria",
      role: "ADMIN",
      dev: false,
      bootstrap: false,
    });
  });

  it("rejects a session version mismatch (password changed or user deactivated)", async () => {
    mocks.findSessionUser.mockResolvedValue(activeUser({ sessionVersion: 4 }));
    expect(await resolveAdminSession(createSessionToken(USER_ID, 3))).toBeNull();
  });

  it("rejects inactive and deleted users", async () => {
    mocks.findSessionUser.mockResolvedValue(activeUser({ active: false }));
    expect(await resolveAdminSession(createSessionToken(USER_ID, 3))).toBeNull();
    mocks.findSessionUser.mockResolvedValue(null);
    expect(await resolveAdminSession(createSessionToken(USER_ID, 3))).toBeNull();
  });

  it("isSessionValidForUser compares id, active flag and version", () => {
    const payload = { userId: USER_ID, sessionVersion: 2, expiresAt: Date.now() + 1000 };
    expect(isSessionValidForUser(payload, { id: USER_ID, active: true, sessionVersion: 2 })).toBe(true);
    expect(isSessionValidForUser(payload, { id: USER_ID, active: true, sessionVersion: 1 })).toBe(false);
    expect(isSessionValidForUser(payload, { id: USER_ID, active: false, sessionVersion: 2 })).toBe(false);
    expect(isSessionValidForUser(payload, null)).toBe(false);
  });
});

describe("bootstrap login with ADMIN_EMAIL / ADMIN_PASSWORD", () => {
  it("accepts the configured email (any case) with the right password", () => {
    expect(isEnvLoginValid(" owner@example.com ", "a-long-test-password")).toBe(true);
    expect(isEnvLoginValid("other@example.com", "a-long-test-password")).toBe(false);
    expect(isEnvLoginValid("owner@example.com", "wrong")).toBe(false);
  });

  it("allows a short env password only outside production", () => {
    process.env.ADMIN_PASSWORD = "admin";
    expect(isEnvLoginValid("owner@example.com", "admin")).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    process.env.ADMIN_BOOTSTRAP = "on";
    expect(isEnvLoginValid("owner@example.com", "admin")).toBe(false);
  });

  it("in production requires ADMIN_BOOTSTRAP=on", () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.ADMIN_BOOTSTRAP;
    expect(isEnvLoginConfigured()).toBe(false);
    expect(isEnvLoginValid("owner@example.com", "a-long-test-password")).toBe(false);
    process.env.ADMIN_BOOTSTRAP = "on";
    expect(isEnvLoginValid("owner@example.com", "a-long-test-password")).toBe(true);
  });

  it("fails closed in production on a missing table or database unless bootstrap is on", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.ADMIN_BOOTSTRAP;
    mocks.countAdminUsers.mockResolvedValue(0);
    await isBootstrapMode();
    expect(mocks.countAdminUsers).toHaveBeenLastCalledWith({ missingTableAsEmpty: false });
    process.env.ADMIN_BOOTSTRAP = "on";
    await isBootstrapMode();
    expect(mocks.countAdminUsers).toHaveBeenLastCalledWith({ missingTableAsEmpty: true });
    delete process.env.DATABASE_URL;
    expect(await isBootstrapMode()).toBe(true);
    delete process.env.ADMIN_BOOTSTRAP;
    expect(await isBootstrapMode()).toBe(false);
  });

  it("keeps the env session valid only while no account exists", async () => {
    const token = createSessionToken(ENV_ADMIN_ID, 0);
    mocks.countAdminUsers.mockResolvedValue(0);
    expect(await resolveAdminSession(token)).toMatchObject({ id: "env", role: "SUPERADMIN", bootstrap: true });
    mocks.countAdminUsers.mockResolvedValue(1);
    expect(await resolveAdminSession(token)).toBeNull();
  });

  it("rejects the env session when the env login is not configured", async () => {
    mocks.countAdminUsers.mockResolvedValue(0);
    const token = createSessionToken(ENV_ADMIN_ID, 0);
    delete process.env.ADMIN_PASSWORD;
    expect(await resolveAdminSession(token)).toBeNull();
  });
});

describe("requireAdmin", () => {
  it("returns the dev identity when login is off in development", async () => {
    delete process.env.ADMIN_AUTH;
    const result = await requireAdmin(requestWith(null), { role: "SUPERADMIN" });
    expect(result).toMatchObject({ id: "dev", role: "SUPERADMIN", dev: true });
    expect(await rejectWithoutAdminSession(requestWith(null))).toBeNull();
  });

  it("requires a session in production and with ADMIN_AUTH=on", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await rejectWithoutAdminSession(requestWith(null)))?.status).toBe(401);
    vi.unstubAllEnvs();
    process.env.ADMIN_AUTH = "on";
    expect((await rejectWithoutAdminSession(requestWith(null)))?.status).toBe(401);
  });

  it("accepts a valid user session and enforces the role", async () => {
    process.env.ADMIN_AUTH = "on";
    mocks.findSessionUser.mockResolvedValue(activeUser());
    const request = requestWith(createSessionToken(USER_ID, 3));
    expect(await requireAdmin(request)).toMatchObject({ id: USER_ID, role: "ADMIN" });
    const denied = await requireAdmin(request, { role: "SUPERADMIN" });
    expect(denied).toBeInstanceOf(NextResponse);
    expect((denied as NextResponse).status).toBe(403);
    mocks.findSessionUser.mockResolvedValue(activeUser({ role: "SUPERADMIN" }));
    expect(await requireAdmin(request, { role: "SUPERADMIN" })).toMatchObject({ role: "SUPERADMIN" });
  });

  it("answers 503 when the database fails", async () => {
    process.env.ADMIN_AUTH = "on";
    mocks.findSessionUser.mockRejectedValue(new Error("connection refused"));
    const result = await requireAdmin(requestWith(createSessionToken(USER_ID, 3)));
    expect((result as NextResponse).status).toBe(503);
  });
});

describe("isCrossOriginRequest", () => {
  const make = (headers: Record<string, string>) =>
    new Request("http://localhost:3000/api/admin/users", { method: "POST", headers });

  it("accepts same-origin and header-less requests", () => {
    expect(isCrossOriginRequest(make({ origin: "http://localhost:3000" }))).toBe(false);
    expect(isCrossOriginRequest(make({}))).toBe(false);
  });

  it("rejects other origins, unparseable origins and cross-site fetches", () => {
    expect(isCrossOriginRequest(make({ origin: "https://evil.example" }))).toBe(true);
    expect(isCrossOriginRequest(make({ origin: "null" }))).toBe(true);
    expect(isCrossOriginRequest(make({ "sec-fetch-site": "cross-site" }))).toBe(true);
  });
});

describe("login rate limit", () => {
  // Each test uses its own time range so the in-memory windows do not mix.
  const WINDOW = 15 * 60 * 1000;

  it("blocks an IP after five failures and unblocks when the window ends", () => {
    const ip = "203.0.113.7";
    const start = 1_000_000;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(beginLoginAttempt(ip, `user${attempt}@example.com`, start)).toBe(0);
    }
    expect(beginLoginAttempt(ip, "other@example.com", start)).toBe(15 * 60);
    expect(loginRetryAfterSeconds(ip, "other@example.com", start + WINDOW)).toBe(0);
  });

  it("reserves attempts synchronously, so parallel requests cannot all pass", () => {
    const ip = "203.0.113.8";
    const start = 10_000_000;
    // Ten concurrent requests reach the check before any password is verified.
    const results = Array.from({ length: 10 }, () => beginLoginAttempt(ip, "owner@example.com", start));
    expect(results.filter((retryAfter) => retryAfter === 0)).toHaveLength(5);
  });

  it("a successful login clears the IP and releases its reservation", () => {
    const ip = "203.0.113.9";
    const start = 20_000_000;
    for (let attempt = 0; attempt < 4; attempt += 1) beginLoginAttempt(ip, "a@example.com", start);
    beginLoginAttempt(ip, "a@example.com", start);
    completeLoginAttempt(ip, "a@example.com", start);
    expect(loginRetryAfterSeconds(ip, "a@example.com", start)).toBe(0);
  });

  it("a server error releases the reservation", () => {
    const ip = "203.0.113.10";
    const start = 30_000_000;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      beginLoginAttempt(ip, "b@example.com", start);
      releaseLoginAttempt(ip, "b@example.com", start);
    }
    expect(loginRetryAfterSeconds(ip, "b@example.com", start)).toBe(0);
  });

  it("an attack on one account leaves a single attempt per IP, but never locks the owner out", () => {
    const start = 40_000_000;
    const target = "owner-under-attack@example.com";
    for (let attempt = 0; attempt < 10; attempt += 1) beginLoginAttempt(`198.51.100.${attempt}`, target, start);
    // An attacking IP that already failed is blocked for this account...
    expect(loginRetryAfterSeconds("198.51.100.0", target, start)).toBeGreaterThan(0);
    // ...while the owner, from an address without failures, may still try.
    expect(beginLoginAttempt("192.0.2.50", target, start)).toBe(0);
    expect(beginLoginAttempt("192.0.2.50", target, start)).toBeGreaterThan(0);
    // Other accounts are not affected by the account alert.
    expect(loginRetryAfterSeconds("198.51.100.0", "someone-else@example.com", start)).toBe(0);
  });

  it("many failures overall switch every IP to one attempt instead of a global lockout", () => {
    const start = 50_000_000;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      beginLoginAttempt(`198.51.101.${attempt}`, `spray${attempt}@example.com`, start);
    }
    expect(beginLoginAttempt("192.0.2.1", "owner@example.com", start + 60_000)).toBe(0);
    expect(beginLoginAttempt("192.0.2.1", "owner@example.com", start + 60_000)).toBe(15 * 60);
    expect(loginRetryAfterSeconds("192.0.2.1", "owner@example.com", start + WINDOW)).toBe(0);
  });

  it("limits wrong current passwords per account, with the same reservation", () => {
    const user = "3f0c8a52-7d1e-4b8a-9c3e-2a1b4c5d6e70";
    const start = 90_000_000;
    const results = Array.from({ length: 8 }, () => beginPasswordChangeAttempt(user, start));
    expect(results.filter((retryAfter) => retryAfter === 0)).toHaveLength(5);
    releasePasswordChangeAttempt(user, start);
    expect(beginPasswordChangeAttempt(user, start)).toBe(0);
    completePasswordChangeAttempt(user);
    expect(beginPasswordChangeAttempt(user, start)).toBe(0);
  });
});

describe("rate limiter", () => {
  it("counts, undoes and accepts a stricter limit", () => {
    const limiter = createRateLimiter({ max: 5, windowMs: 1000 });
    limiter.register("k", 0);
    limiter.register("k", 0);
    expect(limiter.count("k", 0)).toBe(2);
    expect(limiter.retryAfterSeconds("k", 0)).toBe(0);
    expect(limiter.retryAfterSeconds("k", 0, 2)).toBe(1);
    limiter.undo("k", 0);
    limiter.undo("k", 0);
    limiter.undo("k", 0);
    expect(limiter.count("k", 0)).toBe(0);
  });
});
