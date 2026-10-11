import { ButtonLink } from "@/components/ui/Button";
import { getRequestLocale } from "@/lib/locale";
import { getStripe, isStripeConfigured } from "@/lib/payments/stripe";
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

export default async function OrderCompletedPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);
  const sessionId = (await searchParams).session_id;
  const paid = await isSessionPaid(typeof sessionId === "string" ? sessionId : undefined);

  return (
    <section className="section order-result">
      <small>{t("checkout.label")}</small>
      <h1>{t(paid ? "checkout.successTitle" : "checkout.pendingTitle")}</h1>
      <p>{t(paid ? "checkout.successText" : "checkout.pendingText")}</p>
      <ButtonLink href="/#catalogo" kind="gold" icon="arrow">{t("cta.catalog")}</ButtonLink>
    </section>
  );
}
