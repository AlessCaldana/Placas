"use client";

import { useState, type Ref } from "react";
import { Icon } from "@/components/ui/Icon";
import { useLocale } from "@/components/ui/LocaleProvider";

/** Password field with a show/hide toggle, usable in form cards and dialogs. */
export function PasswordInput({
  id,
  label,
  value,
  onChange,
  autoComplete,
  hint,
  error,
  disabled = false,
  inputRef,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  hint?: string;
  error?: string;
  disabled?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const { t } = useLocale();
  const [visible, setVisible] = useState(false);
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : "", error ? errorId : ""].filter(Boolean).join(" ") || undefined;

  return (
    <div className="password-field">
      <label htmlFor={id}>{label}</label>
      <div className="password-input">
        <input
          ref={inputRef}
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="password-toggle"
          aria-controls={id}
          aria-label={t(visible ? "admin.password.hide" : "admin.password.show")}
          title={t(visible ? "admin.password.hide" : "admin.password.show")}
          disabled={disabled}
          onClick={() => setVisible((current) => !current)}
        >
          <Icon name={visible ? "eyeOff" : "eye"} size={19} />
        </button>
      </div>
      {hint && <small className="settings-help" id={hintId}>{hint}</small>}
      {error && <span className="field-error settings-field-error" id={errorId}>{error}</span>}
    </div>
  );
}
