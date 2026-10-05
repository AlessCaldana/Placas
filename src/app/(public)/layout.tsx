import type { ReactNode } from "react";
import { PublicHeader } from "@/components/public/PublicHeader";
import { Footer } from "@/components/public/Footer";
import { getRequestLocale } from "@/lib/locale";
import { translate } from "@/messages";

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const locale = await getRequestLocale();

  return (
    <>
      <a className="skip-link" href="#main">
        {translate(locale, "footer.skip")}
      </a>
      <PublicHeader />
      <main id="main">{children}</main>
      <Footer />
    </>
  );
}
