import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/uploads/[...path]/route";
import { uploadDirectory, uploadRoot } from "@/lib/uploads";

const NAME = "0b6f5d3e-8f1c-4d2a-9a37-2c1e5b7d9f01.jpg";
let root: string;

function get(...path: string[]) {
  return GET(new Request(`http://localhost:3000/uploads/${path.join("/")}`), {
    params: Promise.resolve({ path }),
  });
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "placa-uploads-"));
  vi.stubEnv("UPLOAD_DIR", root);
  await mkdir(join(root, "products"), { recursive: true });
  await writeFile(join(root, "products", NAME), Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
  await writeFile(join(root, "secret.txt"), "no");
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

describe("uploads folder", () => {
  it("uses UPLOAD_DIR when set and public/uploads otherwise", () => {
    expect(uploadRoot()).toBe(root);
    expect(uploadDirectory("products")).toBe(join(root, "products"));
    vi.stubEnv("UPLOAD_DIR", "");
    expect(uploadRoot()).toBe(join(process.cwd(), "public", "uploads"));
    vi.stubEnv("UPLOAD_DIR", root);
  });
});

describe("GET /uploads/[...path]", () => {
  it("serves an uploaded photo with its type and a long cache", async () => {
    const response = await get("products", NAME);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]));
  });

  it("answers 404 for missing files, other folders, other names and path tricks", async () => {
    const cases = [
      ["products", NAME.replace("0b6f", "1b6f")],
      ["settings", NAME],
      ["other", NAME],
      ["products", "photo.jpg"],
      ["products", NAME.replace(".jpg", ".svg")],
      ["..", "secret.txt"],
      ["products", "..", "secret.txt"],
      ["products", `..%2F${NAME}`],
      [NAME],
    ];
    for (const path of cases) expect((await get(...path)).status, path.join("/")).toBe(404);
  });
});
