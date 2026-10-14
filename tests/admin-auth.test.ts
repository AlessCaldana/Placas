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
  isAdminAuthRequired,
  isLoopbackHost,
  verifySessionToken,
} from "@/lib/admin-session";
import {
  MAX_CONCURRENT_VERIFICATIONS,
  accountBackoffMs,
  beginPasswordChangeAttempt,
  completePasswordChangeAttempt,
  createLoginGuard,
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

function requestWith(token: string | null, extraHeaders: Record<string, string> = {}) {
  return new Request("http://localhost/api/admin/products", {
    headers: {
      ...(token ? { cookie: `other=1; ${ADMIN_SESSION_COOKIE}=${token}` } : {}),
      ...extraHeaders,
    },
  });
}

/** Headers of a request made from this machine to the dev server (Next fills X-Forwarded-For). */
const LOCAL = { host: "localhost:3000", "x-forwarded-for": "::1" };

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

describe("isAdminAuthRequired", () => {
  const headers = (values: Record<string, string>) => new Headers(values);

  it("is off only with ADMIN_AUTH=off, outside production, from this machine", () => {
    process.env.ADMIN_AUTH = "off";
    expect(isAdminAuthRequired(headers(LOCAL))).toBe(false);
    expect(isAdminAuthRequired(headers({ host: "127.0.0.1:3000", "x-forwarded-for": "127.0.0.1" }))).toBe(false);
    expect(isAdminAuthRequired(headers({ host: "[::1]:3000", "x-forwarded-for": "::ffff:127.0.0.1" }))).toBe(false);
  });

  it("is required when ADMIN_AUTH is missing or anything but off", () => {
    delete process.env.ADMIN_AUTH;
    expect(isAdminAuthRequired(headers(LOCAL))).toBe(true);
    process.env.ADMIN_AUTH = "on";
    expect(isAdminAuthRequired(headers(LOCAL))).toBe(true);
    process.env.ADMIN_AUTH = "OFF";
    expect(isAdminAuthRequired(headers(LOCAL))).toBe(true);
  });

  it("is always required in production", () => {
    process.env.ADMIN_AUTH = "off";
    vi.stubEnv("NODE_ENV", "production");
    expect(isAdminAuthRequired(headers(LOCAL))).toBe(true);
  });

  it("is required for requests that do not come from this machine", () => {
    process.env.ADMIN_AUTH = "off";
    // Reached through the LAN address: Next puts the client's address in X-Forwarded-For.
    expect(isAdminAuthRequired(headers({ host: "192.168.1.10:3000", "x-forwarded-for": "192.168.1.20" }))).toBe(true);
    // Forged Host header from another machine.
    expect(isAdminAuthRequired(headers({ host: "localhost:3000", "x-forwarded-for": "192.168.1.20" }))).toBe(true);
    // Behind a proxy that forwards the real client address.
    expect(isAdminAuthRequired(headers({ host: "localhost", "x-forwarded-for": "127.0.0.1, 203.0.113.9" }))).toBe(true);
    expect(isAdminAuthRequired(headers({ host: "placa.example.com", "x-forwarded-for": "::1" }))).toBe(true);
    expect(isAdminAuthRequired(headers({}))).toBe(true);
  });

  it("parses the Host header strictly", () => {
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("LOCALHOST:3000")).toBe(true);
    expect(isLoopbackHost("[::1]:3000")).toBe(true);
    expect(isLoopbackHost("localhost.evil.example")).toBe(false);
    expect(isLoopbackHost("127.0.0.1@evil.example")).toBe(false);
    expect(isLoopbackHost("")).toBe(false);
    expect(isLoopbackHost(null)).toBe(false);
  });
});

describe("requireAdmin", () => {
  it("returns the dev identity only with ADMIN_AUTH=off from this machine", async () => {
    process.env.ADMIN_AUTH = "off";
    const result = await requireAdmin(requestWith(null, LOCAL), { role: "SUPERADMIN" });
    expect(result).toMatchObject({ id: "dev", role: "SUPERADMIN", dev: true });
    expect(await rejectWithoutAdminSession(requestWith(null, LOCAL))).toBeNull();
    const fromLan = requestWith(null, { host: "192.168.1.10:3000", "x-forwarded-for": "192.168.1.20" });
    expect((await rejectWithoutAdminSession(fromLan))?.status).toBe(401);
  });

  it("requires a session by default, in production and with ADMIN_AUTH=on", async () => {
    delete process.env.ADMIN_AUTH;
    expect((await rejectWithoutAdminSession(requestWith(null, LOCAL)))?.status).toBe(401);
    process.env.ADMIN_AUTH = "off";
    vi.stubEnv("NODE_ENV", "production");
    expect((await rejectWithoutAdminSession(requestWith(null, LOCAL)))?.status).toBe(401);
    vi.unstubAllEnvs();
    process.env.ADMIN_AUTH = "on";
    expect((await rejectWithoutAdminSession(requestWith(null, LOCAL)))?.status).toBe(401);
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
  // Every test builds its own guard, so the in-memory counters never mix.
  const WINDOW = 15 * 60 * 1000;

  /** Begins an attempt and immediately judges it as wrong credentials. */
  function failOnce(guard: ReturnType<typeof createLoginGuard>, ip: string | null, account: string, now: number) {
    const retryAfter = guard.begin(ip, account, now);
    if (retryAfter === 0) guard.fail();
    return retryAfter;
  }

  it("blocks a trustworthy IP after five failures and unblocks when the window ends", () => {
    const guard = createLoginGuard();
    const ip = "203.0.113.7";
    const start = 1_000_000;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(failOnce(guard, ip, `user${attempt}@example.com`, start)).toBe(0);
    }
    expect(guard.begin(ip, "other@example.com", start)).toBe(15 * 60);
    expect(guard.retryAfterSeconds(ip, "other@example.com", start + WINDOW)).toBe(0);
  });

  it("spoofed IPs (untrusted, null) cannot bypass the per-account backoff", () => {
    const guard = createLoginGuard();
    const owner = "owner@example.com";
    const start = 2_000_000;
    // Without a trusted proxy the IP is null whatever X-Forwarded-For says.
    for (let attempt = 0; attempt < 5; attempt += 1) expect(failOnce(guard, null, owner, start)).toBe(0);
    // Sixth attempt: has to wait 15 s after the last failure...
    expect(guard.begin(null, owner, start)).toBe(15);
    expect(failOnce(guard, null, owner, start + 15_000)).toBe(0);
    // ...then 30 s, 60 s, ... (progressive, capped).
    expect(guard.begin(null, owner, start + 15_000)).toBe(30);
    // Other accounts are not affected.
    expect(guard.begin(null, "someone-else@example.com", start)).toBe(0);
  });

  it("the backoff grows but is capped, and is never a permanent lockout", () => {
    expect(accountBackoffMs(4)).toBe(0);
    expect(accountBackoffMs(5)).toBe(15_000);
    expect(accountBackoffMs(6)).toBe(30_000);
    expect(accountBackoffMs(9)).toBe(240_000);
    expect(accountBackoffMs(11)).toBe(15 * 60 * 1000);
    expect(accountBackoffMs(10_000)).toBe(15 * 60 * 1000);

    const guard = createLoginGuard();
    const owner = "owner-cap@example.com";
    let now = 3_000_000;
    // An attacker grabbing every slot for a long time.
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const wait = guard.retryAfterSeconds(null, owner, now);
      now += wait * 1000;
      expect(failOnce(guard, null, owner, now)).toBe(0);
    }
    expect(guard.retryAfterSeconds(null, owner, now)).toBe(15 * 60);
    // The owner can always try again at the next slot...
    expect(guard.begin(null, owner, now + 15 * 60 * 1000)).toBe(0);
    guard.complete(null, owner, now + 15 * 60 * 1000);
    // ...and after an hour without failures the account starts fresh.
    expect(guard.retryAfterSeconds(null, owner, now + 15 * 60 * 1000 + 60 * 60 * 1000)).toBe(0);
  });

  it("an attack on one account from many IPs does not keep the owner out of a clean, trusted IP", () => {
    const guard = createLoginGuard();
    const start = 4_000_000;
    const target = "owner-under-attack@example.com";
    for (let attempt = 0; attempt < 10; attempt += 1) failOnce(guard, `198.51.100.${attempt}`, target, start);
    // An attacking IP that already failed has to wait for the account backoff...
    expect(guard.retryAfterSeconds("198.51.100.0", target, start)).toBeGreaterThan(0);
    // ...while the owner, from an address without failures, may still try once.
    expect(failOnce(guard, "192.0.2.50", target, start)).toBe(0);
    expect(guard.begin("192.0.2.50", target, start)).toBeGreaterThan(0);
  });

  it("reserves attempts synchronously, so parallel requests cannot all pass", () => {
    const guard = createLoginGuard();
    const start = 5_000_000;
    // Ten concurrent requests reach the check before any password is verified;
    // the verification slots and the account backoff both stop the rest.
    const results = Array.from({ length: 10 }, () => guard.begin(null, "owner@example.com", start));
    expect(results.filter((retryAfter) => retryAfter === 0)).toHaveLength(MAX_CONCURRENT_VERIFICATIONS);
    expect(guard.activeVerifications()).toBe(MAX_CONCURRENT_VERIFICATIONS);
  });

  it("caps concurrent password verifications globally and frees the slots", () => {
    const guard = createLoginGuard();
    const start = 6_000_000;
    for (let index = 0; index < MAX_CONCURRENT_VERIFICATIONS; index += 1) {
      expect(guard.begin(null, `spray${index}@example.com`, start)).toBe(0);
    }
    // Any account, any IP: no slot left.
    expect(guard.begin(null, "owner@example.com", start)).toBe(1);
    expect(guard.precheck("192.0.2.1", start)).toBe(1);
    guard.fail();
    expect(guard.begin(null, "owner@example.com", start)).toBe(0);
    guard.complete(null, "owner@example.com", start);
    guard.release(null, "spray1@example.com", start);
    guard.fail();
    guard.fail();
    expect(guard.activeVerifications()).toBe(0);
  });

  it("a successful login clears the IP and releases its reservation", () => {
    const guard = createLoginGuard();
    const ip = "203.0.113.9";
    const start = 7_000_000;
    for (let attempt = 0; attempt < 4; attempt += 1) failOnce(guard, ip, "a@example.com", start);
    expect(guard.begin(ip, "a@example.com", start)).toBe(0);
    guard.complete(ip, "a@example.com", start);
    expect(guard.retryAfterSeconds(ip, "a@example.com", start)).toBe(0);
  });

  it("a server error releases the reservation", () => {
    const guard = createLoginGuard();
    const ip = "203.0.113.10";
    const start = 8_000_000;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(guard.begin(ip, "b@example.com", start)).toBe(0);
      guard.release(ip, "b@example.com", start);
    }
    expect(guard.retryAfterSeconds(ip, "b@example.com", start)).toBe(0);
    expect(guard.activeVerifications()).toBe(0);
  });

  it("many failures overall leave one attempt per trusted IP, and do not touch untrusted clients", () => {
    const guard = createLoginGuard();
    const start = 9_000_000;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      failOnce(guard, `198.51.101.${attempt}`, `spray${attempt}@example.com`, start);
    }
    expect(failOnce(guard, "192.0.2.1", "owner@example.com", start + 60_000)).toBe(0);
    expect(guard.begin("192.0.2.1", "owner@example.com", start + 60_000)).toBe(15 * 60);
    expect(guard.retryAfterSeconds("192.0.2.1", "owner@example.com", start + WINDOW + 60_000)).toBe(0);
    // Without trusted IPs the "under attack" mode has no effect: the owner keeps
    // the normal per-account allowance.
    expect(guard.begin(null, "owner2@example.com", start + 60_000)).toBe(0);
    guard.complete(null, "owner2@example.com", start + 60_000);
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
