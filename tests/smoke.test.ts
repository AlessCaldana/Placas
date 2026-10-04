import { describe, expect, it, vi } from "vitest";
import { it as messages } from "@/messages/it";

describe("textos de interfaz", () => {
  it("el nombre del sitio es PLACA", () => {
    expect(messages.site.name).toBe("PLACA");
  });
});

describe("GET /api/health", () => {
  it("responde ok y database not_configured sin DATABASE_URL", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ app: "ok", database: "not_configured" });
    vi.unstubAllEnvs();
  });
});
