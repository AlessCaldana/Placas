"use client";

import { useEffect, useState, type FormEvent, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/ui/LocaleProvider";
import type { SiteSettings } from "@/lib/services/site-settings";
import type { ShippingRates } from "@/lib/payments/shipping";
import { PARCEL_BRACKETS_GRAMS, TABLE_COUNTRIES, tablePriceCents } from "@/lib/payments/shipping-table";
import { siteLegalFields, siteLegalMaxLength, type SiteLegalField } from "@/lib/validators/site-legal";

// Switchable zones: the price comes from the shipping table; a zone is on when
// it has any stored value (sent as "0") and off when empty.
const shippingZones = ["IT", "EU"] as const;
type SwitchableZone = (typeof shippingZones)[number];

const legalInputs: Record<SiteLegalField, { type: "text" | "email"; autoComplete: string }> = {
  legalName: { type: "text", autoComplete: "organization" },
  vatNumber: { type: "text", autoComplete: "off" },
  taxCode: { type: "text", autoComplete: "off" },
  legalAddress: { type: "text", autoComplete: "street-address" },
  pecEmail: { type: "email", autoComplete: "off" },
  reaNumber: { type: "text", autoComplete: "off" },
};

const legalErrorKeys: Record<SiteLegalField, string> = {
  legalName: "admin.settings.invalidLegalName",
  vatNumber: "admin.settings.invalidVatNumber",
  taxCode: "admin.settings.invalidTaxCode",
  legalAddress: "admin.settings.invalidLegalAddress",
  pecEmail: "admin.settings.invalidPecEmail",
  reaNumber: "admin.settings.invalidReaNumber",
};

function isLegalField(value: unknown): value is SiteLegalField {
  return typeof value === "string" && (siteLegalFields as readonly string[]).includes(value);
}

function shippingSwitches(rates: ShippingRates): Record<SwitchableZone, boolean> {
  return { IT: rates.IT !== null, EU: rates.EU !== null };
}

function formatEuro(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100);
}

export function SettingsForm({
  initialSettings,
  databaseError,
}: {
  initialSettings: SiteSettings;
  databaseError: boolean;
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const regionNames = new Intl.DisplayNames([locale], { type: "region" });
  const [settings, setSettings] = useState(initialSettings);
  // The chosen logo file and its object URL for the preview.
  const [logo, setLogo] = useState<{ file: File; previewUrl: string } | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [shipping, setShipping] = useState(() => shippingSwitches(initialSettings.shippingRates));
  const [legal, setLegal] = useState(initialSettings.legal);
  const [legalError, setLegalError] = useState<SiteLegalField | null>(null);
  const logoFile = logo?.file ?? null;

  // Release the preview URL when the logo changes or the form unmounts.
  useEffect(() => {
    if (!logo) return;
    return () => URL.revokeObjectURL(logo.previewUrl);
  }, [logo]);

  // Move focus to the legal field the server rejected.
  useEffect(() => {
    if (legalError) document.getElementById(`settings-${legalError}`)?.focus();
  }, [legalError]);

  function chooseLogo(file: File | null) {
    setLogo(file ? { file, previewUrl: URL.createObjectURL(file) } : null);
  }

  function changeLegalField(event: ChangeEvent<HTMLInputElement>) {
    const field = event.currentTarget.name;
    const { value } = event.currentTarget;
    if (!isLegalField(field)) return;
    setSaved(false);
    if (legalError === field) setLegalError(null);
    setLegal((current) => ({ ...current, [field]: value }));
  }

  function changeField(event: ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.currentTarget;
    setSaved(false);
    setSettings((current) => ({ ...current, [name]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (databaseError || saving) return;
    setSaving(true);
    setError("");
    setLegalError(null);
    setSaved(false);
    const form = new FormData();
    form.set("name", settings.name);
    form.set("email", settings.email);
    form.set("phone", settings.phone);
    form.set("whatsappNumber", settings.whatsappNumber);
    for (const zone of shippingZones) form.set(`shipping${zone}`, shipping[zone] ? "0" : "");
    form.set("shippingWORLD", "");
    for (const field of siteLegalFields) form.set(field, legal[field]);
    form.set("removeLogo", String(removeLogo));
    if (logoFile) form.set("logo", logoFile);

    try {
      const response = await fetch("/api/admin/settings", { method: "PUT", body: form });
      const result = (await response.json().catch(() => null)) as (SiteSettings & { error?: string; field?: unknown }) | null;
      if (result?.error === "invalid_legal") {
        setError(t("admin.settings.invalidLegal"));
        if (isLegalField(result.field)) setLegalError(result.field);
        return;
      }
      if (!response.ok || !result || result.error) {
        setError(t(result?.error === "invalid_logo" ? "admin.settings.invalidLogo" : result?.error === "logo_too_large" ? "admin.settings.logoTooLarge" : result?.error === "invalid_settings" ? "admin.settings.invalid" : "admin.settings.saveFailed"));
        return;
      }
      setSettings(result);
      setShipping(shippingSwitches(result.shippingRates));
      setLegal(result.legal);
      chooseLogo(null);
      setRemoveLogo(false);
      setSaved(true);
      router.refresh();
    } catch {
      setError(t("admin.settings.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const shownLogo = logo?.previewUrl ?? (removeLogo ? null : settings.logoUrl);

  return (
    <form className="settings-layout" onSubmit={save}>
      {databaseError && <p className="field-error settings-status" role="alert">{t("admin.database.unavailable")}</p>}
      <section className="admin-card form-card">
        <h2>{t("admin.settings.identity")}</h2>
        <p>{t("admin.settings.identityHint")}</p>
        <label>
          {t("admin.settings.name")}
          <input name="name" value={settings.name} onChange={changeField} maxLength={120} required disabled={databaseError || saving} />
        </label>
        <label>
          {t("admin.settings.logo")}
          <span className="settings-logo-preview">
            {shownLogo ? <img src={shownLogo} alt={t("admin.settings.logoPreview")} /> : <span>{settings.name || "PLACA"}</span>}
          </span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label={t("admin.settings.logo")}
            disabled={databaseError || saving}
            onChange={(event) => {
              chooseLogo(event.currentTarget.files?.[0] ?? null);
              setRemoveLogo(false);
              setSaved(false);
            }}
          />
          <small className="settings-help">{t("admin.settings.logoHint")}</small>
        </label>
        {settings.logoUrl && !removeLogo && !logoFile && (
          <button className="btn btn-light settings-remove-logo" type="button" onClick={() => { setRemoveLogo(true); setSaved(false); }}>
            {t("admin.settings.removeLogo")}
          </button>
        )}
        {removeLogo && <button className="settings-undo-logo" type="button" onClick={() => setRemoveLogo(false)}>{t("admin.settings.keepLogo")}</button>}
      </section>

      <section className="admin-card form-card">
        <h2>{t("admin.settings.contacts")}</h2>
        <p>{t("admin.settings.contactsHint")}</p>
        <label>
          {t("admin.settings.email")}
          <input name="email" type="email" autoComplete="email" value={settings.email} onChange={changeField} maxLength={254} disabled={databaseError || saving} />
        </label>
        <label>
          {t("admin.settings.phone")}
          <input name="phone" type="tel" autoComplete="tel" value={settings.phone} onChange={changeField} maxLength={32} disabled={databaseError || saving} />
        </label>
        <label>
          {t("admin.settings.whatsapp")}
          <input name="whatsappNumber" type="tel" autoComplete="tel" value={settings.whatsappNumber} onChange={changeField} maxLength={20} required disabled={databaseError || saving} />
          <small className="settings-help">{t("admin.settings.whatsappHint")}</small>
        </label>
      </section>

      <section className="admin-card form-card">
        <h2>{t("admin.settings.shipping")}</h2>
        <p>{t("admin.settings.shippingHint")}</p>
        {shippingZones.map((zone) => (
          <label key={zone} className="radio-row checkbox-row">
            <input
              name={`shipping${zone}`}
              type="checkbox"
              checked={shipping[zone]}
              onChange={(event) => {
                const { checked } = event.currentTarget;
                setSaved(false);
                setShipping((current) => ({ ...current, [zone]: checked }));
              }}
              disabled={databaseError || saving}
            />
            <span>{t(`admin.settings.shipping${zone}`)}</span>
          </label>
        ))}
        <div className="settings-table-wrap">
          <table className="settings-shipping-table">
            <caption>{t("admin.settings.shippingTable")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("admin.settings.shippingCountry")}</th>
                {PARCEL_BRACKETS_GRAMS.map((grams) => (
                  <th scope="col" key={grams}>
                    {t("admin.settings.shippingUpTo").replace("{kg}", new Intl.NumberFormat(locale).format(grams / 1000))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TABLE_COUNTRIES.map((country) => (
                <tr key={country}>
                  <th scope="row">{regionNames.of(country) ?? country}</th>
                  {PARCEL_BRACKETS_GRAMS.map((grams, index) => (
                    <td key={grams}>{formatEuro(tablePriceCents(country, index), locale)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-card form-card settings-legal" aria-labelledby="settings-legal-title">
        <h2 id="settings-legal-title">{t("admin.settings.legal")}</h2>
        <p>{t("admin.settings.legalHint")}</p>
        {(!settings.legal.vatNumber || !settings.legal.legalAddress) && (
          <p className="settings-warning" role="note">{t("admin.settings.legalMissingInfo")}</p>
        )}
        <div className="settings-legal-fields">
          {siteLegalFields.map((field) => {
            const invalid = legalError === field;
            const input = legalInputs[field];
            return (
              <label key={field} className={field === "legalName" || field === "legalAddress" ? "settings-legal-wide" : undefined}>
                {t(`admin.settings.${field}`)}
                <input
                  id={`settings-${field}`}
                  name={field}
                  type={input.type}
                  autoComplete={input.autoComplete}
                  value={legal[field]}
                  onChange={changeLegalField}
                  maxLength={siteLegalMaxLength[field]}
                  aria-invalid={invalid || undefined}
                  aria-describedby={`settings-${field}-help${invalid ? ` settings-${field}-error` : ""}`}
                  disabled={databaseError || saving}
                />
                <small id={`settings-${field}-help`} className="settings-help">{t(`admin.settings.${field}Hint`)}</small>
                {invalid && (
                  <span id={`settings-${field}-error`} className="field-error settings-field-error">
                    {t(legalErrorKeys[field])}
                  </span>
                )}
              </label>
            );
          })}
        </div>
      </section>

      <div className="settings-actions">
        {error && <p className="field-error" role="alert">{error}</p>}
        {saved && <p className="field-success" role="status">{t("admin.settings.saved")}</p>}
        <button className="btn btn-gold" type="submit" disabled={databaseError || saving}>
          {saving ? t("admin.settings.saving") : t("admin.settings.save")}
        </button>
      </div>
    </form>
  );
}
