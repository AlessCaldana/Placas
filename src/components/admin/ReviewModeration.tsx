"use client";

import { useRef, useState } from "react";
import { useLocale } from "@/components/ui/LocaleProvider";
import type { AdminReview } from "@/lib/services/reviews";

type ReviewStatus = AdminReview["status"];

const statusLabels: Record<ReviewStatus, string> = {
  PENDING: "admin.reviews.statusPending",
  APPROVED: "admin.reviews.statusApproved",
  HIDDEN: "admin.reviews.statusHidden",
};
const statusClasses: Record<ReviewStatus, string> = {
  PENDING: "pending",
  APPROVED: "published",
  HIDDEN: "unavailable",
};
// A fixed time zone keeps server and browser rendering the same date.
const DATE_TIME_ZONE = "Europe/Rome";

const cardId = (reviewId: string) => `review-${reviewId}`;

/** The clicked button may disappear after an action, so focus moves to a card. */
function focusCard(reviewId: string | undefined) {
  requestAnimationFrame(() => {
    const target = reviewId ? document.getElementById(cardId(reviewId)) : null;
    (target ?? document.querySelector<HTMLElement>(".review-admin-empty"))?.focus();
  });
}

export function ReviewModeration({ initialReviews }: { initialReviews: AdminReview[] }) {
  const { t, locale } = useLocale();
  const [reviews, setReviews] = useState(initialReviews);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reviewToDelete, setReviewToDelete] = useState<AdminReview | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const dateFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: DATE_TIME_ZONE,
  });
  const counts = {
    PENDING: reviews.filter((review) => review.status === "PENDING").length,
    APPROVED: reviews.filter((review) => review.status === "APPROVED").length,
    HIDDEN: reviews.filter((review) => review.status === "HIDDEN").length,
  };

  async function changeStatus(review: AdminReview, status: "APPROVED" | "HIDDEN") {
    if (busyId) return;
    setBusyId(review.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/reviews/${encodeURIComponent(review.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (response.status === 404) {
        setReviews((current) => current.filter((item) => item.id !== review.id));
        setError(t("admin.reviews.notFound"));
        return;
      }
      if (!response.ok) throw new Error("review_save_failed");
      const saved = (await response.json()) as AdminReview;
      setReviews((current) => current.map((item) => item.id === saved.id ? saved : item));
      setNotice(t(status === "APPROVED" ? "admin.reviews.publishedDone" : "admin.reviews.hiddenDone"));
      focusCard(saved.id);
    } catch {
      setError(t("admin.reviews.saveFailed"));
    } finally {
      setBusyId(null);
    }
  }

  function askDelete(review: AdminReview) {
    setReviewToDelete(review);
    setDeleteError("");
    deleteDialog.current?.showModal();
  }

  async function confirmDelete() {
    if (!reviewToDelete || deleting) return;
    setDeleting(true);
    setDeleteError("");
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/reviews/${encodeURIComponent(reviewToDelete.id)}`, {
        method: "DELETE",
      });
      // 404: someone else already deleted it, so the list simply catches up.
      if (!response.ok && response.status !== 404) throw new Error("review_delete_failed");
      const deletedId = reviewToDelete.id;
      const index = reviews.findIndex((item) => item.id === deletedId);
      const remaining = reviews.filter((item) => item.id !== deletedId);
      setReviews(remaining);
      setNotice(t(response.ok ? "admin.reviews.deletedDone" : "admin.reviews.notFound"));
      deleteDialog.current?.close();
      focusCard(remaining[Math.min(Math.max(index, 0), remaining.length - 1)]?.id);
    } catch {
      setDeleteError(t("admin.reviews.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  }

  const ratingLabel = (rating: number) => t("reviews.ratingLabel").replace("{n}", String(rating));

  return (
    <>
      <dl className="review-counters" aria-label={t("admin.reviews.summary")}>
        <div className="stat-card">
          <dt>{t("admin.reviews.counterPending")}</dt>
          <dd>{counts.PENDING}</dd>
        </div>
        <div className="stat-card">
          <dt>{t("admin.reviews.counterApproved")}</dt>
          <dd>{counts.APPROVED}</dd>
        </div>
        <div className="stat-card">
          <dt>{t("admin.reviews.counterHidden")}</dt>
          <dd>{counts.HIDDEN}</dd>
        </div>
      </dl>

      <p className="review-admin-notice" role="status">{notice}</p>
      {error && <p className="field-error review-admin-error" role="alert">{error}</p>}

      {reviews.length === 0 ? (
        <section className="admin-card">
          <p className="review-admin-empty" tabIndex={-1}>{t("admin.reviews.empty")}</p>
        </section>
      ) : (
        <ul className="review-admin-list">
          {reviews.map((review) => {
            const busy = busyId === review.id;
            const fullName = `${review.firstName} ${review.lastName}`;
            return (
              <li key={review.id}>
                <article className="admin-card review-admin-card" id={cardId(review.id)} tabIndex={-1} aria-busy={busy}>
                  <div className="review-admin-top">
                    <span className="review-admin-stars" role="img" aria-label={ratingLabel(review.rating)}>
                      {[1, 2, 3, 4, 5].map((value) => (
                        <span key={value} className={value <= review.rating ? "is-filled" : undefined} aria-hidden="true">{value <= review.rating ? "★" : "☆"}</span>
                      ))}
                    </span>
                    <span className={`status ${statusClasses[review.status]}`}>{t(statusLabels[review.status])}</span>
                  </div>
                  <blockquote className="review-admin-comment"><p>{review.comment}</p></blockquote>
                  <dl className="review-admin-meta">
                    <div>
                      <dt>{t("admin.reviews.customer")}</dt>
                      <dd>{fullName}</dd>
                    </div>
                    <div>
                      <dt>{t("admin.reviews.email")}</dt>
                      <dd>{review.customerEmail ? <a href={`mailto:${review.customerEmail}`}>{review.customerEmail}</a> : "—"}</dd>
                    </div>
                    <div>
                      <dt>{t("admin.reviews.products")}</dt>
                      <dd>{review.productNames.length > 0 ? review.productNames.join(", ") : "—"}</dd>
                    </div>
                    <div>
                      <dt>{t("admin.reviews.date")}</dt>
                      <dd><time dateTime={review.createdAt}>{dateFormat.format(new Date(review.createdAt))}</time></dd>
                    </div>
                  </dl>
                  <div className="review-admin-actions">
                    {review.status !== "APPROVED" && (
                      <button type="button" className="btn btn-gold" disabled={busy} onClick={() => void changeStatus(review, "APPROVED")}>
                        {t("admin.reviews.publish")}
                      </button>
                    )}
                    {review.status !== "HIDDEN" && (
                      <button type="button" className="btn btn-line" disabled={busy} onClick={() => void changeStatus(review, "HIDDEN")}>
                        {t("admin.reviews.hide")}
                      </button>
                    )}
                    <button type="button" className="btn btn-danger" disabled={busy} onClick={() => askDelete(review)}>
                      {t("admin.reviews.delete")}
                    </button>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}

      <dialog
        ref={deleteDialog}
        className="admin-dialog"
        aria-labelledby="delete-review-title"
        aria-describedby="delete-review-warning"
        onClose={() => setReviewToDelete(null)}
        onCancel={(event) => {
          if (deleting) event.preventDefault();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget && !deleting) event.currentTarget.close();
        }}
      >
        <h2 id="delete-review-title">{t("admin.reviews.deleteTitle")}</h2>
        <p id="delete-review-warning">
          {reviewToDelete
            ? t("admin.reviews.deleteWarning").replace("{name}", `${reviewToDelete.firstName} ${reviewToDelete.lastName}`)
            : ""}
        </p>
        {deleteError && <p className="field-error" role="alert">{deleteError}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn btn-line" onClick={() => deleteDialog.current?.close()} disabled={deleting}>
            {t("admin.dialog.cancel")}
          </button>
          <button type="button" className="btn btn-danger" onClick={() => void confirmDelete()} disabled={deleting} aria-busy={deleting}>
            {t(deleting ? "admin.reviews.deleting" : "admin.reviews.confirmDelete")}
          </button>
        </div>
      </dialog>
    </>
  );
}
