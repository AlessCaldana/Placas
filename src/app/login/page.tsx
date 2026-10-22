"use client";

import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import "@fontsource/shrikhand/latin-400.css";
import { BrandSeal } from "@/components/ui/BrandSeal";
import { Icon } from "@/components/ui/Icon";
import { useLocale } from "@/components/ui/LocaleProvider";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const { t } = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    if (!response?.ok) {
      setBusy(false);
      let errorKey = "login.networkError";
      if (response?.status === 503) {
        const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
        errorKey = body?.error === "auth_unavailable" ? "login.unavailable" : "login.notConfigured";
      } else if (response?.status === 429) {
        errorKey = "login.tooManyAttempts";
      } else if (response) {
        errorKey = "login.invalid";
      }
      setError(t(errorKey));
      return;
    }
    const requestedPath = searchParams.get("next");
    const next = requestedPath?.startsWith("/admin/") ? requestedPath : "/admin/dashboard";
    // Full navigation: router.replace() followed by router.refresh() could
    // re-render /login instead and leave the user on the form. The button stays
    // busy until the panel loads.
    window.location.replace(next);
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-head">
          <BrandSeal size={104} variant="full" />
          <span className="login-eyebrow">{t("login.eyebrow")}</span>
          <h1>{t("login.title")}</h1>
          <p>{t("login.text")}</p>
        </div>
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
        <div className="password-wrap">
          <input
            id="admin-password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button
            type="button"
            className="password-toggle"
            aria-controls="admin-password"
            aria-label={t(showPassword ? "admin.password.hide" : "admin.password.show")}
            title={t(showPassword ? "admin.password.hide" : "admin.password.show")}
            onClick={() => setShowPassword((current) => !current)}
          >
            <Icon name={showPassword ? "eyeOff" : "eye"} size={19} />
          </button>
        </div>
        {error && <p className="login-error" role="alert">{error}</p>}
        <button type="submit" className="login-submit" disabled={busy}>
          {busy ? t("login.submitting") : t("login.submit")}
        </button>
      </form>
      {/* Anni '70: fondo marrón con una franja de atardecer (mostaza, naranja, rojo, burdeos) detrás de la tarjeta. */}
      <style jsx>{`
        .login-page {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 32px 16px;
          background:
            linear-gradient(
              to bottom,
              transparent 0 calc(50% - 34px),
              #e0a526 calc(50% - 34px) calc(50% - 22px),
              transparent 0 calc(50% - 16px),
              #e8833a calc(50% - 16px) calc(50% - 4px),
              transparent 0 calc(50% + 2px),
              #a5523e calc(50% + 2px) calc(50% + 14px),
              transparent 0 calc(50% + 20px),
              #7a2230 calc(50% + 20px) calc(50% + 32px),
              transparent 0
            ),
            #3d2216;
          color: #3d2216;
        }
        .login-card {
          width: min(100%, 420px);
          display: grid;
          gap: 12px;
          padding: 30px 34px 34px;
          border: 2px solid #3d2216;
          border-radius: 14px;
          background: #fffdf7;
          box-shadow: 8px 8px 0 #1e0f08;
        }
        .login-head {
          display: grid;
          justify-items: center;
          gap: 8px;
          margin-bottom: 8px;
          text-align: center;
        }
        .login-head :global(.brand-seal) {
          margin-bottom: 4px;
        }
        .login-eyebrow {
          color: #9a4a36;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.16em;
        }
        h1 {
          margin: 0;
          color: #3d2216;
          font-family: "Shrikhand", "Cooper Black", Georgia, serif;
          font-size: 30px;
          font-weight: 400;
          line-height: 1.15;
          letter-spacing: 0;
        }
        .login-head p {
          margin: 0;
          color: #6e5643;
          font-size: 15px;
          line-height: 1.5;
        }
        label {
          margin-top: 4px;
          color: #3d2216;
          font-size: 14px;
          font-weight: 700;
        }
        input {
          width: 100%;
          min-height: 48px;
          padding: 12px 14px;
          border: 1px solid #a88b62;
          border-radius: 8px;
          background: #fffefb;
          color: #3d2216;
          font: inherit;
          font-size: 16px;
        }
        .login-card :focus-visible {
          outline: 2px solid #a5523e;
          outline-offset: 2px;
        }
        input:focus-visible {
          border-color: #3d2216;
          outline-offset: 1px;
          box-shadow: 0 0 0 5px #e0a52666;
        }
        .login-submit {
          margin-top: 10px;
          min-height: 50px;
          padding: 12px;
          border: 2px solid #3d2216;
          border-radius: 10px;
          background: #e0a526;
          color: #3d2216;
          box-shadow: 4px 4px 0 #3d2216;
          font: inherit;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          transition: transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
        }
        .login-submit:hover:not(:disabled) {
          background: #f5bd45;
          transform: translate(-1px, -1px);
          box-shadow: 5px 5px 0 #3d2216;
        }
        .login-submit:active:not(:disabled) {
          transform: translate(2px, 2px);
          box-shadow: 2px 2px 0 #3d2216;
        }
        .login-submit:disabled {
          opacity: 0.7;
          cursor: wait;
        }
        .password-wrap {
          position: relative;
        }
        .password-wrap input {
          padding-right: 52px;
        }
        .password-toggle {
          position: absolute;
          top: 50%;
          right: 5px;
          width: 40px;
          height: 40px;
          padding: 0;
          display: grid;
          place-items: center;
          transform: translateY(-50%);
          border: 0;
          border-radius: 6px;
          background: transparent;
          color: #6e5643;
          cursor: pointer;
        }
        .password-toggle:hover,
        .password-toggle:focus-visible {
          background: #f1e6cf;
          color: #3d2216;
        }
        .login-card .login-error {
          margin: 0;
          padding: 10px 12px;
          border-left: 4px solid #b42318;
          border-radius: 6px;
          background: #fff0ee;
          color: #8c1d16;
          font-size: 14px;
          font-weight: 700;
        }
        @media (max-width: 480px) {
          .login-card {
            padding: 24px 20px 28px;
            box-shadow: 6px 6px 0 #1e0f08;
          }
          h1 {
            font-size: 26px;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .login-submit {
            transition: none;
          }
          .login-submit:hover:not(:disabled),
          .login-submit:active:not(:disabled) {
            transform: none;
          }
        }
      `}</style>
    </main>
  );
}
