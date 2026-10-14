import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The admin layout does not re-run on client-side navigation and the proxy only
// checks the cookie signature, so every page under src/app/admin must verify
// the session itself (account active, sessionVersion) with requireAdminPage().
const ADMIN_DIR = path.resolve(import.meta.dirname, "../src/app/admin");

// Pages that only redirect elsewhere and read no data.
const REDIRECT_ONLY = new Set(["page.tsx", path.join("richieste", "page.tsx")]);

function pageFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return pageFiles(full);
    return entry === "page.tsx" ? [full] : [];
  });
}

describe("admin page guards", () => {
  const pages = pageFiles(ADMIN_DIR);

  it("finds the admin pages", () => {
    expect(pages.length).toBeGreaterThan(5);
  });

  it.each(pages.map((file) => [path.relative(ADMIN_DIR, file), file]))(
    "%s checks the session with requireAdminPage()",
    (relative, file) => {
      const source = readFileSync(file, "utf8");
      if (REDIRECT_ONLY.has(relative)) {
        // Allow-listed pages must really be redirect-only.
        expect(source).toMatch(/redirect\(/);
        expect(source).not.toMatch(/@\/lib\/services\//);
        return;
      }
      expect(source).toMatch(/await requireAdminPage\(/);
    },
  );
});
