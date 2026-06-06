/**
 * Server-side Supabase client factory.
 *
 * - createClient()        — session-aware client that reads/writes auth cookies.
 *                          Call inside Server Components, Route Handlers, and
 *                          Server Functions. Always `await` it.
 * - createServiceClient() — bypasses RLS using the service-role key.
 *                          Server-only (admin / seed use). Never expose to the
 *                          browser.
 *
 * NOTE: Both factories are intentionally async functions (not module-level
 * constants) so that Supabase client construction only happens at
 * request-time, keeping the build clean even when env vars are absent.
 */

import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// ---------------------------------------------------------------------------
// Helpers — fail loudly at runtime when required env vars are missing
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[NourishOS] Missing required environment variable: ${name}. ` +
        `Check your .env.local file.`
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// Session-aware server client (reads/writes cookies)
// ---------------------------------------------------------------------------

export async function createClient() {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: Array<{
          name: string;
          value: string;
          options?: Record<string, unknown>;
        }>
      ) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2]);
          });
        } catch {
          // setAll is called from Server Components where cookies cannot be
          // written. The middleware handles the actual refresh — this catch
          // prevents a crash during static rendering passes.
        }
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Service-role client (bypasses RLS — server-only / admin use)
// ---------------------------------------------------------------------------

export function createServiceClient() {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
