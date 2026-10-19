import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentAdmin: vi.fn(),
  getSiteSettings: vi.fn(),
  listPublicCategories: vi.fn(),
  listPublicProducts: vi.fn(),
  listFeaturedProductIds: vi.fn(),
  listHeroProducts: vi.fn(),
  listPublishedReviews: vi.fn(),
  isKnownCheckoutSession: vi.fn(),
  getStripe: vi.fn(),
}));

const db = vi.hoisted(() => ({
  siteSetting: { findUnique: vi.fn() },
}));

vi.mock("@/lib/db", () => ({
  getDb: () => db,
  isDatabaseConfigured: () => true,
}));

vi.mock("@/lib/admin-auth", () => ({ getCurrentAdmin: mocks.getCurrentAdmin }));
vi.mock("@/lib/locale", () => ({ getRequestLocale: async () => "it" }));

vi.mock("@/lib/services/site-settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/site-settings")>()),
  getSiteSettings: mocks.getSiteSettings,
}));
vi.mock("@/lib/services/categories", () => ({ listPublicCategories: mocks.listPublicCategories }));
vi.mock("@/lib/services/products", () => ({
  listPublicProducts: mocks.listPublicProducts,
  listFeaturedProductIds: mocks.listFeaturedProductIds,
  listHeroProducts: mocks.listHeroProducts,
}));
vi.mock("@/lib/services/reviews", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/reviews")>()),
  listPublishedReviews: mocks.listPublishedReviews,
}));
vi.mock("@/lib/services/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/orders")>()),
  isKnownCheckoutSession: mocks.isKnownCheckoutSession,
}));
vi.mock("@/lib/payments/stripe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payments/stripe")>()),
  isStripeConfigured: () => true,
  getStripe: mocks.getStripe,
}));

import Home from "@/app/(public)/page";
import OrderCompletedPage from "@/app/(public)/ordine/completato/page";
import { getMaintenanceView, isMaintenanceVisitor } from "@/lib/maintenance-view";
import { clearMaintenanceCache } from "@/lib/services/maintenance";

const PUBLIC_DIR = path.resolve(import.meta.dirname, "../src/app/(public)");
const ADMIN = { id: "3f0c8a52-7d1e-4b8a-9c3e-2a1b4c5d6e7f", role: "SUPERADMIN" };

function maintenance(enabled: boolean) {
  db.siteSetting.findUnique.mockResolvedValue({ maintenanceMode: enabled, maintenanceMessage: null });
}

const dataLoaders = [
  "getSiteSettings",
  "listPublicCategories",
  "listPublicProducts",
  "listFeaturedProductIds",
  "listHeroProducts",
  "listPublishedReviews",
  "isKnownCheckoutSession",
  "getStripe",
] as const;

beforeEach(() => {
  clearMaintenanceCache();
  for (const name of dataLoaders) mocks[name].mockReset();
  mocks.getCurrentAdmin.mockReset().mockResolvedValue(null);
  db.siteSetting.findUnique.mockReset().mockResolvedValue(null);
});

describe("isMaintenanceVisitor", () => {
  it("is true only with maintenance on and no admin session", async () => {
    maintenance(false);
    expect(await getMaintenanceView()).toBe("off");
    expect(await isMaintenanceVisitor()).toBe(false);
    expect(mocks.getCurrentAdmin).not.toHaveBeenCalled();

    clearMaintenanceCache();
    maintenance(true);
    expect(await getMaintenanceView()).toBe("visitor");
    expect(await isMaintenanceVisitor()).toBe(true);

    mocks.getCurrentAdmin.mockResolvedValue(ADMIN);
    expect(await getMaintenanceView()).toBe("admin");
    expect(await isMaintenanceVisitor()).toBe(false);
  });

  it("treats a failing session check as a visitor", async () => {
    maintenance(true);
    mocks.getCurrentAdmin.mockRejectedValue(new Error("headers unavailable"));
    expect(await isMaintenanceVisitor()).toBe(true);
  });
});

describe("public pages during maintenance", () => {
  it("the home page renders nothing and loads no catalog data for visitors", async () => {
    maintenance(true);
    expect(await Home()).toBeNull();
    for (const name of dataLoaders) expect(mocks[name]).not.toHaveBeenCalled();
  });

  it("the home page still loads the catalog for admins", async () => {
    maintenance(true);
    mocks.getCurrentAdmin.mockResolvedValue(ADMIN);
    mocks.getSiteSettings.mockRejectedValue(new Error("not needed"));
    mocks.listPublishedReviews.mockResolvedValue([]);
    for (const name of ["listPublicCategories", "listPublicProducts", "listFeaturedProductIds", "listHeroProducts"] as const) {
      mocks[name].mockResolvedValue([]);
    }
    expect(await Home()).not.toBeNull();
    expect(mocks.listPublicProducts).toHaveBeenCalled();
  });

  it("the order confirmation renders nothing and never reaches Stripe for visitors", async () => {
    maintenance(true);
    const page = await OrderCompletedPage({
      searchParams: Promise.resolve({ session_id: "cs_test_a1B2c3D4e5F6g7H8i9J0" }),
    });
    expect(page).toBeNull();
    expect(mocks.isKnownCheckoutSession).not.toHaveBeenCalled();
    expect(mocks.getStripe).not.toHaveBeenCalled();
  });
});

function pageFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return pageFiles(full);
    return entry === "page.tsx" ? [full] : [];
  });
}

// Pages still run under the maintenance layout (and the layout does not re-run
// on client-side navigation), so each public page must bail out first.
describe("public page maintenance guards", () => {
  const pages = pageFiles(PUBLIC_DIR);

  it("finds the public pages", () => {
    expect(pages.length).toBeGreaterThanOrEqual(7);
  });

  it.each(pages.map((file) => [path.relative(PUBLIC_DIR, file), file]))(
    "%s returns null for maintenance visitors before any other await",
    (_relative, file) => {
      const source = readFileSync(file, "utf8");
      const body = source.slice(source.indexOf("export default"));
      expect(body).toMatch(/^export default async function/);
      const firstAwait = body.indexOf("await ");
      expect(firstAwait).toBeGreaterThan(0);
      expect(body.slice(firstAwait)).toMatch(/^await isMaintenanceVisitor\(\)\) return null;/);
    },
  );
});
