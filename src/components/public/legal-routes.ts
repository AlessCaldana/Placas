// Public legal pages: route and translation key prefix of each document.

export const legalDocumentIds = ["privacy", "cookie", "sales", "shipping"] as const;
export type LegalDocumentId = (typeof legalDocumentIds)[number];

export const legalRoutes: Record<LegalDocumentId, string> = {
  privacy: "/privacy",
  cookie: "/cookie",
  sales: "/condizioni-di-vendita",
  shipping: "/spedizioni-e-resi",
};

/** Date of the current version of the legal texts (ISO, UTC). */
export const legalLastUpdated = "2026-10-12";
