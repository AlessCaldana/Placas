"use client";

import { useId, useRef, useState, type FormEvent, type RefObject } from "react";
import { CopyButton } from "@/components/ui/CopyButton";
import { Icon } from "@/components/ui/Icon";
import { useLocale } from "@/components/ui/LocaleProvider";
import type { PublicTracking } from "@/lib/services/shipments";
import { findCarrier } from "@/lib/shipping-carriers";

type Field = "orderNumber" | "email";
type FieldErrors = Partial<Record<Field, string>>;
type StepState = "done" | "current" | "pending";

// Same rules as src/lib/order-number.ts and src/lib/validators/shipment.ts, checked here to warn early.
const TYPED_ORDER_NUMBER = /^(?:PL[-\s]?)?([0-9A-Z]{6})$/;
const EMAIL = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
const EMAIL_MAX = 254;
// A fixed time zone keeps server and browser rendering the same date.
const DATE_TIME_ZONE = "Europe/Rome";
const OTHER_CARRIER_NAME = findCarrier("other")?.name;

const apiErrorKeys: Record<string, string> = {
  not_found: "track.errorNotFound",
  invalid_request: "track.errorInvalid",
  too_many_requests: "track.errorTooMany",
};

function normalizeOrderNumber(value: string): string | null {
  const match = TYPED_ORDER_NUMBER.exec(value.trim().toUpperCase());
  return match ? `PL-${match[1]}` : null;
}

export function OrderTracking({ initialOrderNumber }: { initialOrderNumber: string }) {
  const { t, locale } = useLocale();
  const id = useId();
  const [orderNumber, setOrderNumber] = useState(initialOrderNumber);
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PublicTracking | null>(null);
  const orderNumberRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const resultTitleRef = useRef<HTMLHeadingElement>(null);

  const fieldId = (field: Field) => `${id}-${field}`;
  const errorId = (field: Field) => `${id}-${field}-error`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const normalizedNumber = normalizeOrderNumber(orderNumber);
    const trimmedEmail = email.trim();
    const found: FieldErrors = {};
    if (!normalizedNumber) found.orderNumber = t("track.errorOrderNumber");
    if (!trimmedEmail || trimmedEmail.length > EMAIL_MAX || !EMAIL.test(trimmedEmail)) {
      found.email = t("track.errorEmail");
    }
    setErrors(found);
    setFormError("");
    if (found.orderNumber) return orderNumberRef.current?.focus();
    if (found.email) return emailRef.current?.focus();

    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/orders/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber: normalizedNumber, email: trimmedEmail }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setFormError(t(apiErrorKeys[body.error ?? ""] ?? "track.errorGeneric"));
        return;
      }
      const tracking = (await response.json()) as PublicTracking;
      if (normalizedNumber) setOrderNumber(normalizedNumber);
      setResult(tracking);
      requestAnimationFrame(() => resultTitleRef.current?.focus());
    } catch {
      setFormError(t("track.errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="track-layout">
      <form className="track-form" onSubmit={(event) => void submit(event)} noValidate aria-busy={loading}>
        <div className="track-field">
          <label htmlFor={fieldId("orderNumber")}>{t("track.orderNumber")}</label>
          <input
            ref={orderNumberRef}
            id={fieldId("orderNumber")}
            type="text"
            value={orderNumber}
            placeholder="PL-XXXXXX"
            maxLength={32}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            required
            aria-invalid={Boolean(errors.orderNumber)}
            aria-describedby={errors.orderNumber ? errorId("orderNumber") : undefined}
            onChange={(event) => {
              setOrderNumber(event.target.value);
              setErrors((current) => ({ ...current, orderNumber: undefined }));
            }}
          />
          {errors.orderNumber && (
            <p className="track-field-error" id={errorId("orderNumber")}>{errors.orderNumber}</p>
          )}
        </div>
        <div className="track-field">
          <label htmlFor={fieldId("email")}>{t("track.email")}</label>
          <input
            ref={emailRef}
            id={fieldId("email")}
            type="email"
            value={email}
            maxLength={EMAIL_MAX}
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
            required
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? errorId("email") : undefined}
            onChange={(event) => {
              setEmail(event.target.value);
              setErrors((current) => ({ ...current, email: undefined }));
            }}
          />
          {errors.email && <p className="track-field-error" id={errorId("email")}>{errors.email}</p>}
        </div>
        <button type="submit" className="track-submit" disabled={loading} aria-busy={loading}>
          <Icon name="search" size={18} />
          {t(loading ? "track.searching" : "track.submit")}
        </button>
        {formError && <p className="track-form-error" role="alert">{formError}</p>}
      </form>

      {result && <TrackingResult tracking={result} locale={locale} titleRef={resultTitleRef} />}
    </div>
  );
}

function TrackingResult({
  tracking,
  locale,
  titleRef,
}: {
  tracking: PublicTracking;
  locale: string;
  titleRef: RefObject<HTMLHeadingElement | null>;
}) {
  const { t } = useLocale();
  const shipped = tracking.status === "shipped";
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: DATE_TIME_ZONE });
  const formatDate = (value: string | null) => (value ? dateFormat.format(new Date(value)) : null);
  const carrierName =
    tracking.carrierName && tracking.carrierName === OTHER_CARRIER_NAME
      ? t("track.carrierOther")
      : tracking.carrierName;

  const steps: { key: string; title: string; text: string | null; date: string | null; state: StepState }[] = [
    {
      key: "paid",
      title: t("track.stepPaid"),
      text: null,
      date: tracking.paidAt,
      state: "done",
    },
    {
      key: "preparing",
      title: t("track.stepPreparing"),
      text: shipped ? null : t("track.stepPreparingText"),
      date: null,
      state: shipped ? "done" : "current",
    },
    {
      key: "shipped",
      title: t("track.stepShipped"),
      text: shipped ? null : t("track.stepShippedPending"),
      date: tracking.shippedAt,
      state: shipped ? "done" : "pending",
    },
  ];
  // The step the order has reached: the last one that is done or in progress.
  const currentKey = shipped ? "shipped" : "preparing";
  const stateLabels: Record<StepState, string> = {
    done: t("track.stepDone"),
    current: t("track.stepCurrent"),
    pending: t("track.stepPending"),
  };

  return (
    <article className="track-result" aria-labelledby="track-result-title">
      <header className="track-result-head">
        <div>
          <small>{t("track.orderLabel")}</small>
          <h2 id="track-result-title" ref={titleRef} tabIndex={-1}>{tracking.orderNumber}</h2>
        </div>
        <span className={shipped ? "track-status is-shipped" : "track-status"}>
          <Icon name={shipped ? "truck" : "box"} size={17} />
          {t(shipped ? "track.statusShipped" : "track.statusPreparing")}
        </span>
      </header>

      <ol className="track-timeline" aria-label={t("track.progress")}>
        {steps.map((step) => {
          const date = formatDate(step.date);
          return (
            <li
              key={step.key}
              className={`track-step is-${step.state}`}
              aria-current={step.key === currentKey ? "step" : undefined}
            >
              <span className="track-step-marker" aria-hidden="true">
                {step.state === "done" && <Icon name="check" size={16} />}
              </span>
              <div className="track-step-copy">
                <b>
                  {step.title}
                  <span className="sr-only"> — {stateLabels[step.state]}</span>
                </b>
                {date && step.date && <time dateTime={step.date}>{date}</time>}
                {step.text && <span>{step.text}</span>}
              </div>
            </li>
          );
        })}
      </ol>

      {shipped && (
        <section className="track-shipping" aria-labelledby="track-shipping-title">
          <h3 id="track-shipping-title" className="sr-only">{t("track.shippingDetails")}</h3>
          <dl>
            <div>
              <dt>{t("track.carrier")}</dt>
              <dd>{carrierName ?? "—"}</dd>
            </div>
            {tracking.trackingNumber && (
              <div>
                <dt>{t("track.trackingNumber")}</dt>
                <dd className="track-code-row">
                  <span className="track-code">{tracking.trackingNumber}</span>
                  <CopyButton
                    text={tracking.trackingNumber}
                    label={t("track.copyCode")}
                    className="track-copy"
                  />
                </dd>
              </div>
            )}
          </dl>
          {tracking.trackingUrl ? (
            <a className="track-follow" href={tracking.trackingUrl} target="_blank" rel="noopener noreferrer">
              {t("track.follow")}
              <span className="sr-only"> {t("track.newTab")}</span>
              <Icon name="arrow" size={19} />
            </a>
          ) : (
            <p className="track-no-link">{t("track.noLink")}</p>
          )}
        </section>
      )}

      <section className="track-items" aria-labelledby="track-items-title">
        <h3 id="track-items-title">{t("track.products")}</h3>
        <ul>
          {tracking.items.map((item, index) => (
            <li key={`${item.name}-${index}`}>
              <span className="track-qty">{item.quantity} ×</span>
              <span>{item.name}</span>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
