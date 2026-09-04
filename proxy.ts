import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Allow public static assets, auth/webhook APIs, and public AI buyer catalog
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/api/ai/catalog/public") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const sessionCookie = req.cookies.get("razorgrowth_session")?.value;
  const isAuthPage = pathname === "/login" || pathname === "/signup";

  // 2. Redirect authenticated users away from /login and /signup to dashboard /
  if (isAuthPage) {
    if (sessionCookie) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  // 3. Protect UI dashboard root
  if (!sessionCookie && pathname === "/") {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  // 4. Protect all other /api/* routes (except auth and webhooks)
  if (pathname.startsWith("/api/") && !sessionCookie) {
    // Check Authorization header for token
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return NextResponse.json(
        { error: "Unauthorized: Valid merchant session required" },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
