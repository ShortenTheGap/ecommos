/**
 * NourishOS — Next.js 16 proxy (formerly middleware.ts).
 *
 * Responsibilities:
 *   1. Refresh the Supabase auth session cookie on every request.
 *   2. Redirect unauthenticated users to /login when they try to access
 *      protected app routes.
 *
 * Public paths (no auth required):
 *   /           — temporary design-system showcase page
 *   /login      — sign-in / sign-up page
 *   /auth/*     — Supabase OAuth/PKCE callback routes (if added later)
 *   /_next/*    — Next.js internals
 *   /favicon*   — static assets
 *   /public/*   — (handled by Next.js before proxy, listed for clarity)
 *
 * All other paths require an authenticated session.
 */

import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Run session refresh on every matched request and get auth state.
  const { response, user } = await updateSession(request);

  // Public paths — always allow through.
  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon");

  if (isPublic) {
    return response;
  }

  // Protected path — redirect unauthenticated users to login.
  if (!user) {
    const loginUrl = new URL("/login", request.url);
    // Preserve the intended destination so we can redirect after login.
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static  (static bundles)
     * - _next/image   (image optimisation)
     * - favicon.ico / sitemap.xml / robots.txt (metadata)
     * - Files with extensions (images, fonts, etc.)
     *
     * We still want the proxy to run on /, /login, and all app routes.
     */
    "/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};
