import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, isAdminAuthRequired, verifySessionToken } from "@/lib/admin-session";

// Optimistic check (signature and expiry only, no database). Route handlers
// and the admin layout/pages do the full check: account exists, is active and
// its sessionVersion matches (see src/lib/admin-auth.ts).
export function proxy(request: NextRequest) {
  if (!isAdminAuthRequired(request.headers) || verifySessionToken(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
