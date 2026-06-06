/**
 * Supabase auth session refresh helper for the Next.js proxy layer.
 *
 * Call `updateSession(request)` from src/proxy.ts. It:
 *   1. Creates a server Supabase client wired to the incoming request cookies.
 *   2. Calls getUser() to refresh the session (re-sets cookie on the response).
 *   3. Returns { response, user } so the proxy can make routing decisions.
 *
 * We use request.cookies / response.cookies directly here (not next/headers)
 * because proxy/middleware runs on the edge before Next.js's async cookie
 * store is available.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";

export async function updateSession(
  request: NextRequest
): Promise<{ response: NextResponse; user: User | null }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If env vars are missing we pass the request through — the downstream
  // client factories will surface a clear error when they are actually used.
  if (!supabaseUrl || !supabaseAnonKey) {
    return { response: NextResponse.next({ request }), user: null };
  }

  // We need a mutable response so Supabase can write Set-Cookie headers.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: Array<{
          name: string;
          value: string;
          options?: Record<string, unknown>;
        }>
      ) {
        // Write cookies both to the forwarded request and the outgoing response
        // so that both the server components and the browser receive them.
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(
            name,
            value,
            options as Parameters<typeof response.cookies.set>[2]
          );
        });
      },
    },
  });

  // getUser() triggers a token refresh if needed, which fires onAuthStateChange
  // and causes setAll to be called (writing the refreshed session cookie).
  // IMPORTANT: do not remove this call — the cookie refresh depends on it.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
