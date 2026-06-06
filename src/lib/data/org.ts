/**
 * Active-organization data access.
 *
 * Every authenticated page needs to know "who is the current user and which
 * organization are they operating inside?". This module is the canonical place
 * to answer that question.
 *
 *   getCurrentUserAndOrg(supabase) — given a Supabase client, resolves the
 *     signed-in user and their first membership's organization. Returns null
 *     when there is no user or no membership (e.g. a brand-new account that has
 *     not been provisioned yet). RLS-respecting when passed the cookie-aware
 *     server client.
 *
 *   requireOrg() — convenience wrapper that builds a fresh server client,
 *     calls getCurrentUserAndOrg, and redirects to /login if the result is
 *     null. Use this in pages/route handlers that must have an active org.
 */

import "server-only";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { Organization } from "@/lib/types";

export interface UserAndOrg {
  userId: string;
  org: Organization;
}

/**
 * Shape returned by the membership → organization embed below. Supabase's
 * PostgREST embedding returns the related row under the relationship name.
 */
interface MembershipWithOrg {
  organization_id: string;
  organizations: Organization | null;
}

/**
 * Resolve the current user and their active organization.
 *
 * @param supabase A Supabase client. Pass the cookie-aware server client so
 *                 the query runs as the authenticated user (RLS-respecting).
 * @returns `{ userId, org }` or `null` if there is no signed-in user or the
 *          user has no membership.
 */
export async function getCurrentUserAndOrg(
  supabase: SupabaseClient,
): Promise<UserAndOrg | null> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  // Join memberships → organizations and take the user's first membership.
  // ordered by created_at so the result is deterministic when a user belongs
  // to more than one org.
  const { data, error } = await supabase
    .from("memberships")
    .select("organization_id, organizations(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<MembershipWithOrg>();

  if (error || !data || !data.organizations) {
    return null;
  }

  return { userId: user.id, org: data.organizations };
}

/**
 * Require an active organization, building a fresh cookie-aware server client.
 * Redirects to /login when there is no user/membership.
 *
 * Note: `redirect()` throws internally, so the non-null return type is sound —
 * control never falls through to a null value.
 */
export async function requireOrg(): Promise<UserAndOrg> {
  const supabase = await createClient();
  const result = await getCurrentUserAndOrg(supabase);

  if (!result) {
    redirect("/login");
  }

  return result;
}
