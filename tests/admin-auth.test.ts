import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAdminSession,
  isAdminLoginValid,
  isValidAdminSession,
  rejectWithoutAdminSession,
  ADMIN_SESSION_COOKIE,
} from "@/lib/admin-auth";
import {
  clearFailedLogins,
  loginRetryAfterSeconds,
  registerFailedLogin,
} from "@/lib/login-rate-limit";

const env = { ...process.env };

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-with-at-least-32-bytes!!";
  process.env.ADMIN_EMAIL = "Owner@Example.com";
  process.env.ADMIN_PASSWORD = "a-long-test-password";
});

afterEach(() => {
  process.env = { ...env };
});

describe("isAdminLoginValid", () => {
  it("accepts the configured email (any case) with the right password", () => {
    expect(isAdminLoginValid(" owner@example.com ", "a-long-test-password")).toBe(true);
  });

  it("rejects a wrong email or password", () => {
    expect(isAdminLoginValid("other@example.com", "a-long-test-password")).toBe(false);
    expect(isAdminLoginValid("owner@example.com", "wrong")).toBe(false);
  });

  it("allows a short password only outside production", () => {
    process.env.ADMIN_PASSWORD = "admin";
    expect(isAdminLoginValid("owner@example.com", "admin")).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(isAdminLoginValid("owner@example.com", "admin")).toBe(false);
    vi.unstubAllEnvs();
  });

  it("rejects everything when the login is not fully configured", () => {
    delete process.env.ADMIN_EMAIL;
    process.env.ADMIN_PASSWORD = "a-long-test-password";
    expect(isAdminLoginValid("", "a-long-test-password")).toBe(false);
  });
});

describe("admin session", () => {
  it("accepts a signed session and rejects a tampered one", () => {
    const session = createAdminSession()!;
    expect(isValidAdminSession(session)).toBe(true);
    expect(isValidAdminSession(`${session.slice(0, -2)}xx`)).toBe(false);
  });

  it("does not require a session in development unless ADMIN_AUTH=on", () => {
    const anonymous = new Request("http://localhost/api/admin/products");
    delete process.env.ADMIN_AUTH;
    expect(rejectWithoutAdminSession(anonymous)).toBeNull();
    vi.stubEnv("NODE_ENV", "production");
    expect(rejectWithoutAdminSession(anonymous)?.status).toBe(401);
    vi.unstubAllEnvs();
  });

  it("returns 401 for requests without a valid session cookie", () => {
    process.env.ADMIN_AUTH = "on";
    const anonymous = new Request("http://localhost/api/admin/products");
    expect(rejectWithoutAdminSession(anonymous)?.status).toBe(401);
    const signedIn = new Request("http://localhost/api/admin/products", {
      headers: { cookie: `${ADMIN_SESSION_COOKIE}=${createAdminSession()}` },
    });
    expect(rejectWithoutAdminSession(signedIn)).toBeNull();
  });
});

describe("login rate limit", () => {
  it("blocks after five failures and unblocks when the window ends", () => {
    const key = "203.0.113.7";
    const start = 1_000_000;
    for (let attempt = 0; attempt < 4; attempt += 1) registerFailedLogin(key, start);
    expect(loginRetryAfterSeconds(key, start)).toBe(0);
    registerFailedLogin(key, start);
    expect(loginRetryAfterSeconds(key, start)).toBe(15 * 60);
    expect(loginRetryAfterSeconds(key, start + 15 * 60 * 1000)).toBe(0);
    clearFailedLogins(key);
  });
});
