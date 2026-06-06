/**
 * POST /api/ai — run an AI agent conversation.
 *
 * Request body:  { profile?: AgentProfile; message: string }
 * Response body: { text: string; citations: ClaimCitation[]; blocked: BlockedClaim[]; ok: boolean }
 *
 * Pipeline:
 *   1. Validate the body (Zod). Empty message → 400.
 *   2. Resolve the signed-in user + active org via the cookie client. None → 401.
 *   3. Run the orchestrator (Claude tool loop + claim guardrail).
 *   4. Persist the exchange: one ai_conversations row + a user/assistant pair of
 *      ai_messages rows (assistant row carries citations + blocked_claims jsonb).
 *      Persistence is best-effort — a write failure does not fail the response.
 *   5. Return the guardrailed result.
 *
 * Errors: a missing ANTHROPIC_API_KEY or any Anthropic failure degrades to a
 * 502 with a generic message so the UI can show a graceful "AI unavailable"
 * state rather than leaking internals.
 */

import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentUserAndOrg } from "@/lib/data/org";
import { runAgent } from "@/lib/ai/run";
import type { AgentProfile } from "@/lib/ai/agents";

// Always run at request-time (auth cookies + DB + outbound LLM call).
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

const AGENT_PROFILES = [
  "launch_readiness",
  "margin_analyst",
  "content_strategist",
  "fulfillment_operator",
  "vendor_coordinator",
  "retention_strategist",
] as const satisfies readonly AgentProfile[];

const bodySchema = z.object({
  profile: z.enum(AGENT_PROFILES).default("margin_analyst"),
  message: z.string().trim().min(1, "message must not be empty"),
});

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  // 1. Parse + validate the body.
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 },
    );
  }
  const { profile, message } = parsed.data;

  // 2. Resolve user + org (cookie client → RLS-respecting auth).
  const supabase = await createClient();
  const userAndOrg = await getCurrentUserAndOrg(supabase);
  if (!userAndOrg) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { userId, org } = userAndOrg;

  // 3. Run the orchestrator. Anthropic/config failures → 502 graceful degrade.
  let result;
  try {
    result = await runAgent({ orgId: org.id, profile, userText: message });
  } catch (err) {
    if (err instanceof Anthropic.APIError || isMissingApiKey(err)) {
      console.error("[/api/ai] AI call failed:", err);
      return Response.json({ error: "AI temporarily unavailable" }, { status: 502 });
    }
    // Unexpected error — surface as 500.
    console.error("[/api/ai] Unexpected error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }

  // 4. Persist (best-effort). Service client → set organization_id explicitly.
  try {
    await persistConversation({
      orgId: org.id,
      userId,
      profile,
      userMessage: message,
      result,
    });
  } catch (err) {
    // Do not fail the request on a persistence error — the user already has
    // their (guardrailed) answer.
    console.error("[/api/ai] Failed to persist conversation:", err);
  }

  // 5. Return the guardrailed result.
  return Response.json({
    text: result.text,
    citations: result.citations,
    blocked: result.blocked,
    ok: result.ok,
  });
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

interface PersistArgs {
  orgId: string;
  userId: string;
  profile: AgentProfile;
  userMessage: string;
  result: Awaited<ReturnType<typeof runAgent>>;
}

async function persistConversation(args: PersistArgs): Promise<void> {
  const { orgId, userId, profile, userMessage, result } = args;
  const admin = createServiceClient();

  const { data: conversation, error: convError } = await admin
    .from("ai_conversations")
    .insert({
      organization_id: orgId,
      user_id: userId,
      agent_profile: profile,
    })
    .select("id")
    .single();

  if (convError || !conversation) {
    throw new Error(`ai_conversations insert failed: ${convError?.message ?? "no row returned"}`);
  }

  const conversationId = (conversation as { id: string }).id;

  const { error: msgError } = await admin.from("ai_messages").insert([
    {
      organization_id: orgId,
      conversation_id: conversationId,
      role: "user",
      content: userMessage,
      citations: [],
      blocked_claims: [],
    },
    {
      organization_id: orgId,
      conversation_id: conversationId,
      role: "assistant",
      content: result.text,
      citations: result.citations,
      blocked_claims: result.blocked,
    },
  ]);

  if (msgError) {
    throw new Error(`ai_messages insert failed: ${msgError.message}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Detect the "missing ANTHROPIC_API_KEY" failure thrown by `new Anthropic()`. */
function isMissingApiKey(err: unknown): boolean {
  return (
    err instanceof Error &&
    /ANTHROPIC_API_KEY|apiKey|api_key/i.test(err.message)
  );
}
