import { NextResponse } from "next/server";
import { rejectWithoutAdminSession } from "@/lib/admin-auth";
import { isDatabaseConfigured } from "@/lib/db";
import { bufferRequestWithinProductImageLimit } from "@/lib/product-images";
import {
  deleteSiteLogo,
  getSiteSettings,
  saveSiteSettings,
  storeSiteLogo,
  validateLogoFile,
} from "@/lib/services/site-settings";
import type { ShippingRates, ShippingZone } from "@/lib/payments/shipping";
import { parseSiteLegalInput, siteLegalFields } from "@/lib/validators/site-legal";
import { isCrossOriginRequest } from "@/lib/request-origin";

export const dynamic = "force-dynamic";

/** Euro amount ("5", "5.9", "5,90") to cents; "" means no shipping; undefined = invalid. */
function parseShippingCents(value: FormDataEntryValue | null): number | null | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  const match = /^(\d{1,5})(?:[.,](\d{1,2}))?$/.exec(text);
  if (!match) return undefined;
  return Number(match[1]) * 100 + Number((match[2] ?? "0").padEnd(2, "0"));
}

export async function GET(request: Request) {
  const denied = await rejectWithoutAdminSession(request);
  if (denied) return denied;
  if (!isDatabaseConfigured()) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  try {
    return NextResponse.json(await getSiteSettings());
  } catch {
    return NextResponse.json({ error: "settings_unavailable" }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  if (isCrossOriginRequest(request)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 403 });
  }
  const denied = await rejectWithoutAdminSession(request);
  if (denied) return denied;
  if (!isDatabaseConfigured()) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  const boundedRequest = await bufferRequestWithinProductImageLimit(request, 6 * 1024 * 1024);
  if (!boundedRequest) {
    return NextResponse.json({ error: "logo_too_large" }, { status: 413 });
  }

  const form = await boundedRequest.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "invalid_settings" }, { status: 400 });
  const nameValue = form.get("name");
  const emailValue = form.get("email");
  const phoneValue = form.get("phone");
  const whatsappValue = form.get("whatsappNumber");
  const removeLogo = form.get("removeLogo") === "true";
  const fileValue = form.get("logo");
  const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;
  const name = typeof nameValue === "string" ? nameValue.trim().replace(/\s+/g, " ") : "";
  const email = typeof emailValue === "string" ? emailValue.trim() : "";
  const phone = typeof phoneValue === "string" ? phoneValue.trim() : "";
  const rawWhatsapp = typeof whatsappValue === "string" ? whatsappValue.trim() : "";
  const whatsappNumber = rawWhatsapp.replace(/\D/g, "");
  const shippingRates: Partial<Record<ShippingZone, number | null | undefined>> = {
    IT: parseShippingCents(form.get("shippingIT")),
    EU: parseShippingCents(form.get("shippingEU")),
    WORLD: parseShippingCents(form.get("shippingWORLD")),
  };
  const invalidShipping = Object.values(shippingRates).some((cents) => cents === undefined);

  if (!name || name.length > 120 || email.length > 254 ||
    (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ||
    phone.length > 32 || (phone && !/^[+()\d\s.-]+$/.test(phone)) ||
    whatsappNumber.length < 7 || whatsappNumber.length > 15 || invalidShipping) {
    return NextResponse.json({ error: "invalid_settings" }, { status: 400 });
  }
  if (file && !validateLogoFile(file)) {
    return NextResponse.json({ error: "invalid_logo" }, { status: 400 });
  }
  // Legal fields missing from the form (older clients) keep their stored value.
  const legalInput = parseSiteLegalInput(
    Object.fromEntries(siteLegalFields.map((field) => [field, form.get(field)])),
  );
  if (!legalInput.ok) {
    return NextResponse.json({ error: "invalid_legal", field: legalInput.field }, { status: 400 });
  }

  let uploadedLogo: string | null = null;
  try {
    const previous = await getSiteSettings();
    if (file) uploadedLogo = await storeSiteLogo(file);
    const saved = await saveSiteSettings({
      name,
      logoUrl: uploadedLogo ?? (removeLogo ? null : previous.logoUrl),
      email,
      phone,
      whatsappNumber,
      shippingRates: shippingRates as ShippingRates,
      legal: { ...previous.legal, ...legalInput.value },
    });
    if (uploadedLogo || removeLogo) await deleteSiteLogo(previous.logoUrl).catch(() => undefined);
    return NextResponse.json(saved);
  } catch (error) {
    if (uploadedLogo) await deleteSiteLogo(uploadedLogo).catch(() => undefined);
    const invalidLogo = error instanceof Error && error.message === "invalid_logo";
    return NextResponse.json({ error: invalidLogo ? "invalid_logo" : "settings_save_failed" }, { status: invalidLogo ? 400 : 500 });
  }
}
