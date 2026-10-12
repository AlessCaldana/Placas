import type { Metadata } from "next";
import "@fontsource-variable/dm-sans";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "./globals.css";
import { LocaleProvider } from "@/components/ui/LocaleProvider";
import { getLocalePreference } from "@/lib/locale";

export const metadata: Metadata = {
  title: { default: "PFdeco — Decorative Italiane", template: "%s — PFdeco" },
  description: "Targhe decorative per raccontare le tue passioni.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const preferredLocale = await getLocalePreference();
  const initialLocale = preferredLocale ?? "it";

  return (
    <html lang={initialLocale} className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <LocaleProvider initialLocale={initialLocale} showPrompt={!preferredLocale}>
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
