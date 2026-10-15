import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { uploadDirectory, uploadFolders, type UploadFolder } from "@/lib/uploads";

// Serves the photos and logo uploaded from the panel from UPLOAD_DIR, outside
// the build folder, so they survive redeploys and are visible right after the
// upload (next start only serves public/ files that existed at startup).
const contentTypes: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

// Uploaded files are always named <random UUID>.<extension>.
const fileNamePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params;
  if (path.length !== 2) return notFound();
  const [folder, fileName] = path;
  const match = fileNamePattern.exec(fileName);
  if (!uploadFolders.includes(folder as UploadFolder) || !match) return notFound();

  let bytes: Buffer;
  try {
    bytes = await readFile(join(uploadDirectory(folder as UploadFolder), fileName));
  } catch {
    return notFound();
  }
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": contentTypes[match[1]],
      "content-length": String(bytes.length),
      // The name is random and never reused, so the file never changes.
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
