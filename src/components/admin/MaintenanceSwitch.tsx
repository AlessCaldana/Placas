"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/ui/LocaleProvider";
import type { MaintenanceState } from "@/lib/services/maintenance";
import { MAINTENANCE_MESSAGE_MAX } from "@/lib/validators/maintenance";

const errorKeys: Record<string, string> = {
  invalid_request: "admin.maintenance.errorRequest",
  forbidden: "admin.maintenance.errorForbidden",
  unauthorized: "admin.maintenance.errorUnauthorized",
  auth_unavailable: "admin.maintenance.errorUnavailable",
  database_not_configured: "admin.maintenance.errorUnavailable",
  request_too_large: "admin.maintenance.errorTooLarge",
  invalid_maintenance: "admin.maintenance.errorInvalid",
  maintenance_save_failed: "admin.maintenance.errorSave",
};

type SaveKind = "enable" | "disable" | "message";

const doneKeys: Record<SaveKind, string> = {
  enable: "admin.maintenance.enabledDone",
  disable: "admin.maintenance.disabledDone",
  message: "admin.maintenance.messageSaved",
};

/**
 * Settings card for maintenance mode. SUPERADMIN can switch it (with a
 * confirmation before closing the site) and edit the visitors' note; other
 * admins only see the current state.
 */
export function MaintenanceSwitch({
  initialState,
  canEdit,
  databaseError,
}: {
  initialState: MaintenanceState;
  canEdit: boolean;
  databaseError: boolean;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const confirmDialog = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState(initialState);
  const [draft, setDraft] = useState(initialState.message);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const disabled = databaseError || saving;
  const messageChanged = draft.trim() !== state.message;

  async function save(enabled: boolean, kind: SaveKind) {
    if (disabled) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/maintenance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, message: draft }),
      });
      const result = (await response.json().catch(() => null)) as (Partial<MaintenanceState> & { error?: string }) | null;
      if (!response.ok || !result || result.error || typeof result.enabled !== "boolean") {
        setError(t(errorKeys[result?.error ?? ""] ?? "admin.maintenance.errorSave"));
        return;
      }
      const saved = { enabled: result.enabled, message: result.message ?? "" };
      setState(saved);
      setDraft(saved.message);
      setNotice(t(doneKeys[kind]));
      // Updates the notice in the admin shell and the public site.
      router.refresh();
    } catch {
      setError(t("admin.maintenance.errorSave"));
    } finally {
      setSaving(false);
    }
  }

  function confirmEnable() {
    confirmDialog.current?.close();
    void save(true, "enable");
  }

  return (
    <section
      id="manutenzione"
      className={`admin-card form-card maintenance-card${state.enabled ? " is-on" : ""}`}
      aria-labelledby="maintenance-title"
    >
      <h2 id="maintenance-title">{t("admin.maintenance.title")}</h2>
      <p>{t("admin.maintenance.hint")}</p>

      <div className="maintenance-state">
        <span className="maintenance-state-label">{t("admin.maintenance.status")}</span>
        <b className={state.enabled ? "maintenance-pill is-on" : "maintenance-pill"}>
          <span aria-hidden="true" />
          {t(state.enabled ? "admin.maintenance.on" : "admin.maintenance.off")}
        </b>
        <span className="maintenance-state-hint">
          {t(state.enabled ? "admin.maintenance.onHint" : "admin.maintenance.offHint")}
        </span>
      </div>

      {canEdit ? (
        <>
          <label>
            {t("admin.maintenance.message")}
            <input
              name="maintenanceMessage"
              type="text"
              value={draft}
              maxLength={MAINTENANCE_MESSAGE_MAX}
              autoComplete="off"
              aria-describedby="maintenance-message-help maintenance-message-count"
              disabled={disabled}
              onChange={(event) => {
                setDraft(event.currentTarget.value);
                setNotice("");
              }}
            />
            <span className="maintenance-message-meta">
              <small id="maintenance-message-help" className="settings-help">
                {t("admin.maintenance.messageHint")}
              </small>
              <small id="maintenance-message-count" className="settings-help maintenance-count">
                {t("admin.maintenance.counter")
                  .replace("{n}", String(draft.length))
                  .replace("{max}", String(MAINTENANCE_MESSAGE_MAX))}
              </small>
            </span>
          </label>

          {error && <p className="field-error" role="alert">{error}</p>}
          {notice && <p className="field-success" role="status">{notice}</p>}

          <div className="maintenance-switch-actions">
            {state.enabled ? (
              <>
                <button
                  type="button"
                  className="btn btn-gold"
                  disabled={disabled}
                  aria-busy={saving}
                  onClick={() => void save(false, "disable")}
                >
                  {saving ? t("admin.maintenance.saving") : t("admin.maintenance.disable")}
                </button>
                {messageChanged && (
                  <button
                    type="button"
                    className="btn btn-line"
                    disabled={disabled}
                    onClick={() => void save(true, "message")}
                  >
                    {t("admin.maintenance.saveMessage")}
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                className="btn btn-danger"
                disabled={disabled}
                aria-busy={saving}
                aria-haspopup="dialog"
                onClick={() => {
                  setError("");
                  setNotice("");
                  confirmDialog.current?.showModal();
                }}
              >
                {saving ? t("admin.maintenance.saving") : t("admin.maintenance.enable")}
              </button>
            )}
          </div>

          <dialog
            ref={confirmDialog}
            className="admin-dialog"
            aria-labelledby="maintenance-confirm-title"
            aria-describedby="maintenance-confirm-text"
            onClick={(event) => {
              if (event.target === event.currentTarget) event.currentTarget.close();
            }}
          >
            <h2 id="maintenance-confirm-title">{t("admin.maintenance.confirmTitle")}</h2>
            <p id="maintenance-confirm-text">{t("admin.maintenance.confirmText")}</p>
            <div className="dialog-actions">
              <button type="button" className="btn btn-line" onClick={() => confirmDialog.current?.close()}>
                {t("admin.dialog.cancel")}
              </button>
              <button type="button" className="btn btn-danger" onClick={confirmEnable}>
                {t("admin.maintenance.confirmEnable")}
              </button>
            </div>
          </dialog>
        </>
      ) : (
        <>
          {state.message && (
            <p className="maintenance-readonly-message">
              <span>{t("maintenance.noteTitle")}</span>
              {state.message}
            </p>
          )}
          <p className="settings-help" role="note">{t("admin.maintenance.readOnly")}</p>
        </>
      )}
    </section>
  );
}
