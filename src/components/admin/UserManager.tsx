"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { Icon } from "@/components/ui/Icon";
import { useLocale } from "@/components/ui/LocaleProvider";
import type { AdminUserSummary } from "@/lib/services/admin-users";
import type { AdminRoleName, UpdateAdminUserInput } from "@/lib/validators/admin-user";
import { PasswordInput } from "./PasswordInput";
import {
  NAME_MAX_LENGTH,
  apiErrorKey,
  isValidEmailInput,
  isValidNameInput,
  passwordProblemKey,
  readApiError,
  roleLabelKey,
} from "./admin-user-ui";

export type ManagedUser = AdminUserSummary & { isSelf: boolean };

type ConfirmKind = "deactivate" | "reactivate" | "toSuper" | "toAdmin";
type OpenDialog =
  | { type: "create" }
  | { type: "name"; user: ManagedUser }
  | { type: "password"; user: ManagedUser }
  | { type: "confirm"; kind: ConfirmKind; user: ManagedUser };
type SaveResult = { ok: true; user: ManagedUser } | { ok: false; error: string; reason?: string; status: number };
type Fill = (key: string, values: Record<string, string>) => string;

// A fixed time zone keeps server and browser rendering the same date.
const DATE_TIME_ZONE = "Europe/Rome";
const ROLES: AdminRoleName[] = ["ADMIN", "SUPERADMIN"];

const rowId = (userId: string) => `user-${userId}`;

const confirmTexts: Record<ConfirmKind, { title: string; text: string; done: string; action: string }> = {
  deactivate: {
    title: "admin.users.deactivateTitle",
    text: "admin.users.deactivateText",
    done: "admin.users.deactivateDone",
    action: "admin.users.deactivate",
  },
  reactivate: {
    title: "admin.users.reactivateTitle",
    text: "admin.users.reactivateText",
    done: "admin.users.reactivateDone",
    action: "admin.users.reactivate",
  },
  toSuper: {
    title: "admin.users.roleTitle",
    text: "admin.users.toSuperText",
    done: "admin.users.roleDone",
    action: "admin.users.makeSuper",
  },
  toAdmin: {
    title: "admin.users.roleTitle",
    text: "admin.users.toAdminText",
    done: "admin.users.roleDone",
    action: "admin.users.makeAdmin",
  },
};

const confirmChanges: Record<ConfirmKind, UpdateAdminUserInput> = {
  deactivate: { active: false },
  reactivate: { active: true },
  toSuper: { role: "SUPERADMIN" },
  toAdmin: { role: "ADMIN" },
};

function roleChipClass(role: AdminRoleName): string {
  return role === "SUPERADMIN" ? "status role-super" : "status draft";
}

export function UserManager({
  initialUsers,
  loadError,
  bootstrap,
}: {
  initialUsers: ManagedUser[];
  loadError: "noDatabase" | "unavailable" | null;
  /** Signed in with the temporary env login, which ends once an account exists. */
  bootstrap: boolean;
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(
    loadError === "noDatabase" ? t("admin.errors.noDatabase") : loadError ? t("admin.users.errorUnavailable") : "",
  );
  const [sessionEnded, setSessionEnded] = useState(false);
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const dateFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: DATE_TIME_ZONE,
  });
  const fill: Fill = (key, values) =>
    Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, value), t(key));
  const hasActiveUsers = users.some((user) => user.active);
  const locked = loadError === "noDatabase" || sessionEnded;

  function open(next: OpenDialog) {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setNotice("");
    setError("");
    setDialog(next);
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  /** Called by the dialog "close" event: unmount it and give focus back. */
  function onDialogClosed() {
    setDialog(null);
    const opener = openerRef.current;
    requestAnimationFrame(() => {
      if (opener?.isConnected && !opener.hasAttribute("disabled")) opener.focus();
      else document.getElementById("users-list-title")?.focus();
    });
  }

  async function reload() {
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as { users?: ManagedUser[] };
      if (Array.isArray(body.users)) setUsers(body.users);
    } catch {
      // Keep the list updated locally; the next action retries.
    }
  }

  function merge(saved: ManagedUser) {
    setUsers((current) =>
      current.some((item) => item.id === saved.id)
        ? current.map((item) => (item.id === saved.id ? saved : item))
        : [...current, saved],
    );
  }

  async function send(url: string, method: "POST" | "PATCH", body: object): Promise<SaveResult> {
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) return { ok: false, status: response.status, ...(await readApiError(response)) };
      return { ok: true, user: (await response.json()) as ManagedUser };
    } catch {
      return { ok: false, status: 0, error: "network" };
    }
  }

  /** Saves changes to a user; returns the message to show in the dialog, or null when done. */
  async function update(user: ManagedUser, changes: UpdateAdminUserInput, doneKey: string): Promise<string | null> {
    const result = await send(`/api/admin/users/${encodeURIComponent(user.id)}`, "PATCH", changes);
    if (!result.ok) {
      if (result.error === "user_not_found") {
        setUsers((current) => current.filter((item) => item.id !== user.id));
        setError(t("admin.users.errorNotFound"));
        closeDialog();
        void reload();
        return null;
      }
      return result.error === "network" ? t("admin.errors.network") : t(apiErrorKey(result, "admin.users.errorSave"));
    }
    merge(result.user);
    setNotice(fill(doneKey, { name: result.user.name }));
    closeDialog();
    if (result.user.isSelf) router.refresh();
    void reload();
    return null;
  }

  /** Creates a user; returns server errors for the dialog, or null when done. */
  async function create(input: { name: string; email: string; role: AdminRoleName; password: string }) {
    const result = await send("/api/admin/users", "POST", input);
    if (!result.ok) return result;
    merge(result.user);
    closeDialog();
    if (bootstrap) {
      // The env login stops working as soon as an account exists.
      setSessionEnded(true);
      setNotice(fill("admin.users.bootstrapDone", { name: result.user.name }));
      return null;
    }
    setNotice(fill("admin.users.createdDone", { name: result.user.name }));
    void reload();
    return null;
  }

  const formatLastLogin = (value: string | null) =>
    value ? <time dateTime={value}>{dateFormat.format(new Date(value))}</time> : t("admin.users.never");

  return (
    <>
      <p className="review-admin-notice" role="status">{notice}</p>
      {sessionEnded && (
        <p className="users-login-link">
          <Link className="btn btn-gold" href="/login">{t("admin.users.goToLogin")}</Link>
        </p>
      )}
      {error && <p className="field-error review-admin-error" role="alert">{error}</p>}

      <section className="admin-card users-panel" aria-labelledby="users-list-title">
        <div className="users-panel-head">
          <div>
            <h2 id="users-list-title" tabIndex={-1}>{t("admin.users.listTitle")}</h2>
            <p>{fill("admin.users.count", { n: String(users.length) })}</p>
          </div>
          <button type="button" className="btn btn-gold" disabled={locked} onClick={() => open({ type: "create" })}>
            <Icon name="plus" size={18} />
            {t("admin.users.add")}
          </button>
        </div>

        {users.length === 0 ? (
          <p className="users-empty">{t("admin.users.empty")}</p>
        ) : (
          <div className="admin-scroll-box users-scroll">
            <ul className="users-list">
              {users.map((user) => {
                const nameId = `${rowId(user.id)}-name`;
                const forUser = <span className="sr-only"> {fill("admin.users.forUser", { name: user.name })}</span>;
                return (
                  <li key={user.id} id={rowId(user.id)} className={user.active ? "user-row" : "user-row user-inactive"}>
                    <div className="user-main">
                      <h3 id={nameId}>
                        {user.name}
                        {user.isSelf && <span className="status user-you">{t("admin.users.you")}</span>}
                      </h3>
                      <p className="user-email">{user.email}</p>
                    </div>
                    <dl className="user-meta">
                      <div>
                        <dt>{t("admin.users.role")}</dt>
                        <dd><span className={roleChipClass(user.role)}>{t(roleLabelKey(user.role))}</span></dd>
                      </div>
                      <div>
                        <dt>{t("admin.users.status")}</dt>
                        <dd>
                          <span className={user.active ? "status published" : "status unavailable"}>
                            {t(user.active ? "admin.users.active" : "admin.users.inactive")}
                          </span>
                        </dd>
                      </div>
                      <div>
                        <dt>{t("admin.users.lastLogin")}</dt>
                        <dd>{formatLastLogin(user.lastLoginAt)}</dd>
                      </div>
                    </dl>
                    <div className="user-actions">
                      <button
                        type="button"
                        className="btn btn-line"
                        disabled={locked}
                        onClick={() => open({ type: "name", user })}
                      >
                        {t("admin.users.editName")}
                        {forUser}
                      </button>
                      {!user.isSelf && (
                        <>
                          <button
                            type="button"
                            className="btn btn-line"
                            disabled={locked}
                            onClick={() => open({ type: "password", user })}
                          >
                            <Icon name="lock" size={16} />
                            {t("admin.users.resetPassword")}
                            {forUser}
                          </button>
                          <button
                            type="button"
                            className="btn btn-line"
                            disabled={locked}
                            onClick={() =>
                              open({ type: "confirm", kind: user.role === "SUPERADMIN" ? "toAdmin" : "toSuper", user })
                            }
                          >
                            {t(user.role === "SUPERADMIN" ? "admin.users.makeAdmin" : "admin.users.makeSuper")}
                            {forUser}
                          </button>
                          <button
                            type="button"
                            className={user.active ? "btn btn-danger" : "btn btn-line"}
                            disabled={locked}
                            onClick={() =>
                              open({ type: "confirm", kind: user.active ? "deactivate" : "reactivate", user })
                            }
                          >
                            {t(user.active ? "admin.users.deactivate" : "admin.users.reactivate")}
                            {forUser}
                          </button>
                        </>
                      )}
                    </div>
                    {user.isSelf && (
                      <p className="user-self-note">
                        {t("admin.users.selfNote")} <Link href="/admin/account">{t("admin.users.goToAccount")}</Link>.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      {dialog?.type === "create" && (
        <CreateUserDialog
          dialogRef={dialogRef}
          defaultRole={hasActiveUsers ? "ADMIN" : "SUPERADMIN"}
          onCreate={create}
          onCancel={closeDialog}
          onClosed={onDialogClosed}
        />
      )}
      {dialog?.type === "name" && (
        <NameDialog
          dialogRef={dialogRef}
          user={dialog.user}
          onSave={(name) => update(dialog.user, { name }, "admin.users.nameDone")}
          onCancel={closeDialog}
          onClosed={onDialogClosed}
        />
      )}
      {dialog?.type === "password" && (
        <ResetPasswordDialog
          dialogRef={dialogRef}
          user={dialog.user}
          fill={fill}
          onSave={(password) => update(dialog.user, { password }, "admin.users.resetDone")}
          onCancel={closeDialog}
          onClosed={onDialogClosed}
        />
      )}
      {dialog?.type === "confirm" && (
        <ConfirmDialog
          dialogRef={dialogRef}
          kind={dialog.kind}
          user={dialog.user}
          fill={fill}
          onConfirm={() =>
            update(dialog.user, confirmChanges[dialog.kind], confirmTexts[dialog.kind].done)
          }
          onCancel={closeDialog}
          onClosed={onDialogClosed}
        />
      )}
    </>
  );
}

/** Modal shell: opens on mount, and cannot be dismissed while saving. */
function UserDialog({
  dialogRef,
  titleId,
  describedBy,
  busy,
  initialFocus,
  onClosed,
  children,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  titleId: string;
  describedBy?: string;
  busy: boolean;
  /** Element focused on open; by default the browser picks the first focusable one. */
  initialFocus?: RefObject<HTMLElement | null>;
  onClosed: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const element = dialogRef.current;
    if (element && !element.open) element.showModal();
    initialFocus?.current?.focus();
  }, [dialogRef, initialFocus]);

  return (
    <dialog
      ref={dialogRef}
      className="admin-dialog user-dialog"
      aria-labelledby={titleId}
      aria-describedby={describedBy}
      onClose={onClosed}
      onCancel={(event) => {
        if (busy) event.preventDefault();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) event.currentTarget.close();
      }}
    >
      {children}
    </dialog>
  );
}

function DialogActions({
  busy,
  submitLabel,
  busyLabel,
  danger = false,
  onCancel,
}: {
  busy: boolean;
  submitLabel: string;
  busyLabel: string;
  danger?: boolean;
  onCancel: () => void;
}) {
  const { t } = useLocale();
  return (
    <div className="dialog-actions">
      <button type="button" className="btn btn-line" onClick={onCancel} disabled={busy}>
        {t("admin.users.cancel")}
      </button>
      <button type="submit" className={danger ? "btn btn-danger" : "btn btn-gold"} disabled={busy} aria-busy={busy}>
        {busy ? busyLabel : submitLabel}
      </button>
    </div>
  );
}

type CreateField = "name" | "email" | "password" | "repeat";

function CreateUserDialog({
  dialogRef,
  defaultRole,
  onCreate,
  onCancel,
  onClosed,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  defaultRole: AdminRoleName;
  onCreate: (input: { name: string; email: string; role: AdminRoleName; password: string }) => Promise<
    { ok: false; error: string; reason?: string } | null
  >;
  onCancel: () => void;
  onClosed: () => void;
}) {
  const { t } = useLocale();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRoleName>(defaultRole);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [errors, setErrors] = useState<Partial<Record<CreateField, string>>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const repeatRef = useRef<HTMLInputElement>(null);

  function focusField(field: CreateField) {
    const target = { name: nameRef, email: emailRef, password: passwordRef, repeat: repeatRef }[field];
    target.current?.focus();
  }

  function clearField(field: CreateField) {
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setFormError("");
    const found: Partial<Record<CreateField, string>> = {};
    if (!isValidNameInput(name)) found.name = t("admin.users.errorName");
    if (!isValidEmailInput(email)) found.email = t("admin.users.errorEmail");
    const problem = passwordProblemKey(password, email);
    if (problem) found.password = t(problem);
    else if (password !== repeat) found.repeat = t("admin.password.mismatch");
    setErrors(found);
    const firstInvalid = (["name", "email", "password", "repeat"] as const).find((field) => found[field]);
    if (firstInvalid) return focusField(firstInvalid);

    setBusy(true);
    const result = await onCreate({ name: name.trim(), email: email.trim(), role, password });
    setBusy(false);
    if (!result) return;
    if (result.error === "network") return setFormError(t("admin.errors.network"));
    if (result.error === "email_in_use") {
      setErrors({ email: t("admin.users.errorEmailInUse") });
      return focusField("email");
    }
    if (result.error === "weak_password") {
      setErrors({ password: t(apiErrorKey(result, "admin.password.tooShort")) });
      return focusField("password");
    }
    setFormError(
      t(result.error === "last_superadmin" ? "admin.users.errorFirstSuper" : apiErrorKey(result, "admin.users.errorSave")),
    );
  }

  return (
    <UserDialog
      dialogRef={dialogRef}
      titleId="create-user-title"
      describedBy="create-user-text"
      busy={busy}
      initialFocus={nameRef}
      onClosed={onClosed}
    >
      <form onSubmit={(event) => void submit(event)} noValidate aria-busy={busy}>
        <h2 id="create-user-title">{t("admin.users.createTitle")}</h2>
        <p id="create-user-text">{t("admin.users.createText")}</p>
        <label htmlFor="create-user-name">{t("admin.users.name")}</label>
        <input
          ref={nameRef}
          id="create-user-name"
          value={name}
          maxLength={NAME_MAX_LENGTH}
          autoComplete="off"
          required
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? "create-user-name-error" : undefined}
          onChange={(event) => {
            setName(event.target.value);
            clearField("name");
          }}
        />
        {errors.name && <span className="field-error settings-field-error" id="create-user-name-error">{errors.name}</span>}
        <label htmlFor="create-user-email">{t("admin.users.email")}</label>
        <input
          ref={emailRef}
          id="create-user-email"
          type="email"
          inputMode="email"
          value={email}
          maxLength={254}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          required
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "create-user-email-error" : undefined}
          onChange={(event) => {
            setEmail(event.target.value);
            clearField("email");
          }}
        />
        {errors.email && <span className="field-error settings-field-error" id="create-user-email-error">{errors.email}</span>}
        <label htmlFor="create-user-role">{t("admin.users.role")}</label>
        <select
          id="create-user-role"
          value={role}
          onChange={(event) => setRole(event.target.value === "SUPERADMIN" ? "SUPERADMIN" : "ADMIN")}
        >
          {ROLES.map((item) => (
            <option key={item} value={item}>{t(roleLabelKey(item))}</option>
          ))}
        </select>
        <PasswordInput
          id="create-user-password"
          label={t("admin.users.password")}
          autoComplete="new-password"
          value={password}
          onChange={(value) => {
            setPassword(value);
            clearField("password");
          }}
          hint={t("admin.password.hint")}
          error={errors.password}
          inputRef={passwordRef}
        />
        <PasswordInput
          id="create-user-repeat"
          label={t("admin.users.repeatPassword")}
          autoComplete="new-password"
          value={repeat}
          onChange={(value) => {
            setRepeat(value);
            clearField("repeat");
          }}
          error={errors.repeat}
          inputRef={repeatRef}
        />
        {formError && <p className="field-error" role="alert">{formError}</p>}
        <DialogActions
          busy={busy}
          submitLabel={t("admin.users.create")}
          busyLabel={t("admin.users.creating")}
          onCancel={onCancel}
        />
      </form>
    </UserDialog>
  );
}

function NameDialog({
  dialogRef,
  user,
  onSave,
  onCancel,
  onClosed,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  user: ManagedUser;
  onSave: (name: string) => Promise<string | null>;
  onCancel: () => void;
  onClosed: () => void;
}) {
  const { t } = useLocale();
  const [name, setName] = useState(user.name);
  const [fieldError, setFieldError] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setFormError("");
    if (!isValidNameInput(name)) {
      setFieldError(t("admin.users.errorName"));
      return inputRef.current?.focus();
    }
    setBusy(true);
    const message = await onSave(name.trim());
    setBusy(false);
    if (message) setFormError(message);
  }

  return (
    <UserDialog
      dialogRef={dialogRef}
      titleId="name-user-title"
      describedBy="name-user-text"
      busy={busy}
      initialFocus={inputRef}
      onClosed={onClosed}
    >
      <form onSubmit={(event) => void submit(event)} noValidate aria-busy={busy}>
        <h2 id="name-user-title">{t("admin.users.nameTitle")}</h2>
        <p id="name-user-text">{t("admin.users.nameText")}</p>
        <label htmlFor="name-user-input">{t("admin.users.name")}</label>
        <input
          ref={inputRef}
          id="name-user-input"
          value={name}
          maxLength={NAME_MAX_LENGTH}
          autoComplete="off"
          required
          aria-invalid={Boolean(fieldError)}
          aria-describedby={fieldError ? "name-user-error" : undefined}
          onChange={(event) => {
            setName(event.target.value);
            setFieldError("");
          }}
        />
        {fieldError && <span className="field-error settings-field-error" id="name-user-error">{fieldError}</span>}
        {formError && <p className="field-error" role="alert">{formError}</p>}
        <DialogActions
          busy={busy}
          submitLabel={t("admin.users.save")}
          busyLabel={t("admin.users.saving")}
          onCancel={onCancel}
        />
      </form>
    </UserDialog>
  );
}

function ResetPasswordDialog({
  dialogRef,
  user,
  fill,
  onSave,
  onCancel,
  onClosed,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  user: ManagedUser;
  fill: Fill;
  onSave: (password: string) => Promise<string | null>;
  onCancel: () => void;
  onClosed: () => void;
}) {
  const { t } = useLocale();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [errors, setErrors] = useState<{ password?: string; repeat?: string }>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const repeatRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setFormError("");
    const problem = passwordProblemKey(password, user.email);
    if (problem) {
      setErrors({ password: t(problem) });
      return passwordRef.current?.focus();
    }
    if (password !== repeat) {
      setErrors({ repeat: t("admin.password.mismatch") });
      return repeatRef.current?.focus();
    }
    setErrors({});
    setBusy(true);
    const message = await onSave(password);
    setBusy(false);
    if (message) setFormError(message);
  }

  return (
    <UserDialog
      dialogRef={dialogRef}
      titleId="reset-user-title"
      describedBy="reset-user-text"
      busy={busy}
      initialFocus={passwordRef}
      onClosed={onClosed}
    >
      <form onSubmit={(event) => void submit(event)} noValidate aria-busy={busy}>
        <h2 id="reset-user-title">{t("admin.users.resetTitle")}</h2>
        <p className="user-dialog-target">
          <b>{user.name}</b> · {user.email}
        </p>
        <p id="reset-user-text">{fill("admin.users.resetText", { name: user.name })}</p>
        <PasswordInput
          id="reset-user-password"
          label={t("admin.account.newPassword")}
          autoComplete="new-password"
          value={password}
          onChange={(value) => {
            setPassword(value);
            setErrors((current) => ({ ...current, password: undefined }));
          }}
          hint={t("admin.password.hint")}
          error={errors.password}
          inputRef={passwordRef}
        />
        <PasswordInput
          id="reset-user-repeat"
          label={t("admin.account.repeatPassword")}
          autoComplete="new-password"
          value={repeat}
          onChange={(value) => {
            setRepeat(value);
            setErrors((current) => ({ ...current, repeat: undefined }));
          }}
          error={errors.repeat}
          inputRef={repeatRef}
        />
        {formError && <p className="field-error" role="alert">{formError}</p>}
        <DialogActions
          busy={busy}
          submitLabel={t("admin.users.resetConfirm")}
          busyLabel={t("admin.users.resetting")}
          onCancel={onCancel}
        />
      </form>
    </UserDialog>
  );
}

function ConfirmDialog({
  dialogRef,
  kind,
  user,
  fill,
  onConfirm,
  onCancel,
  onClosed,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  kind: ConfirmKind;
  user: ManagedUser;
  fill: Fill;
  onConfirm: () => Promise<string | null>;
  onCancel: () => void;
  onClosed: () => void;
}) {
  const { t } = useLocale();
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const texts = confirmTexts[kind];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setFormError("");
    setBusy(true);
    const message = await onConfirm();
    setBusy(false);
    if (message) setFormError(message);
  }

  return (
    <UserDialog
      dialogRef={dialogRef}
      titleId="confirm-user-title"
      describedBy="confirm-user-text"
      busy={busy}
      onClosed={onClosed}
    >
      <form onSubmit={(event) => void submit(event)} aria-busy={busy}>
        <h2 id="confirm-user-title">{t(texts.title)}</h2>
        <p className="user-dialog-target">
          <b>{user.name}</b> · {user.email}
        </p>
        <p id="confirm-user-text">{fill(texts.text, { name: user.name })}</p>
        {formError && <p className="field-error" role="alert">{formError}</p>}
        <DialogActions
          busy={busy}
          submitLabel={t(texts.action)}
          busyLabel={t("admin.users.working")}
          danger={kind === "deactivate"}
          onCancel={onCancel}
        />
      </form>
    </UserDialog>
  );
}
