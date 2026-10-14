"use client";

import { useRef, useState, type FormEvent } from "react";
import { useLocale } from "@/components/ui/LocaleProvider";
import { PasswordInput } from "./PasswordInput";
import { apiErrorKey, passwordProblemKey, readApiError } from "./admin-user-ui";

type Field = "current" | "next" | "repeat";

export function PasswordChangeForm({ email }: { email: string }) {
  const { t } = useLocale();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const currentRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLInputElement>(null);
  const repeatRef = useRef<HTMLInputElement>(null);

  function focusField(field: Field) {
    const target = field === "current" ? currentRef : field === "next" ? nextRef : repeatRef;
    requestAnimationFrame(() => target.current?.focus());
  }

  function clearField(field: Field) {
    setNotice("");
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setFormError("");
    setNotice("");

    const found: Partial<Record<Field, string>> = {};
    if (!currentPassword) found.current = t("admin.account.errorCurrentRequired");
    const problem = passwordProblemKey(newPassword, email);
    if (problem) found.next = t(problem);
    else if (newPassword !== repeatPassword) found.repeat = t("admin.password.mismatch");
    setErrors(found);
    const firstInvalid = (["current", "next", "repeat"] as const).find((field) => found[field]);
    if (firstInvalid) return focusField(firstInvalid);

    setSaving(true);
    try {
      const response = await fetch("/api/admin/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!response.ok) {
        const apiError = await readApiError(response);
        const message = t(apiErrorKey(apiError, "admin.account.errorSave"));
        if (apiError.error === "invalid_current_password") {
          setErrors({ current: message });
          focusField("current");
        } else if (apiError.error === "weak_password") {
          setErrors({ next: message });
          focusField("next");
        } else {
          setFormError(message);
        }
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setRepeatPassword("");
      setErrors({});
      setNotice(t("admin.account.saved"));
    } catch {
      setFormError(t("admin.errors.network"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="account-password-form" onSubmit={(event) => void submit(event)} noValidate aria-busy={saving}>
      {/* Lets password managers pair the new password with the account. */}
      <input className="sr-only" type="email" name="username" autoComplete="username" value={email} readOnly tabIndex={-1} aria-hidden="true" />
      <PasswordInput
        id="account-current-password"
        label={t("admin.account.currentPassword")}
        autoComplete="current-password"
        value={currentPassword}
        onChange={(value) => {
          setCurrentPassword(value);
          clearField("current");
        }}
        error={errors.current}
        disabled={saving}
        inputRef={currentRef}
      />
      <PasswordInput
        id="account-new-password"
        label={t("admin.account.newPassword")}
        autoComplete="new-password"
        value={newPassword}
        onChange={(value) => {
          setNewPassword(value);
          clearField("next");
        }}
        hint={t("admin.password.hint")}
        error={errors.next}
        disabled={saving}
        inputRef={nextRef}
      />
      <PasswordInput
        id="account-repeat-password"
        label={t("admin.account.repeatPassword")}
        autoComplete="new-password"
        value={repeatPassword}
        onChange={(value) => {
          setRepeatPassword(value);
          clearField("repeat");
        }}
        error={errors.repeat}
        disabled={saving}
        inputRef={repeatRef}
      />
      {formError && <p className="field-error" role="alert">{formError}</p>}
      <p className={notice ? "field-success" : "account-status-empty"} role="status">{notice}</p>
      <div className="account-actions">
        <button type="submit" className="btn btn-gold" disabled={saving} aria-busy={saving}>
          {t(saving ? "admin.account.saving" : "admin.account.submit")}
        </button>
      </div>
    </form>
  );
}
