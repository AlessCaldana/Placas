import Link from "next/link";
import { ReviewInvite } from "@/components/public/ReviewDialog";
import { ButtonLink } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { Icon } from "@/components/ui/Icon";
import { isDatabaseConfigured } from "@/lib/db";
import { getRequestLocale } from "@/lib/locale";
import { getStripe, isStripeConfigured } from "@/lib/payments/stripe";
import { getReviewEligibility, type ReviewEligibility } from "@/lib/services/reviews";
import { getOrderNumberForSession } from "@/lib/services/shipments";
import { translate } from "@/messages";

export const metadata = { robots: { index: false, follow: false } };

async function isSessionPaid(sessionId: string | undefined): Promise<boolean> {
  if (!sessionId || !/^cs_[A-Za-z0-9_]+$/.test(sessionId) || !isStripeConfigured()) return false;
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    return session.payment_status === "paid";
  } catch {
    return false;
  }
}

async function loadReviewEligibility(sessionId: string): Promise<ReviewEligibility> {
  if (!isDatabaseConfigured()) return "not_allowed";
  try {
    return await getReviewEligibility(sessionId);
  } catch {
    // Without the database the page still confirms the order, just without the review prompt.
    return "not_allowed";
  }
}

async function loadOrderNumber(sessionId: string): Promise<string | null> {
  if (!isDatabaseConfigured()) return null;
  try {
    return await getOrderNumberForSession(sessionId);
  } catch {
    // The confirmation still shows; the buyer can find the number in the email.
    return null;
  }
}

export default async function OrderCompletedPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);
  const rawSessionId = (await searchParams).session_id;
  const sessionId = typeof rawSessionId === "string" ? rawSessionId : undefined;
  const paid = await isSessionPaid(sessionId);
  const [eligibility, orderNumber] = paid && sessionId
    ? await Promise.all([loadReviewEligibility(sessionId), loadOrderNumber(sessionId)])
    : (["not_allowed", null] as const);

  return (
    <section className="section order-result">
      <small>{t("checkout.label")}</small>
      <h1>{t(paid ? "checkout.successTitle" : "checkout.pendingTitle")}</h1>
      <p>{t(paid ? "checkout.successText" : "checkout.pendingText")}</p>
      {orderNumber && (
        <div className="order-number-card">
          <span className="order-number-label">{t("checkout.orderNumber")}</span>
          <strong className="order-number-value">{orderNumber}</strong>
          <CopyButton text={orderNumber} label={t("checkout.copyNumber")} className="order-number-copy" />
          <p className="order-number-note">{t("checkout.keepNumber")}</p>
          <Link className="order-number-track" href={`/traccia-ordine?ordine=${encodeURIComponent(orderNumber)}`}>
            <Icon name="truck" size={18} />
            {t("checkout.trackLink")}
          </Link>
        </div>
      )}
      {paid && sessionId && eligibility !== "not_allowed" && (
        <ReviewInvite sessionId={sessionId} initialState={eligibility} />
      )}
      <div className="order-result-actions">
        <ButtonLink href="/#catalogo" kind="gold" icon="arrow">{t("cta.catalog")}</ButtonLink>
        {!orderNumber && (
          <ButtonLink href="/traccia-ordine" kind="line" icon="truck">{t("checkout.trackLink")}</ButtonLink>
        )}
      </div>
    </section>
  );
}
