import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { config as proxyConfig } from "@/proxy";

const root = path.resolve(import.meta.dirname, "..");

async function loadConfig() {
  vi.resetModules();
  return (await import("../next.config")).default;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("next.config", () => {
  it("keeps the proxy body buffer small (1 MB)", async () => {
    const config = await loadConfig();
    expect(config.experimental?.proxyClientMaxBodySize).toBe("1mb");
  });

  it("sends HSTS only in production", async () => {
    const headerKeys = async () => {
      const config = await loadConfig();
      const rules = (await config.headers?.()) ?? [];
      return rules.flatMap((rule) => rule.headers.map((header) => [header.key, header.value]));
    };
    vi.stubEnv("NODE_ENV", "development");
    expect((await headerKeys()).map(([key]) => key)).not.toContain("Strict-Transport-Security");
    vi.stubEnv("NODE_ENV", "production");
    expect(await headerKeys()).toContainEqual([
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    ]);
  });
});

describe("proxy", () => {
  it("runs on the admin pages only, never on /api/admin (no pre-auth body buffering there)", () => {
    expect(proxyConfig.matcher).toEqual(["/admin/:path*"]);
  });
});

describe("project settings", () => {
  it("runs the dev server on the loopback interface only", () => {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.dev).toBe("next dev -H 127.0.0.1");
  });

  it("keeps uploaded site settings files out of Git", () => {
    const ignore = readFileSync(path.join(root, ".gitignore"), "utf8").split("\n");
    expect(ignore).toContain("/public/uploads/settings/");
    expect(ignore).toContain("/public/uploads/products/");
  });
});
