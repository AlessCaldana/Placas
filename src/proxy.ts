import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, isAdminAuthRequired, isValidAdminSession } from "@/lib/admin-auth";

// Optimistic check: route handlers and the admin layout verify the session again.
export function proxy(request: NextRequest) {
  if (!isAdminAuthRequired() || isValidAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)) {
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
