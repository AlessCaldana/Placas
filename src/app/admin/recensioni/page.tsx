import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminHeader, PreviewBanner } from "@/components/admin/AdminHeader";
import { ReviewModeration } from "@/components/admin/ReviewModeration";
import { ADMIN_SESSION_COOKIE, isAdminAuthRequired, isValidAdminSession } from "@/lib/admin-auth";
import { isDatabaseConfigured } from "@/lib/db";
import { getRequestLocale } from "@/lib/locale";
import { listAdminReviews, type AdminReview } from "@/lib/services/reviews";
import { translate } from "@/messages";

export default async function Page() {
  // The layout already checks the session; repeat it next to the data access
  // so the reviews (with customer emails) never load without one.
  const cookieStore = await cookies();
  if (isAdminAuthRequired() && !isValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)) {
    redirect("/login");
  }
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);

  let reviews: AdminReview[] = [];
  let databaseError = false;
  if (isDatabaseConfigured()) {
    try {
      reviews = await listAdminReviews();
    } catch {
      databaseError = true;
    }
  }

  return (
    <>
      <AdminHeader title={t("admin.reviews.title")} subtitle={t("admin.reviews.subtitle")} />
      {!isDatabaseConfigured() && <PreviewBanner />}
      {databaseError && <p className="field-error" role="alert">{t("admin.database.unavailable")}</p>}
      <ReviewModeration initialReviews={reviews} />
    </>
  );
}
