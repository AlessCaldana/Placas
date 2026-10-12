"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { useLocale } from "@/components/ui/LocaleProvider";

// Same limits as src/lib/validators/review.ts, checked here to warn early.
const NAME_MAX = 60;
const COMMENT_MIN = 10;
const COMMENT_MAX = 1000;
const PERSON_NAME = /^[\p{L} '’-]+$/u;
const HAS_LETTER = /\p{L}/u;
const RATINGS = [1, 2, 3, 4, 5] as const;

type Field = "firstName" | "lastName" | "rating" | "comment";
type FieldErrors = Partial<Record<Field, string>>;
type ReviewState = "can_review" | "already_reviewed";

const apiErrorKeys: Record<string, string> = {
  invalid_review: "review.errorInvalid",
  not_allowed: "review.errorNotAllowed",
  already_reviewed: "review.errorAlready",
  too_many_requests: "review.errorTooMany",
};

function normalizeName(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ");
}

function normalizeComment(value: string): string {
  return value.normalize("NFC").replace(/\r\n?/g, "\n").replace(/[^\S\n]+/g, " ").trim();
}

/** Block shown under the "thank you" message of a paid order. */
export function ReviewInvite({
  sessionId,
  initialState,
}: {
  sessionId: string;
  initialState: ReviewState;
}) {
  const { t } = useLocale();
  const [state, setState] = useState<ReviewState>(initialState);
  const [open, setOpen] = useState(false);
  const receivedRef = useRef<HTMLParagraphElement>(null);

  return (
    <div className="review-invite">
      {state === "can_review" ? (
        <>
          <p className="review-invite-text">{t("review.invite")}</p>
          <button type="button" className="btn btn-dark review-invite-button" onClick={() => setOpen(true)}>
            {t("review.open")}
            <Icon name="chat" size={18} />
          </button>
        </>
      ) : (
        <p className="review-invite-text" ref={receivedRef} tabIndex={-1}>{t("review.received")}</p>
      )}
      {initialState === "can_review" && (
        <ReviewDialog
          open={open}
          sessionId={sessionId}
          onClose={() => {
            setOpen(false);
            // The opener button is gone once the review is sent: keep focus in the page.
            if (state !== "can_review") requestAnimationFrame(() => receivedRef.current?.focus());
          }}
          onReviewed={() => setState("already_reviewed")}
        />
      )}
    </div>
  );
}

export function ReviewDialog({
  open,
  sessionId,
  onClose,
  onReviewed,
}: {
  open: boolean;
  sessionId: string;
  onClose: () => void;
  onReviewed: () => void;
}) {
  const { t } = useLocale();
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const firstStarRef = useRef<HTMLInputElement>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const doneButtonRef = useRef<HTMLButtonElement>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [validateOnChange, setValidateOnChange] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // showModal focuses the close button first; the form starts at "Nome".
      firstNameRef.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (sent) doneButtonRef.current?.focus();
  }, [sent]);

  const validate = (values: { firstName: string; lastName: string; rating: number; comment: string }) => {
    const next: FieldErrors = {};
    const nameError = (value: string, requiredKey: string) => {
      const name = normalizeName(value);
      if (!name) return t(requiredKey);
      if (name.length > NAME_MAX || !PERSON_NAME.test(name) || !HAS_LETTER.test(name)) {
        return t("review.errorNameInvalid");
      }
      return undefined;
    };
    next.firstName = nameError(values.firstName, "review.errorFirstNameRequired");
    next.lastName = nameError(values.lastName, "review.errorLastNameRequired");
    if (!Number.isInteger(values.rating) || values.rating < 1 || values.rating > 5) {
      next.rating = t("review.errorRating");
    }
    const text = normalizeComment(values.comment);
    if (text.length < COMMENT_MIN) next.comment = t("review.errorCommentShort");
    else if (text.length > COMMENT_MAX) next.comment = t("review.errorCommentLong");
    return Object.fromEntries(Object.entries(next).filter(([, value]) => value)) as FieldErrors;
  };

  const update = (field: Field, value: string | number) => {
    const values = { firstName, lastName, rating, comment, [field]: value };
    if (field === "firstName") setFirstName(value as string);
    if (field === "lastName") setLastName(value as string);
    if (field === "rating") setRating(value as number);
    if (field === "comment") setComment(value as string);
    if (validateOnChange) setErrors(validate(values));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || blocked) return;
    const nextErrors = validate({ firstName, lastName, rating, comment });
    setErrors(nextErrors);
    setValidateOnChange(true);
    setFormError("");
    if (Object.keys(nextErrors).length > 0) {
      if (nextErrors.firstName) firstNameRef.current?.focus();
      else if (nextErrors.lastName) lastNameRef.current?.focus();
      else if (nextErrors.rating) firstStarRef.current?.focus();
      else commentRef.current?.focus();
      return;
    }

    setSubmitting(true);
    const response = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        firstName: normalizeName(firstName),
        lastName: normalizeName(lastName),
        rating,
        comment: normalizeComment(comment),
      }),
    }).catch(() => null);
    const result = (await response?.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    setSubmitting(false);

    if (response?.ok) {
      setSent(true);
      onReviewed();
      return;
    }
    const code = result?.error ?? "";
    if (code === "already_reviewed" || code === "not_allowed") {
      setBlocked(true);
      if (code === "already_reviewed") onReviewed();
    }
    setFormError(t(apiErrorKeys[code] ?? "review.errorGeneric"));
  };

  const starLabel = (value: number) =>
    value === 1 ? t("review.starOne") : t("review.starMany").replace("{n}", String(value));
  const shownRating = hoverRating || rating;
  const errorId = (field: Field) => `${id}-${field}-error`;
  const describedBy = (field: Field, ...extra: string[]) =>
    [...extra, errors[field] ? errorId(field) : ""].filter(Boolean).join(" ") || undefined;
  const titleId = `${id}-title`;

  return (
    <dialog
      ref={dialogRef}
      className="review-dialog"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <div className="review-dialog-body">
        <div className="review-dialog-header">
          <h2 id={titleId}>{t("review.title")}</h2>
          <button
            type="button"
            className="review-dialog-close"
            onClick={() => dialogRef.current?.close()}
            aria-label={t("review.closeDialog")}
          >
            ×
          </button>
        </div>

        {sent ? (
          <div className="review-dialog-success">
            <span className="review-dialog-success-icon" aria-hidden="true">★</span>
            <p id={`${id}-success`}>{t("review.success")}</p>
            <button
              type="button"
              className="btn btn-dark"
              ref={doneButtonRef}
              aria-describedby={`${id}-success`}
              onClick={() => dialogRef.current?.close()}
            >
              {t("review.close")}
            </button>
          </div>
        ) : (
          <form className="review-form" noValidate onSubmit={submit}>
            <div className="review-name-row">
              <div className="review-field">
                <label htmlFor={`${id}-first-name`}>{t("review.firstName")}</label>
                <input
                  id={`${id}-first-name`}
                  ref={firstNameRef}
                  type="text"
                  name="firstName"
                  autoComplete="given-name"
                  maxLength={NAME_MAX}
                  required
                  value={firstName}
                  onChange={(event) => update("firstName", event.target.value)}
                  aria-invalid={errors.firstName ? true : undefined}
                  aria-describedby={describedBy("firstName")}
                />
                {errors.firstName && <p className="review-field-error" id={errorId("firstName")}>{errors.firstName}</p>}
              </div>
              <div className="review-field">
                <label htmlFor={`${id}-last-name`}>{t("review.lastName")}</label>
                <input
                  id={`${id}-last-name`}
                  ref={lastNameRef}
                  type="text"
                  name="lastName"
                  autoComplete="family-name"
                  maxLength={NAME_MAX}
                  required
                  value={lastName}
                  onChange={(event) => update("lastName", event.target.value)}
                  aria-invalid={errors.lastName ? true : undefined}
                  aria-describedby={describedBy("lastName")}
                />
                {errors.lastName && <p className="review-field-error" id={errorId("lastName")}>{errors.lastName}</p>}
              </div>
            </div>

            <fieldset className="review-field review-rating" aria-describedby={describedBy("rating")}>
              <legend>{t("review.rating")}</legend>
              <div className={errors.rating ? "review-stars-input is-invalid" : "review-stars-input"} onMouseLeave={() => setHoverRating(0)}>
                {RATINGS.map((value) => (
                  <span className="review-star-option" key={value}>
                    <input
                      id={`${id}-star-${value}`}
                      ref={value === 1 ? firstStarRef : undefined}
                      className="review-star-radio"
                      type="radio"
                      name="rating"
                      value={value}
                      checked={rating === value}
                      onChange={() => update("rating", value)}
                    />
                    <label
                      htmlFor={`${id}-star-${value}`}
                      className={value <= shownRating ? "review-star is-filled" : "review-star"}
                      onMouseEnter={() => setHoverRating(value)}
                    >
                      <span aria-hidden="true">{value <= shownRating ? "★" : "☆"}</span>
                      <span className="review-sr-only">{starLabel(value)}</span>
                    </label>
                  </span>
                ))}
              </div>
              {errors.rating && <p className="review-field-error" id={errorId("rating")}>{errors.rating}</p>}
            </fieldset>

            <div className="review-field">
              <div className="review-comment-label">
                <label htmlFor={`${id}-comment`}>{t("review.comment")}</label>
                <span className="review-counter" aria-hidden="true">
                  {t("review.commentCount").replace("{n}", String(comment.length)).replace("{max}", String(COMMENT_MAX))}
                </span>
              </div>
              <textarea
                id={`${id}-comment`}
                ref={commentRef}
                name="comment"
                rows={5}
                maxLength={COMMENT_MAX}
                required
                value={comment}
                onChange={(event) => update("comment", event.target.value)}
                aria-invalid={errors.comment ? true : undefined}
                aria-describedby={describedBy("comment", `${id}-comment-hint`)}
              />
              <p className="review-hint" id={`${id}-comment-hint`}>{t("review.commentHint")}</p>
              {errors.comment && <p className="review-field-error" id={errorId("comment")}>{errors.comment}</p>}
            </div>

            <p className="review-note">{t("review.note")}</p>
            {formError && <p className="cart-checkout-error review-form-error" role="alert">{formError}</p>}
            <button className="review-submit" type="submit" disabled={blocked} aria-busy={submitting}>
              {submitting ? <span className="cart-spinner" aria-hidden="true" /> : <Icon name="chat" size={18} />}
              <span>{t(submitting ? "review.submitting" : "review.submit")}</span>
            </button>
          </form>
        )}
      </div>
    </dialog>
  );
}
