import type { Metadata } from "next";
import { LegalPage, legalMetadata } from "@/components/public/LegalPage";
import { isMaintenanceVisitor } from "@/lib/maintenance-view";

export async function generateMetadata(): Promise<Metadata> {
  // The layout sets the maintenance title.
  if (await isMaintenanceVisitor()) return {};
  return legalMetadata("cookie");
}

export default async function Page() {
  // Maintenance: the layout shows the maintenance page; render and load nothing here.
  if (await isMaintenanceVisitor()) return null;
  return <LegalPage document="cookie" />;
}
