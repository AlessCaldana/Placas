"use client";

import { useEffect, useState, type FormEvent, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/ui/LocaleProvider";
import type { SiteSettings } from "@/lib/services/site-settings";
import type { ShippingRates, ShippingZone } from "@/lib/payments/shipping";

const shippingZones: ShippingZone[] = ["IT", "EU", "WORLD"];

function centsToInput(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2);
}

function shippingInputs(rates: ShippingRates): Record<ShippingZone, string> {
  return { IT: centsToInput(rates.IT), EU: centsToInput(rates.EU), WORLD: centsToInput(rates.WORLD) };
}

export function SettingsForm({
  initialSettings,
  databaseError,
}: {
  initialSettings: SiteSettings;
  databaseError: boolean;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [shipping, setShipping] = useState(() => shippingInputs(initialSettings.shippingRates));

  useEffect(() => {
    if (!logoFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(logoFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

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
    setSaved(false);
    const form = new FormData();
    form.set("name", settings.name);
    form.set("email", settings.email);
    form.set("phone", settings.phone);
    form.set("whatsappNumber", settings.whatsappNumber);
    for (const zone of shippingZones) form.set(`shipping${zone}`, shipping[zone]);
    form.set("removeLogo", String(removeLogo));
    if (logoFile) form.set("logo", logoFile);

    try {
      const response = await fetch("/api/admin/settings", { method: "PUT", body: form });
      const result = (await response.json().catch(() => null)) as (SiteSettings & { error?: string }) | null;
      if (!response.ok || !result || result.error) {
        setError(t(result?.error === "invalid_logo" ? "admin.settings.invalidLogo" : result?.error === "logo_too_large" ? "admin.settings.logoTooLarge" : result?.error === "invalid_settings" ? "admin.settings.invalid" : "admin.settings.saveFailed"));
        return;
      }
      setSettings(result);
      setShipping(shippingInputs(result.shippingRates));
      setLogoFile(null);
      setRemoveLogo(false);
      setSaved(true);
      router.refresh();
    } catch {
      setError(t("admin.settings.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const shownLogo = previewUrl ?? (removeLogo ? null : settings.logoUrl);

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
              setLogoFile(event.currentTarget.files?.[0] ?? null);
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
          <label key={zone}>
            {t(`admin.settings.shipping${zone}`)}
            <input
              name={`shipping${zone}`}
              type="text"
              inputMode="decimal"
              placeholder="—"
              value={shipping[zone]}
              onChange={(event) => {
                const { value } = event.currentTarget;
                setSaved(false);
                setShipping((current) => ({ ...current, [zone]: value }));
              }}
              maxLength={8}
              pattern="\d{1,5}([.,]\d{1,2})?"
              disabled={databaseError || saving}
            />
          </label>
        ))}
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
