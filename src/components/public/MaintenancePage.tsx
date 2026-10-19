import { HeroStripes } from "./HeroStripes";
import { BrandSeal } from "@/components/ui/BrandSeal";
import { Icon } from "@/components/ui/Icon";
import { LocaleSwitcher } from "@/components/ui/LocaleSwitcher";
import { getRequestLocale } from "@/lib/locale";
import { whatsappGreeting, whatsappLink } from "@/lib/site";
import type { SiteSettings } from "@/lib/services/site-settings";
import { translate } from "@/messages";

/**
 * Page shown to visitors while maintenance mode is on: seventies hero look, the
 * owner's optional note (plain text) and the shop contacts. No form: nothing is stored.
 */
export async function MaintenancePage({ settings, message }: { settings: SiteSettings; message: string }) {
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);
  const note = message.trim();

  return (
    <div className="maintenance-page">
      <HeroStripes standalone />
      <header className="maintenance-top">
        <LocaleSwitcher />
      </header>
      <main id="main" className="maintenance-main">
        <div className="maintenance-content">
          <BrandSeal size={132} variant="full" label={settings.name} />
          <p className="maintenance-eyebrow">
            <span aria-hidden="true" /> {t("maintenance.eyebrow")}
          </p>
          <h1>{t("maintenance.title")}</h1>
          <p className="maintenance-text">{t("maintenance.text")}</p>
          {note && (
            <section className="maintenance-note" aria-labelledby="maintenance-note-title">
              <h2 id="maintenance-note-title">{t("maintenance.noteTitle")}</h2>
              <p>{note}</p>
            </section>
          )}
          <section className="maintenance-contact" aria-labelledby="maintenance-contact-title">
            <h2 id="maintenance-contact-title">{t("maintenance.contactTitle")}</h2>
            <p>{t("maintenance.contactText")}</p>
            <ul className="maintenance-actions">
              <li>
                <a
                  className="btn btn-gold"
                  href={whatsappLink(whatsappGreeting(t, settings.name), settings.whatsappNumber)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("cta.whatsapp")}
                  <Icon name="chat" size={18} />
                </a>
              </li>
              {settings.email && (
                <li>
                  <a className="btn btn-light" href={`mailto:${settings.email}`}>
                    <span>
                      {t("maintenance.email")}
                      <small>{settings.email}</small>
                    </span>
                  </a>
                </li>
              )}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
