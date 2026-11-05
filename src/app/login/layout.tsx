import type { Metadata } from "next";
import type { ReactNode } from "react";

// The admin login is not for search engines.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
