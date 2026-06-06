/**
 * TEMPORARY diagnostic endpoint — remove after deploy is verified.
 * Reports env-var presence (NOT values) and a live DB connectivity test so we
 * can pinpoint the production 500 without Railway log access. No secrets leaked.
 */
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const env = {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
    hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    anonKeyLen: (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").length,
    hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    serviceKeyLen: (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").length,
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    anthropicKeyLen: (process.env.ANTHROPIC_API_KEY ?? "").length,
    nodeEnv: process.env.NODE_ENV ?? null,
  };

  let dbTest: Record<string, unknown>;
  try {
    const sb = createServiceClient();
    const { data, error } = await sb
      .from("organizations")
      .select("id,name")
      .limit(5);
    dbTest = error
      ? { ok: false, error: error.message, code: error.code ?? null }
      : { ok: true, orgCount: data?.length ?? 0, orgs: data?.map((o) => o.name) };
  } catch (e) {
    dbTest = { ok: false, thrown: e instanceof Error ? e.message : String(e) };
  }

  return Response.json({ env, dbTest });
}
