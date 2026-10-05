import Link from "next/link";
import { Brand } from "./Brand";
import { getRequestLocale } from "@/lib/locale";
import { translate } from "@/messages";
import { site, whatsappLink } from "@/lib/site";

export async function Footer() {
  const locale = await getRequestLocale();

  return (
    <footer>
      <div className="footer-main">
        <div>
          <Brand variant="footer" locale={locale} />
          <p>{translate(locale, "footer.text")}</p>
        </div>
        <div>
          <b>{translate(locale, "footer.explore")}</b>
          <Link href="/#catalogo">{translate(locale, "nav.catalog")}</Link>
          <Link href="/#contatti">{translate(locale, "nav.contact")}</Link>
        </div>
        <div>
          <b>{translate(locale, "footer.contacts")}</b>
          <a href={whatsappLink()} target="_blank" rel="noopener noreferrer">
            WhatsApp
          </a>
          {site.email && <a href={`mailto:${site.email}`}>{site.email}</a>}
        </div>
      </div>
      <div className="footer-bottom">
        © {new Date().getFullYear()} PLACA <span>{translate(locale, "footer.demo")}</span>
      </div>
    </footer>
  );
}
