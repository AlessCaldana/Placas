import Link from "next/link";
import type { Locale } from "@/messages";
import { translate } from "@/messages";

export function Brand({
  variant,
  locale = "it",
}: {
  variant?: "footer";
  locale?: Locale;
}) {
  return (
    <Link
      href="/"
      className={variant === "footer" ? "brand footer-brand" : "brand"}
      aria-label={translate(locale, "brand.home")}
    >
      <span>PL</span>PLACA<small>DECORATIVE ITALIANE</small>
    </Link>
  );
}
