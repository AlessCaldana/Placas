/**
 * Hosts this request may legitimately come from: the Host header the browser
 * sent (behind nginx this needs `proxy_set_header Host $host;`), the public
 * site URL (NEXT_PUBLIC_SITE_URL) and the URL Next.js built for the request.
 * Next.js builds request.url from its own hostname/port (e.g. localhost:3000),
 * not from the Host header, so comparing against request.url alone would
 * reject every real request behind a reverse proxy.
 */
function allowedHosts(request: Request): Set<string> {
  const hosts = new Set<string>();
  const host = request.headers.get("host")?.trim().toLowerCase();
  if (host) hosts.add(host);
  for (const value of [process.env.NEXT_PUBLIC_SITE_URL, request.url]) {
    if (!value) continue;
    try {
      hosts.add(new URL(value).host);
    } catch {
      // Ignore a malformed configured URL.
    }
  }
  return hosts;
}

/**
 * True when a mutating request clearly comes from another site: an Origin
 * header whose host is not one of this site's hosts (or that cannot be parsed,
 * e.g. "null"), or Sec-Fetch-Site: cross-site. A browser always sends the real
 * Host of the site it is talking to, so a page on another site cannot make the
 * two match. Requests without those headers (curl, old browsers) pass; the
 * session cookie is SameSite=Lax anyway.
 */
export function isCrossOriginRequest(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return true;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return !allowedHosts(request).has(new URL(origin).host);
  } catch {
    return true;
  }
}
