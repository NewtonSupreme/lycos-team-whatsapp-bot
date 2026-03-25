import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = request.cookies.get("lycos_session");

  // Public paths
  if (
    pathname.startsWith("/_next") ||
    pathname.includes("/api/auth") ||
    pathname === "/login" ||
    pathname.includes("/Icono") ||
    pathname.includes("/favicon")
  ) {
    return NextResponse.next();
  }

  // Redirect to login if no session
  if (!session) {
    const loginUrl = new URL("/login", request.url);
    // Store the intended destination
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Root redirect handled by middleware if session exists
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
