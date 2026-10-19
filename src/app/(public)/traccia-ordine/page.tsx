import type { Metadata } from "next";
import { OrderTracking } from "@/components/public/OrderTracking";
import { getRequestLocale } from "@/lib/locale";
import { isMaintenanceVisitor } from "@/lib/maintenance-view";
import { normalizeOrderNumber } from "@/lib/order-number";
import { translate } from "@/messages";

export async function generateMetadata(): Promise<Metadata> {
  // The layout sets the maintenance title.
  if (await isMaintenanceVisitor()) return {};
  const locale = await getRequestLocale();
  return { title: translate(locale, "track.title") };
}

export default async function TrackOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Maintenance: the layout shows the maintenance page; render nothing here.
  if (await isMaintenanceVisitor()) return null;
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);
  // The thank-you page links here with the order number already filled in.
  const rawOrderNumber = (await searchParams).ordine;
  const initialOrderNumber =
    (typeof rawOrderNumber === "string" ? normalizeOrderNumber(rawOrderNumber) : null) ?? "";

  return (
    <section className="section track-page">
      <div className="track-intro">
        <div className="eyebrow"><span /> {t("track.eyebrow")}</div>
        <h1>{t("track.title")}</h1>
        <p>{t("track.intro")}</p>
      </div>
      <OrderTracking initialOrderNumber={initialOrderNumber} />
    </section>
  );
}
