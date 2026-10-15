import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  countAdminUsers: vi.fn(),
  findLoginUser: vi.fn(),
  recordAdminLogin: vi.fn(),
  revokeAdminSessions: vi.fn(),
  verifyPassword: vi.fn(),
  verifyAgainstDummyHash: vi.fn(),
}));

vi.mock("@/lib/services/admin-users", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/admin-users")>()),
  countAdminUsers: mocks.countAdminUsers,
  findLoginUser: mocks.findLoginUser,
  recordAdminLogin: mocks.recordAdminLogin,
  revokeAdminSessions: mocks.revokeAdminSessions,
}));

vi.mock("@/lib/password", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/password")>()),
  verifyPassword: mocks.verifyPassword,
  verifyAgainstDummyHash: mocks.verifyAgainstDummyHash,
}));

import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import {
  ADMIN_DEVICE_COOKIE,
  ADMIN_SESSION_COOKIE,
  ENV_ADMIN_ID,
  createDeviceToken,
  createSessionToken,
  verifyDeviceToken,
} from "@/lib/admin-session";
import { MAX_CONCURRENT_VERIFICATIONS, MAX_UNTRUSTED_VERIFICATIONS } from "@/lib/login-rate-limit";

const env = { ...process.env };
const USER_ID = "3f0c8a52-7d1e-4b8a-9c3e-2a1b4c5d6e7f";

function loginRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-with-at-least-32-bytes!!";
  process.env.DATABASE_URL = "mysql://unused:unused@localhost:3306/unused";
  delete process.env.TRUSTED_PROXY_HOPS;
  mocks.countAdminUsers.mockReset().mockResolvedValue(1);
  mocks.findLoginUser.mockReset().mockResolvedValue(null);
  mocks.recordAdminLogin.mockReset().mockResolvedValue(undefined);
  mocks.revokeAdminSessions.mockReset().mockResolvedValue(true);
  mocks.verifyPassword.mockReset().mockResolvedValue(false);
  mocks.verifyAgainstDummyHash.mockReset().mockResolvedValue(false);
});

afterEach(() => {
  process.env = { ...env };
  vi.unstubAllEnvs();
});

describe("POST /api/auth/login", () => {
  it("refuses bodies over 4 KB with 413 and without counting an attempt", async () => {
    const email = "big-body@example.com";
    const response = await login(loginRequest({ email, password: "x".repeat(5000) }));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "request_too_large" });
    expect(mocks.verifyAgainstDummyHash).not.toHaveBeenCalled();
    // The account has its five free attempts intact.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await login(loginRequest({ email, password: "wrong" }))).status).toBe(401);
    }
  });

  it("a spoofed X-Forwarded-For does not reset the limit (per-account backoff)", async () => {
    const email = "owner-spoof@example.com";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await login(
        loginRequest({ email, password: "wrong" }, { "x-forwarded-for": `198.51.100.${attempt}` }),
      );
      expect(response.status).toBe(401);
    }
    const blocked = await login(
      loginRequest({ email: " Owner-Spoof@Example.com ", password: "wrong" }, { "x-forwarded-for": "203.0.113.99" }),
    );
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: "too_many_attempts" });
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("with a trusted proxy, limits each client IP across accounts", async () => {
    process.env.TRUSTED_PROXY_HOPS = "1";
    const headers = { "x-forwarded-for": "203.0.113.50" };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await login(loginRequest({ email: `ip${attempt}@example.com`, password: "x" }, headers))).status).toBe(401);
    }
    expect((await login(loginRequest({ email: "ip-next@example.com", password: "x" }, headers))).status).toBe(429);
    // Another client is not affected.
    const other = { "x-forwarded-for": "203.0.113.51" };
    expect((await login(loginRequest({ email: "ip-next@example.com", password: "x" }, other))).status).toBe(401);
  });

  it("caps concurrent password verifications and answers 429 to the excess", async () => {
    // Browsers without a device cookie may only use MAX_UNTRUSTED_VERIFICATIONS
    // of the MAX_CONCURRENT_VERIFICATIONS slots; the last one is reserved.
    const pending: Array<(value: false) => void> = [];
    mocks.verifyAgainstDummyHash.mockImplementation(
      () => new Promise<false>((resolve) => pending.push(resolve)),
    );
    const running = Array.from({ length: MAX_UNTRUSTED_VERIFICATIONS }, (_, index) =>
      login(loginRequest({ email: `slow${index}@example.com`, password: "x" })),
    );
    await vi.waitFor(() => expect(pending).toHaveLength(MAX_UNTRUSTED_VERIFICATIONS));
    const excess = await login(loginRequest({ email: "excess@example.com", password: "x" }));
    expect(excess.status).toBe(429);
    // A browser with the device cookie of its account takes the reserved slot.
    const trustedEmail = "trusted-slot@example.com";
    const trusted = login(
      loginRequest(
        { email: trustedEmail, password: "x" },
        { cookie: `${ADMIN_DEVICE_COOKIE}=${createDeviceToken(trustedEmail)}` },
      ),
    );
    await vi.waitFor(() => expect(pending).toHaveLength(MAX_CONCURRENT_VERIFICATIONS));
    // Every slot is busy now: even the pre-check refuses.
    expect((await login(loginRequest({ email: "excess2@example.com", password: "x" }))).status).toBe(429);
    pending.forEach((resolve) => resolve(false));
    for (const response of await Promise.all([...running, trusted])) expect(response.status).toBe(401);
    // Slots are given back: a new attempt is judged normally.
    mocks.verifyAgainstDummyHash.mockResolvedValue(false);
    expect((await login(loginRequest({ email: "after@example.com", password: "x" }))).status).toBe(401);
  });

  it("frees the slot when the database fails", async () => {
    mocks.findLoginUser.mockRejectedValue(new Error("connection refused"));
    for (let attempt = 0; attempt < MAX_CONCURRENT_VERIFICATIONS + 2; attempt += 1) {
      expect((await login(loginRequest({ email: "db-down@example.com", password: "x" }))).status).toBe(503);
    }
  });

  it("signs in with the right password", async () => {
    mocks.findLoginUser.mockResolvedValue({
      id: USER_ID,
      email: "maria@example.com",
      name: "Maria",
      role: "ADMIN",
      active: true,
      sessionVersion: 2,
      passwordHash: "scrypt$...",
    });
    mocks.verifyPassword.mockResolvedValue(true);
    const response = await login(loginRequest({ email: "maria@example.com", password: "right" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(`${ADMIN_SESSION_COOKIE}=`);
    // The browser is recognised for this account from now on.
    const device = response.cookies.get(ADMIN_DEVICE_COOKIE);
    expect(device).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/api/auth", maxAge: 90 * 24 * 60 * 60 });
    expect(verifyDeviceToken(device?.value, "maria@example.com")).toBe(true);
    expect(verifyDeviceToken(device?.value, "other@example.com")).toBe(false);
  });

  it("does not issue the device cookie on failed logins", async () => {
    const response = await login(loginRequest({ email: "no-device@example.com", password: "wrong" }));
    expect(response.status).toBe(401);
    expect(response.cookies.get(ADMIN_DEVICE_COOKIE)).toBeUndefined();
  });

  it("an attacker cannot keep the owner's recognised browser out", async () => {
    const email = "owner-trusted@example.com";
    // Attacker without the cookie (untrusted IP): the account goes into backoff.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await login(loginRequest({ email, password: "guess" }))).status).toBe(401);
    }
    expect((await login(loginRequest({ email, password: "guess" }))).status).toBe(429);
    // A device cookie for another account, forged or expired does not help.
    const otherAccount = createDeviceToken("someone-else@example.com");
    const expired = createDeviceToken(email, Date.now() - 91 * 24 * 60 * 60 * 1000);
    for (const value of [otherAccount, expired, "v1.9999999999.forgedforgedforgedforgedforgedforgedforgedX"]) {
      const response = await login(loginRequest({ email, password: "guess" }, { cookie: `${ADMIN_DEVICE_COOKIE}=${value}` }));
      expect(response.status).toBe(429);
    }
    // The owner's browser signs in.
    mocks.findLoginUser.mockResolvedValue({
      id: USER_ID,
      email,
      name: "Owner",
      role: "ADMIN",
      active: true,
      sessionVersion: 1,
      passwordHash: "scrypt$...",
    });
    mocks.verifyPassword.mockResolvedValue(true);
    const owner = await login(
      loginRequest({ email, password: "right" }, { cookie: `${ADMIN_DEVICE_COOKIE}=${createDeviceToken(email)}` }),
    );
    expect(owner.status).toBe(200);
    expect(owner.cookies.get(ADMIN_SESSION_COOKIE)?.value).toBeTruthy();
    expect(verifyDeviceToken(owner.cookies.get(ADMIN_DEVICE_COOKIE)?.value, email)).toBe(true);
  });

  it("whoever has the device cookie still gets a backoff", async () => {
    const email = "stolen-cookie@example.com";
    const cookie = { cookie: `${ADMIN_DEVICE_COOKIE}=${createDeviceToken(email)}` };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await login(loginRequest({ email, password: "guess" }, cookie))).status).toBe(401);
    }
    expect((await login(loginRequest({ email, password: "guess" }, cookie))).status).toBe(429);
  });
});

describe("POST /api/auth/logout", () => {
  function logoutRequest(token: string | null) {
    return new Request("http://localhost:3000/api/auth/logout", {
      method: "POST",
      headers: token ? { cookie: `${ADMIN_SESSION_COOKIE}=${token}` } : {},
    });
  }

  it("revokes the account's sessions server-side and clears the cookie", async () => {
    const response = await logout(logoutRequest(createSessionToken(USER_ID, 7)));
    expect(response.status).toBe(200);
    expect(mocks.revokeAdminSessions).toHaveBeenCalledWith(USER_ID, 7);
    expect(response.headers.get("set-cookie")).toMatch(new RegExp(`${ADMIN_SESSION_COOKIE}=;`));
  });

  it("keeps the device cookie (it is not a session)", async () => {
    const request = new Request("http://localhost:3000/api/auth/logout", {
      method: "POST",
      headers: {
        cookie: `${ADMIN_SESSION_COOKIE}=${createSessionToken(USER_ID, 7)}; ${ADMIN_DEVICE_COOKIE}=${createDeviceToken("maria@example.com")}`,
      },
    });
    const response = await logout(request);
    expect(response.status).toBe(200);
    expect(response.cookies.get(ADMIN_DEVICE_COOKIE)).toBeUndefined();
    expect(response.headers.get("set-cookie")).not.toContain(ADMIN_DEVICE_COOKIE);
  });

  it("ignores the bootstrap identity, missing or forged cookies", async () => {
    await logout(logoutRequest(createSessionToken(ENV_ADMIN_ID, 0)));
    await logout(logoutRequest(null));
    await logout(logoutRequest(`${USER_ID}.7.9999999999999.aaaaaaaaaaaaaaaaaaaaaa.forged`));
    expect(mocks.revokeAdminSessions).not.toHaveBeenCalled();
  });

  it("still clears the cookie when the database fails", async () => {
    mocks.revokeAdminSessions.mockRejectedValue(new Error("connection refused"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await logout(logoutRequest(createSessionToken(USER_ID, 7)));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(new RegExp(`${ADMIN_SESSION_COOKIE}=;`));
    error.mockRestore();
  });
});
