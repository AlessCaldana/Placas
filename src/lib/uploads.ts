import { isAbsolute, join, resolve } from "node:path";

export type UploadFolder = "products" | "settings";

export const uploadFolders: readonly UploadFolder[] = ["products", "settings"];

/**
 * Root folder for the photos and logo uploaded from the panel. In production it
 * must live outside the app (UPLOAD_DIR), because Hostinger rebuilds the app
 * folder on every deploy. Without UPLOAD_DIR it stays in public/uploads, as
 * before, which is fine for local development.
 */
export function uploadRoot(): string {
  const configured = process.env.UPLOAD_DIR?.trim();
  if (configured) return isAbsolute(configured) ? configured : resolve(configured);
  return join(process.cwd(), "public", "uploads");
}

export function uploadDirectory(folder: UploadFolder): string {
  return join(uploadRoot(), folder);
}
