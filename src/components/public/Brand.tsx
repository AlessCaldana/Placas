import Link from "next/link";
import type { CSSProperties } from "react";
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
      <BrandName name={settings?.name ?? "PLACA"} />
    </Link>
  );
}

/** Shop name that shrinks with its length so long names fit next to the seal. */
export function BrandName({ name }: { name: string }) {
  return (
    <b className="brand-name" style={{ "--brand-chars": Math.max(name.length, 1) } as CSSProperties}>
      {name}
    </b>
  );
}
