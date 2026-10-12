import Link from "next/link";
import type { Locale } from "@/messages";
import { translate } from "@/messages";
import type { SiteSettings } from "@/lib/services/site-settings";
import { BrandSeal } from "@/components/ui/BrandSeal";

export function Brand({
  variant,
  locale = "it",
  settings,
}: {
  variant?: "footer";
  locale?: Locale;
  settings?: SiteSettings;
}) {
  return (
    <Link
      href="/"
      className={variant === "footer" ? "brand footer-brand" : "brand"}
      aria-label={translate(locale, "brand.home")}
    >
      {settings?.logoUrl ? <img className="brand-logo" src={settings.logoUrl} alt="" /> : <BrandSeal size={44} />}
      {settings?.name ?? "PLACA"}<small>DECORATIVE ITALIANE</small>
    </Link>
  );
}
