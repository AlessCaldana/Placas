"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "@/components/ui/LocaleProvider";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      const errorKey = response?.status === 503
        ? "login.notConfigured"
        : response?.status === 429
          ? "login.tooManyAttempts"
          : response
            ? "login.invalid"
            : "login.networkError";
      setError(t(errorKey));
      return;
    }
    const requestedPath = searchParams.get("next");
    const next = requestedPath?.startsWith("/admin/") ? requestedPath : "/admin/dashboard";
    router.replace(next);
    router.refresh();
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <span className="login-eyebrow">{t("login.eyebrow")}</span>
        <h1>{t("login.title")}</h1>
        <p>{t("login.text")}</p>
        <label htmlFor="admin-email">{t("login.email")}</label>
        <input
          id="admin-email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <label htmlFor="admin-password">{t("login.password")}</label>
        <input
          id="admin-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error && <p className="login-error" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? t("login.submitting") : t("login.submit")}</button>
      </form>
      <style jsx>{`
        .login-page { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #f5f2ec; }
        .login-card { width: min(100%, 420px); display: grid; gap: 14px; padding: 36px; border: 1px solid #e7e0d4; border-radius: 16px; background: white; box-shadow: 0 18px 50px #34271912; }
        .login-eyebrow { color: #9a7849; font-size: 12px; font-weight: 700; letter-spacing: .14em; }
        h1 { margin: 0; color: #26231f; font-size: 30px; }
        .login-card p { margin: 0 0 8px; color: #706a62; }
        label { color: #39342e; font-size: 14px; font-weight: 600; }
        input { width: 100%; padding: 12px 14px; border: 1px solid #d9d1c5; border-radius: 8px; font: inherit; }
        button { padding: 13px; border: 0; border-radius: 8px; background: #27241f; color: white; font: inherit; font-weight: 600; cursor: pointer; }
        button:disabled { opacity: .65; cursor: wait; }
        .login-card .login-error { color: #a33124; font-size: 14px; }
      `}</style>
    </main>
  );
}
