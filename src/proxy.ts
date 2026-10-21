import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, isAdminAuthRequired, verifySessionToken } from "@/lib/admin-session";

// Optimistic check for the admin pages (signature and expiry only, no
// database): sends visitors without a session to /login. The admin
// layout/pages do the full check: account exists, is active and its
// sessionVersion matches (see src/lib/admin-auth.ts).
//
// /api/admin is deliberately NOT matched: Next buffers the body of every
// request a proxy handles, so an anonymous POST there could make the server
// hold up to the photo upload limit in memory before the 401. Every
// /api/admin handler checks the session itself before reading the body.
export function proxy(request: NextRequest) {
  if (!isAdminAuthRequired(request.headers) || verifySessionToken(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*"],
};
