import type { Metadata } from "next";
import { LegalPage, legalMetadata } from "@/components/public/LegalPage";

export function generateMetadata(): Promise<Metadata> {
  return legalMetadata("sales");
}

export default function Page() {
  return <LegalPage document="sales" />;
}
