import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findSessionUser: vi.fn(),
  countAdminUsers: vi.fn(),
  createReview: vi.fn(),
  lookupOrderTracking: vi.fn(),
}));

const db = vi.hoisted(() => ({
  siteSetting: { findUnique: vi.fn(), upsert: vi.fn() },
}));

vi.mock("@/lib/db", () => ({
  getDb: () => db,
  isDatabaseConfigured: () => Boolean(process.env.DATABASE_URL),
}));

vi.mock("@/lib/services/admin-users", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/admin-users")>()),
  findSessionUser: mocks.findSessionUser,
  countAdminUsers: mocks.countAdminUsers,
}));

vi.mock("@/lib/services/reviews", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/reviews")>()),
  createReview: mocks.createReview,
}));

vi.mock("@/lib/services/shipments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/shipments")>()),
  lookupOrderTracking: mocks.lookupOrderTracking,
}));

import { GET as getMaintenance, PUT as putMaintenance } from "@/app/api/admin/maintenance/route";
import { POST as trackOrder } from "@/app/api/orders/track/route";
import { POST as submitReview } from "@/app/api/reviews/route";
import { ADMIN_SESSION_COOKIE, createSessionToken } from "@/lib/admin-session";
import {
  MAINTENANCE_CACHE_TTL_MS,
  clearMaintenanceCache,
  isMaintenanceActive,
  parseMaintenanceInput,
  readMaintenanceState,
  setMaintenanceState,
} from "@/lib/services/maintenance";

const env = { ...process.env };
const USER_ID = "3f0c8a52-7d1e-4b8a-9c3e-2a1b4c5d6e7f";

function sessionUser(role: "ADMIN" | "SUPERADMIN") {
  return { id: USER_ID, email: "maria@example.com", name: "Maria", role, active: true, sessionVersion: 3 };
}

function adminRequest(method: "GET" | "PUT", body?: unknown, headers: Record<string, string> = {}) {
  const token = createSessionToken(USER_ID, 3)!;
  return new Request("http://localhost:3000/api/admin/maintenance", {
    method,
    headers: { "content-type": "application/json", cookie: `${ADMIN_SESSION_COOKIE}=${token}`, ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

function savedRow(enabled: boolean, message: string | null) {
  return { maintenanceMode: enabled, maintenanceMessage: message };
}

beforeEach(() => {
  clearMaintenanceCache();
  process.env.AUTH_SECRET = "test-secret-with-at-least-32-bytes!!";
  process.env.ADMIN_AUTH = "on";
  // Never reaches a real database: @/lib/db is mocked.
  process.env.DATABASE_URL = "mysql://unused:unused@localhost:3306/unused";
  mocks.findSessionUser.mockReset().mockResolvedValue(sessionUser("SUPERADMIN"));
  mocks.countAdminUsers.mockReset().mockResolvedValue(1);
  mocks.createReview.mockReset().mockResolvedValue("created");
  mocks.lookupOrderTracking.mockReset().mockResolvedValue(null);
  db.siteSetting.findUnique.mockReset().mockResolvedValue(null);
  db.siteSetting.upsert
    .mockReset()
    .mockImplementation(async ({ update }: { update: { maintenanceMode: boolean; maintenanceMessage: string | null } }) =>
      savedRow(update.maintenanceMode, update.maintenanceMessage),
    );
});

afterEach(() => {
  process.env = { ...env };
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("parseMaintenanceInput", () => {
  it("accepts enabled with or without a message and normalises the text", () => {
    expect(parseMaintenanceInput({ enabled: true })).toEqual({ enabled: true, message: "" });
    expect(parseMaintenanceInput({ enabled: false, message: "   " })).toEqual({ enabled: false, message: "" });
    expect(parseMaintenanceInput({ enabled: true, message: "  Torniamo\n presto  domani\t! " })).toEqual({
      enabled: true,
      message: "Torniamo presto domani !",
    });
    expect(parseMaintenanceInput({ enabled: true, message: "Caffè", other: 1 })).toEqual({
      enabled: true,
      message: "Caffè",
    });
  });

  it("accepts up to 300 characters and rejects longer messages", () => {
    expect(parseMaintenanceInput({ enabled: true, message: "a".repeat(300) })?.message).toHaveLength(300);
    expect(parseMaintenanceInput({ enabled: true, message: `  ${"a".repeat(300)}  ` })?.message).toHaveLength(300);
    expect(parseMaintenanceInput({ enabled: true, message: "a".repeat(301) })).toBeNull();
    expect(parseMaintenanceInput({ enabled: true, message: "a".repeat(5000) })).toBeNull();
  });

  it("rejects control and invisible format characters", () => {
    for (const message of ["Chiuso\u0000", "Chiuso\u0007oggi", "Chiuso\u007f", "Chiuso\u0085", "\u202eosuihC", "Chi\u200buso"]) {
      expect(parseMaintenanceInput({ enabled: true, message })).toBeNull();
    }
  });

  it("rejects lone surrogates, private-use and unassigned code points but keeps emojis", () => {
    for (const message of ["Chiuso \ud83d", "\ude00 Chiuso", "Chi\udc00uso\ud800", "Chiuso ", "Chiuso \u{F0000}", "Chiuso ͸"]) {
      expect(parseMaintenanceInput({ enabled: true, message })).toBeNull();
    }
    expect(parseMaintenanceInput({ enabled: true, message: "Torniamo presto 😀" })?.message).toBe(
      "Torniamo presto \u{1F600}",
    );
  });

  it("rejects wrong types", () => {
    for (const body of [null, undefined, "on", 1, [], [true], {}, { enabled: "true" }, { enabled: 1 }, { enabled: null }]) {
      expect(parseMaintenanceInput(body)).toBeNull();
    }
    for (const message of [null, 42, true, ["x"], { text: "x" }]) {
      expect(parseMaintenanceInput({ enabled: true, message })).toBeNull();
    }
  });
});

describe("maintenance service", () => {
  it("is off without a database, without a settings row or when the database fails", async () => {
    delete process.env.DATABASE_URL;
    expect(await readMaintenanceState()).toEqual({ enabled: false, message: "" });
    expect(db.siteSetting.findUnique).not.toHaveBeenCalled();

    process.env.DATABASE_URL = "mysql://unused:unused@localhost:3306/unused";
    expect(await readMaintenanceState()).toEqual({ enabled: false, message: "" });

    clearMaintenanceCache();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    db.siteSetting.findUnique.mockRejectedValue(new Error("connection refused"));
    expect(await readMaintenanceState()).toEqual({ enabled: false, message: "" });
    expect(error).toHaveBeenCalled();
  });

  it("logs only the error name and code, at most once a minute", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: 1_900_000_000_000 });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = Object.assign(new Error("SELECT ... password=secret"), { name: "DriverAdapterError", code: "P1001" });
    db.siteSetting.findUnique.mockRejectedValue(failure);
    expect(await isMaintenanceActive()).toBe(false);
    expect(await isMaintenanceActive()).toBe(false);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith("maintenance_state_unavailable", { name: "DriverAdapterError", code: "P1001" });
    expect(JSON.stringify(error.mock.calls)).not.toContain("secret");
    // Failures are not cached: every request tries the database again.
    expect(db.siteSetting.findUnique).toHaveBeenCalledTimes(2);

    vi.setSystemTime(Date.now() + 60_000);
    await isMaintenanceActive();
    expect(error).toHaveBeenCalledTimes(2);
  });

  it("reuses a read for 5 seconds and reads again after that", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: 1_900_000_000_000 });
    db.siteSetting.findUnique.mockResolvedValue(savedRow(true, "A"));
    expect(await readMaintenanceState()).toEqual({ enabled: true, message: "A" });
    db.siteSetting.findUnique.mockResolvedValue(savedRow(false, null));
    vi.setSystemTime(Date.now() + MAINTENANCE_CACHE_TTL_MS - 1);
    expect(await isMaintenanceActive()).toBe(true);
    expect(db.siteSetting.findUnique).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 1);
    expect(await isMaintenanceActive()).toBe(false);
    expect(db.siteSetting.findUnique).toHaveBeenCalledTimes(2);
  });

  it("shares one database read between concurrent requests", async () => {
    db.siteSetting.findUnique.mockResolvedValue(savedRow(true, null));
    const states = await Promise.all([readMaintenanceState(), readMaintenanceState(), isMaintenanceActive()]);
    expect(states).toEqual([{ enabled: true, message: "" }, { enabled: true, message: "" }, true]);
    expect(db.siteSetting.findUnique).toHaveBeenCalledTimes(1);
  });

  it("updates the cache on save, so the change is seen at once", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: 1_900_000_000_000 });
    db.siteSetting.findUnique.mockResolvedValue(savedRow(false, null));
    expect(await isMaintenanceActive()).toBe(false);
    await setMaintenanceState({ enabled: true, message: "Inventario" });
    expect(await readMaintenanceState()).toEqual({ enabled: true, message: "Inventario" });
    expect(db.siteSetting.findUnique).toHaveBeenCalledTimes(1);
  });

  it("does not let a read that started before a save overwrite it", async () => {
    let finishRead: (row: unknown) => void = () => undefined;
    db.siteSetting.findUnique.mockReturnValue(new Promise((resolve) => (finishRead = resolve)));
    const staleRead = readMaintenanceState();
    await setMaintenanceState({ enabled: true, message: "" });
    finishRead(savedRow(false, null));
    expect(await staleRead).toEqual({ enabled: false, message: "" });
    expect(await isMaintenanceActive()).toBe(true);
  });

  it("reads the stored switch and message", async () => {
    db.siteSetting.findUnique.mockResolvedValue(savedRow(true, "Inventario"));
    expect(await readMaintenanceState()).toEqual({ enabled: true, message: "Inventario" });
    expect(db.siteSetting.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "default" } }));
  });

  it("upserts the default row, creating it with the shop name", async () => {
    expect(await setMaintenanceState({ enabled: true, message: "" })).toEqual({ enabled: true, message: "" });
    const call = db.siteSetting.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ id: "default" });
    expect(call.create).toEqual({ id: "default", name: "PFdeco", maintenanceMode: true, maintenanceMessage: null });
    expect(call.update).toEqual({ maintenanceMode: true, maintenanceMessage: null });
  });
});

describe("GET /api/admin/maintenance", () => {
  it("needs a session", async () => {
    const response = await getMaintenance(new Request("http://localhost:3000/api/admin/maintenance"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("is available to any admin, also in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.findSessionUser.mockResolvedValue(sessionUser("ADMIN"));
    db.siteSetting.findUnique.mockResolvedValue(savedRow(true, "Torniamo presto"));
    const response = await getMaintenance(adminRequest("GET"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: true, message: "Torniamo presto" });
    vi.unstubAllEnvs();
  });
});

describe("PUT /api/admin/maintenance", () => {
  it("needs a session", async () => {
    const request = new Request("http://localhost:3000/api/admin/maintenance", {
      method: "PUT",
      body: JSON.stringify({ enabled: true }),
    });
    expect((await putMaintenance(request)).status).toBe(401);
    expect(db.siteSetting.upsert).not.toHaveBeenCalled();
  });

  it("is forbidden to ADMIN accounts", async () => {
    mocks.findSessionUser.mockResolvedValue(sessionUser("ADMIN"));
    const response = await putMaintenance(adminRequest("PUT", { enabled: true }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden" });
    expect(db.siteSetting.upsert).not.toHaveBeenCalled();
  });

  it("lets a SUPERADMIN switch it on and off, also in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const on = await putMaintenance(adminRequest("PUT", { enabled: true, message: "  Inventario  " }));
    expect(on.status).toBe(200);
    expect(await on.json()).toEqual({ enabled: true, message: "Inventario" });
    expect(info).toHaveBeenCalledWith("maintenance_mode_changed", { enabled: true, by: USER_ID });

    const off = await putMaintenance(adminRequest("PUT", { enabled: false }));
    expect(await off.json()).toEqual({ enabled: false, message: "" });
    expect(db.siteSetting.upsert).toHaveBeenCalledTimes(2);
    vi.unstubAllEnvs();
  });

  it("refuses cross-site requests before checking the session", async () => {
    const response = await putMaintenance(adminRequest("PUT", { enabled: true }, { origin: "https://evil.example" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "invalid_request" });
    expect(mocks.findSessionUser).not.toHaveBeenCalled();
    expect(db.siteSetting.upsert).not.toHaveBeenCalled();
  });

  it("answers 400 invalid_maintenance for invalid bodies", async () => {
    for (const body of ["not json", { enabled: "yes" }, { enabled: true, message: "x".repeat(301) }, { enabled: true, message: "a\u0000" }]) {
      const response = await putMaintenance(adminRequest("PUT", body));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_maintenance" });
    }
    expect(db.siteSetting.upsert).not.toHaveBeenCalled();
  });

  it("answers 413 for bodies over 4 KB", async () => {
    const response = await putMaintenance(adminRequest("PUT", { enabled: true, padding: "x".repeat(5000) }));
    expect(response.status).toBe(413);
    expect(db.siteSetting.upsert).not.toHaveBeenCalled();
  });

  it("answers 503 without a database and 500 when saving fails", async () => {
    // With ADMIN_AUTH=off and a local request the dev identity is used, so no database is needed to authorise.
    process.env.ADMIN_AUTH = "off";
    delete process.env.DATABASE_URL;
    const local = { host: "localhost:3000", "x-forwarded-for": "::1" };
    expect((await putMaintenance(adminRequest("PUT", { enabled: true }, local))).status).toBe(503);

    process.env.DATABASE_URL = "mysql://unused:unused@localhost:3306/unused";
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    db.siteSetting.upsert.mockRejectedValue(new Error("connection refused"));
    const failed = await putMaintenance(adminRequest("PUT", { enabled: true }, local));
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: "maintenance_save_failed" });
  });
});

describe("public APIs during maintenance", () => {
  const review = {
    sessionId: "cs_test_a1B2c3D4e5F6g7H8i9J0",
    firstName: "Maria",
    lastName: "Rossi",
    rating: 5,
    comment: "Bellissima placa, consigliata.",
  };
  const post = (path: string, body: unknown) =>
    new Request(`http://localhost:3000${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("blocks reviews and order tracking with 503 maintenance", async () => {
    db.siteSetting.findUnique.mockResolvedValue(savedRow(true, null));
    for (const response of [
      await submitReview(post("/api/reviews", review)),
      await trackOrder(post("/api/orders/track", { orderNumber: "PL-ABC123", email: "a@example.com" })),
    ]) {
      expect(response.status).toBe(503);
      expect(response.headers.get("retry-after")).toBe("3600");
      expect(await response.json()).toEqual({ error: "maintenance" });
    }
    expect(mocks.createReview).not.toHaveBeenCalled();
    expect(mocks.lookupOrderTracking).not.toHaveBeenCalled();
  });

  it("works as usual when maintenance mode is off", async () => {
    db.siteSetting.findUnique.mockResolvedValue(savedRow(false, "old note"));
    expect((await submitReview(post("/api/reviews", review))).status).toBe(201);
    expect(mocks.createReview).toHaveBeenCalledTimes(1);
  });
});
