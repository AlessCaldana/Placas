import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { site } from "@/lib/site";
import type { ShippingRates } from "@/lib/payments/shipping";

export type SiteSettings = {
  name: string;
  logoUrl: string | null;
  email: string;
  phone: string;
  whatsappNumber: string;
  shippingRates: ShippingRates;
};

const noShipping: ShippingRates = { IT: null, EU: null, WORLD: null };

export function defaultSiteSettings(): SiteSettings {
  return {
    name: site.name,
    logoUrl: null,
    email: site.email,
    phone: "",
    whatsappNumber: site.whatsappNumber,
    shippingRates: noShipping,
  };
}

const settingsSelect = {
  name: true,
  logoUrl: true,
  email: true,
  phone: true,
  whatsappNumber: true,
  shippingItalyCents: true,
  shippingEuCents: true,
  shippingWorldCents: true,
} as const;

function toShippingRates(row: {
  shippingItalyCents: number | null;
  shippingEuCents: number | null;
  shippingWorldCents: number | null;
}): ShippingRates {
  return { IT: row.shippingItalyCents, EU: row.shippingEuCents, WORLD: row.shippingWorldCents };
}

export async function getSiteSettings(): Promise<SiteSettings> {
  if (!isDatabaseConfigured()) return defaultSiteSettings();
  const settings = await getDb().siteSetting.findUnique({
    where: { id: "default" },
    select: settingsSelect,
  });
  if (!settings) return defaultSiteSettings();
  return {
    name: settings.name,
    logoUrl: settings.logoUrl,
    email: settings.email ?? "",
    phone: settings.phone ?? "",
    whatsappNumber: settings.whatsappNumber ?? site.whatsappNumber,
    shippingRates: toShippingRates(settings),
  };
}

export async function saveSiteSettings(settings: SiteSettings): Promise<SiteSettings> {
  const { shippingRates, ...fields } = settings;
  const data = {
    ...fields,
    shippingItalyCents: shippingRates.IT,
    shippingEuCents: shippingRates.EU,
    shippingWorldCents: shippingRates.WORLD,
  };
  const saved = await getDb().siteSetting.upsert({
    where: { id: "default" },
    create: { id: "default", ...data },
    update: data,
    select: settingsSelect,
  });
  return {
    name: saved.name,
    logoUrl: saved.logoUrl,
    email: saved.email ?? "",
    phone: saved.phone ?? "",
    whatsappNumber: saved.whatsappNumber ?? "",
    shippingRates: toShippingRates(saved),
  };
}

const logoDirectory = join(process.cwd(), "public", "uploads", "settings");
const imageExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function validateLogoFile(file: File): boolean {
  return Boolean(imageExtensions[file.type]) && file.size > 0 && file.size <= 5 * 1024 * 1024;
}

export async function storeSiteLogo(file: File): Promise<string> {
  const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const valid =
    (file.type === "image/jpeg" && signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff) ||
    (file.type === "image/png" && signature[0] === 0x89 && signature[1] === 0x50 && signature[2] === 0x4e && signature[3] === 0x47 && signature[4] === 0x0d && signature[5] === 0x0a && signature[6] === 0x1a && signature[7] === 0x0a) ||
    (file.type === "image/webp" && signature[0] === 0x52 && signature[1] === 0x49 && signature[2] === 0x46 && signature[3] === 0x46 && signature[8] === 0x57 && signature[9] === 0x45 && signature[10] === 0x42 && signature[11] === 0x50);
  if (!valid) throw new Error("invalid_logo");

  await mkdir(logoDirectory, { recursive: true });
  const fileName = `${randomUUID()}.${imageExtensions[file.type]}`;
  await writeFile(join(logoDirectory, fileName), Buffer.from(await file.arrayBuffer()), { flag: "wx" });
  return `/uploads/settings/${fileName}`;
}

export async function deleteSiteLogo(url: string | null): Promise<void> {
  if (!url?.startsWith("/uploads/settings/")) return;
  const fileName = url.slice("/uploads/settings/".length);
  if (!fileName || basename(fileName) !== fileName) return;
  await rm(join(logoDirectory, fileName), { force: true });
}
