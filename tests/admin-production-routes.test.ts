import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findSessionUser: vi.fn(),
  listAdminProducts: vi.fn(),
  listAdminReviews: vi.fn(),
  getSiteSettings: vi.fn(),
}));

vi.mock("@/lib/services/admin-users", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/admin-users")>()),
  findSessionUser: mocks.findSessionUser,
}));
vi.mock("@/lib/services/products", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/products")>()),
  listAdminProducts: mocks.listAdminProducts,
}));
vi.mock("@/lib/services/reviews", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/reviews")>()),
  listAdminReviews: mocks.listAdminReviews,
}));
vi.mock("@/lib/services/site-settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/site-settings")>()),
  getSiteSettings: mocks.getSiteSettings,
}));

import { GET as getProducts } from "@/app/api/admin/products/route";
import { GET as getReviews } from "@/app/api/admin/reviews/route";
import { GET as getSettings } from "@/app/api/admin/settings/route";
import { ADMIN_SESSION_COOKIE, createSessionToken } from "@/lib/admin-session";

const USER_ID = "3f0c8a52-7d1e-4b8a-9c3e-2a1b4c5d6e7f";

function request(path: string, token: string | null) {
  return new Request(`http://localhost:3000${path}`, {
    headers: token ? { cookie: `${ADMIN_SESSION_COOKIE}=${token}` } : {},
  });
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("ADMIN_AUTH", "");
  vi.stubEnv("ADMIN_PREVIEW", "");
  vi.stubEnv("AUTH_SECRET", "test-secret-with-at-least-32-bytes!!");
  vi.stubEnv("DATABASE_URL", "mysql://unused:unused@localhost:3306/unused");
  mocks.findSessionUser.mockReset().mockResolvedValue({
    id: USER_ID,
    email: "maria@example.com",
    name: "Maria",
    role: "ADMIN",
    active: true,
    sessionVersion: 3,
  });
  mocks.listAdminProducts.mockReset().mockResolvedValue([]);
  mocks.listAdminReviews.mockReset().mockResolvedValue([]);
  mocks.getSiteSettings.mockReset().mockResolvedValue({ name: "PFdeco" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("admin API in production", () => {
  const routes = [
    ["/api/admin/products", getProducts],
    ["/api/admin/reviews", getReviews],
    ["/api/admin/settings", getSettings],
  ] as const;

  it("works for a signed-in admin without any preview flag", async () => {
    const token = createSessionToken(USER_ID, 3);
    for (const [path, handler] of routes) {
      expect((await handler(request(path, token))).status, path).toBe(200);
    }
  });

  it("still refuses requests without a session", async () => {
    for (const [path, handler] of routes) {
      expect((await handler(request(path, null))).status, path).toBe(401);
    }
  });

  it("no admin route is gated by ADMIN_PREVIEW any more", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (name === "route.ts") files.push(path);
      }
    };
    walk(join(process.cwd(), "src/app/api/admin"));
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) expect(readFileSync(file, "utf8"), file).not.toContain("ADMIN_PREVIEW");
  });
});
