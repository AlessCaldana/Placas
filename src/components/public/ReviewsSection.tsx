import { Icon } from "@/components/ui/Icon";
import type { PublicReview } from "@/lib/services/reviews";
import { translate, type Locale } from "@/messages";

// A fixed time zone keeps server and browser rendering the same date.
const DATE_TIME_ZONE = "Europe/Rome";

function StarRating({ rating, label, className }: { rating: number; label: string; className?: string }) {
  const filled = Math.round(rating);
  return (
    <span className={`review-rating-stars${className ? ` ${className}` : ""}`} role="img" aria-label={label}>
      {[1, 2, 3, 4, 5].map((value) => (
        <span key={value} className={value <= filled ? "is-filled" : undefined} aria-hidden="true">{value <= filled ? "★" : "☆"}</span>
      ))}
    </span>
  );
}

function initialOf(name: string, locale: Locale) {
  // Array.from keeps accented letters and emoji (surrogate pairs) whole.
  return (Array.from(name.trim())[0] ?? "").toLocaleUpperCase(locale);
}

export function ReviewsSection({ reviews, locale }: { reviews: PublicReview[]; locale: Locale }) {
  if (reviews.length === 0) return null;
  const t = (key: string) => translate(locale, key);
  const average = reviews.reduce((total, review) => total + review.rating, 0) / reviews.length;
  const averageText = new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(average);
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: DATE_TIME_ZONE });
  const countText = reviews.length === 1
    ? t("reviews.countOne")
    : t("reviews.countMany").replace("{n}", String(reviews.length));
  // With one or two reviews the cards are centred instead of leaving empty columns.
  const gridClass = reviews.length < 3 ? ` is-few has-${reviews.length}` : "";

  return (
    <section className="reviews" aria-labelledby="reviews-title">
      <div className="section reviews-inner">
        <div className="reviews-heading">
          <div className="reviews-heading-copy">
            <div className="eyebrow"><span /> {t("reviews.eyebrow")}</div>
            <h2 id="reviews-title">{t("reviews.title")}</h2>
          </div>
          <div className="reviews-summary">
            <b className="reviews-summary-score" aria-hidden="true">{averageText}</b>
            <StarRating
              rating={average}
              label={t("reviews.averageLabel").replace("{avg}", averageText)}
              className="reviews-summary-stars"
            />
            <small>{countText}</small>
          </div>
        </div>
        <ul className={`reviews-grid${gridClass}`}>
          {reviews.map((review) => (
            <li key={review.id}>
              <figure className="review-card">
                <StarRating rating={review.rating} label={t("reviews.ratingLabel").replace("{n}", String(review.rating))} />
                <blockquote><p>{review.comment}</p></blockquote>
                <figcaption>
                  <span className="review-avatar" aria-hidden="true">{initialOf(review.displayName, locale)}</span>
                  <span className="review-author">
                    <b>{review.displayName}</b>
                    <span className="review-meta">
                      <time dateTime={review.createdAt}>{dateFormat.format(new Date(review.createdAt))}</time>
                      <span className="review-verified"><Icon name="check" size={14} />{t("reviews.verified")}</span>
                    </span>
                  </span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
