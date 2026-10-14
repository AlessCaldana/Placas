/**
 * True when a mutating request clearly comes from another site: an Origin
 * header whose host differs from the request host (or that cannot be parsed,
 * e.g. "null"), or Sec-Fetch-Site: cross-site. Requests without those headers
 * (curl, old browsers) pass; the session cookie is SameSite=Lax anyway.
 */
export function isCrossOriginRequest(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return true;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== new URL(request.url).host;
  } catch {
    return true;
  }
}
