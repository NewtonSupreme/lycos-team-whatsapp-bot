import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { leerSesion } from "@/lib/session-token";

/*
 * API que se llama sin sesión: el login, lo que llega de Meta (webhook), el
 * cron externo y las tasas (el bot las pide de servidor a servidor). Todo lo
 * demás de /api exige sesión. Antes /api quedaba fuera del proxy y, por
 * ejemplo, el reporte diario o el borrado de usuarios respondían a cualquiera.
 */
const API_PUBLICA = [
  "/api/auth",
  "/api/whatsapp/webhook",
  "/api/whatsapp/cron",
  "/api/rates",
  "/api/tasas",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // La cookie vale solo si su firma cuadra (ver lib/session-token.ts).
  const session = leerSesion(request.cookies.get("lycos_session")?.value);

  if (pathname.startsWith("/api/")) {
    if (API_PUBLICA.some(p => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
    if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    return NextResponse.next();
  }

  // Public paths
  if (
    pathname.startsWith("/_next") ||
    pathname === "/login" ||
    pathname.includes("/Icono") ||
    pathname.includes("/Logo") ||
    pathname.includes("/favicon") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".webp") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".jpeg") ||
    pathname.endsWith(".ico") ||
    pathname.startsWith("/Silenciadores") ||
    pathname === "/manifest.json" ||
    pathname === "/sw.js"
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
  // /api ya entra: se protege arriba con su lista de rutas públicas.
  matcher: [
    "/((?!_next/static|_next/image|Silenciadores|favicon.ico|manifest.json|sw.js).*)",
  ],
};
