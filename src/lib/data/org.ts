/**
 * Active-organization data access — DEMO MODE (no auth).
 *
 * NourishOS is running as a no-auth public demo. There is no login and no
 * session; every request reads and writes the seeded demo brand ("Ember Goods")
 * using the service-role client (RLS bypassed). This module is the canonical
 * place to resolve "which organization are we operating inside, and which user
 * is the actor for audit purposes?".
 *
 *   getCurrentUserAndOrg() — resolves the demo org + its owner user via the
 *     service-role client. The legacy `supabase` parameter is accepted for
 *     back-compat but ignored.
 *
 *   requireOrg() — convenience wrapper that always returns the demo org. Throws
 *     a clear Error if no organization exists at all (it never redirects).
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceClient } from "@/lib/supabase/server";
import type { Organization } from "@/lib/types";

export interface UserAndOrg {
  userId: string;
  org: Organization;
}

/**
 * Resolve the demo organization and a real owner user id (for audit actors).
 *
 * Selection: all organizations ordered by `created_at asc`; prefer the one
 * named "Ember Goods" (case-insensitive), otherwise the first row. Then the
 * org's owner membership (preferring role 'owner', else any membership) is read
 * to obtain a real `user_id` UUID.
 *
 * @param _supabase Accepted for back-compat with old callers; ignored. The
 *                  query always runs through the service-role client.
 * @returns `{ userId, org }`, or `null` if no organization exists.
 */
export async function getCurrentUserAndOrg(
  _supabase?: SupabaseClient,
): Promise<UserAndOrg | null> {
  const admin = createServiceClient();

  // Fetch all orgs (deterministic order) and prefer the seeded demo brand.
  const { data: orgs, error: orgError } = await admin
    .from("organizations")
    .select("*")
    .order("created_at", { ascending: true });

  if (orgError || !orgs || orgs.length === 0) {
    return null;
  }

  const org =
    (orgs as Organization[]).find(
      (o) => (o.name ?? "").toLowerCase() === "ember goods",
    ) ?? (orgs[0] as Organization);

  // Resolve a real user id from the org's memberships to use as the audit
  // actor. Prefer the owner; fall back to any membership.
  const { data: memberships } = await admin
    .from("memberships")
    .select("user_id, role")
    .eq("organization_id", org.id);

  let userId: string | null = null;
  if (memberships && memberships.length > 0) {
    const rows = memberships as Array<{ user_id: string; role: string | null }>;
    const owner = rows.find((m) => m.role === "owner");
    userId = (owner ?? rows[0]).user_id;
  }

  // No membership rows — fall back to the org id so callers still get a UUID
  // (audit_log actor). This keeps the demo functional even on a sparse seed.
  if (!userId) {
    userId = org.id;
  }

  return { userId, org };
}

/**
 * Require an active organization. In demo mode this always resolves the seeded
 * demo org via the service-role client — it never redirects to /login.
 *
 * @throws Error when no organization exists in the database at all.
 */
export async function requireOrg(): Promise<UserAndOrg> {
  const result = await getCurrentUserAndOrg();

  if (!result) {
    throw new Error(
      "[NourishOS] No organization found. The demo database has not been " +
        "seeded — run the seed script to create the Ember Goods demo org.",
    );
  }

  return result;
}
