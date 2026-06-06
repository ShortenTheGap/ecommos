/**
 * Browser-side Supabase client.
 *
 * Uses createBrowserClient from @supabase/ssr — returns a singleton when
 * called in a browser context (safe to call multiple times).
 *
 * Import this in Client Components only. For server-side data access use the
 * server client from @/lib/supabase/server instead.
 */

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  // The env vars are embedded at build time by Next.js (NEXT_PUBLIC_ prefix).
  // Fail loudly at runtime if they are absent — never silently return a
  // broken client.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "[NourishOS] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Check your .env.local file."
    );
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
