/**
 * NourishOS AI — orchestrator.
 *
 * runAgent() drives a NON-STREAMING manual tool loop against Claude, then runs
 * the safety-critical claim-to-evidence guardrail over the full draft BEFORE
 * returning. We deliberately do not stream: the guardrail needs the complete
 * text to scan sentence-by-sentence, and we never surface a draft to the caller
 * until unsupported claims have been stripped.
 *
 * Flow:
 *   1. Resolve the system prompt from the agent profile.
 *   2. Run the tool loop (lookup_product_truth / check_claim / get_metrics),
 *      capped at MAX_ITERATIONS to prevent runaway tool calls.
 *   3. Concatenate the final assistant text.
 *   4. Load the org's approved claims and run validateClaims().
 *   5. Return the SANITIZED text plus citations + blocked claims.
 *
 * The `client` and `claims` opts exist for testing — inject a mock Anthropic
 * client and a fixed claims array to exercise the guardrail deterministically
 * without a live API key or DB.
 */

import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { AI_TOOLS, runTool } from "@/lib/ai/tools";
import { AGENT_PROFILES, type AgentProfile } from "@/lib/ai/agents";
import {
  validateClaims,
  type ClaimCitation,
  type BlockedClaim,
} from "@/lib/domain/guardrails";
import { createServiceClient } from "@/lib/supabase/server";
import type { Claim } from "@/lib/types";

// =============================================================================
// Types
// =============================================================================

export interface AgentResult {
  /** Sanitized draft — blocked claims stripped, safe to surface. */
  text: string;
  /** Approved+evidenced claims detected in the draft, with their evidence. */
  citations: ClaimCitation[];
  /** Risky assertions found with no approved evidence (each stripped from text). */
  blocked: BlockedClaim[];
  /** true when no claims were blocked. */
  ok: boolean;
}

/**
 * Minimal structural type for the Anthropic client surface runAgent depends on.
 * Lets tests inject a mock without pulling in the full SDK class. The shapes
 * below mirror the subset of Anthropic.Message / content blocks we read.
 */
export interface AnthropicTextBlock {
  type: "text";
  text: string;
}

export interface AnthropicToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock;

export interface AnthropicMessageResponse {
  stop_reason: string | null;
  content: AnthropicContentBlock[];
}

export interface AnthropicLike {
  messages: {
    create(args: Anthropic.MessageCreateParamsNonStreaming): Promise<AnthropicMessageResponse>;
  };
}

export interface RunAgentOpts {
  orgId: string;
  profile: AgentProfile;
  userText: string;
  /** Injected client for testing; defaults to `new Anthropic()`. */
  client?: AnthropicLike;
  /** Injected claims for testing; when provided the DB load is skipped. */
  claims?: Claim[];
}

// =============================================================================
// Constants
// =============================================================================

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 16000;
/** Hard cap on tool-loop turns to prevent a runaway sequence of tool calls. */
const MAX_ITERATIONS = 6;

// =============================================================================
// runAgent
// =============================================================================

/**
 * Run an agent conversation through Claude with grounded tools, then apply the
 * claim-to-evidence guardrail to the resulting draft.
 *
 * @throws Anthropic.APIError (or other thrown errors) — the caller (route) is
 *         responsible for translating these into a graceful response.
 */
export async function runAgent(opts: RunAgentOpts): Promise<AgentResult> {
  const { orgId, profile, userText } = opts;
  const client: AnthropicLike = opts.client ?? toAnthropicLike(new Anthropic());

  const system = AGENT_PROFILES[profile].system;

  // ---------------------------------------------------------------------------
  // Manual tool loop (non-streaming).
  // ---------------------------------------------------------------------------
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userText }];
  const textParts: string[] = [];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      tools: AI_TOOLS,
      messages,
    });

    if (res.stop_reason !== "tool_use") {
      // Final turn — collect text and stop.
      for (const block of res.content) {
        if (block.type === "text") textParts.push(block.text);
      }
      break;
    }

    // Record the assistant turn (including the tool_use blocks) verbatim so the
    // follow-up tool_result messages reference valid tool_use_ids.
    messages.push({
      role: "assistant",
      content: res.content as unknown as Anthropic.ContentBlockParam[],
    });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type !== "tool_use") continue;
      const out = await runTool(block.name, block.input, orgId);
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: out,
      });
    }

    messages.push({ role: "user", content: toolResults });

    // Defensive: if Claude reported tool_use but emitted no tool blocks, there
    // is nothing to resolve — stop rather than spin.
    if (toolResults.length === 0) break;
  }

  const draftText = textParts.join("");

  // ---------------------------------------------------------------------------
  // Guardrail pass — load the org's claims and validate the draft.
  // ---------------------------------------------------------------------------
  const claims = opts.claims ?? (await loadClaims(orgId));
  const result = validateClaims(draftText, claims);

  return {
    text: result.sanitizedText,
    citations: result.citations,
    blocked: result.blocked,
    ok: result.ok,
  };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Adapt the real Anthropic client to the narrow AnthropicLike surface runAgent
 * uses. The SDK's Message.content is a superset of our { text | tool_use }
 * union (it can include thinking blocks etc.); we only ever read text and
 * tool_use blocks, so structurally narrowing at this single boundary is sound.
 */
function toAnthropicLike(client: Anthropic): AnthropicLike {
  return {
    messages: {
      create: (args) =>
        client.messages.create(args) as Promise<AnthropicMessageResponse>,
    },
  };
}

/**
 * Load all of an org's claims via the service client. The guardrail needs the
 * full set (approved + rejected) so it can both cite evidenced claims and block
 * unsupported assertions. Filtered strictly by organization_id.
 */
async function loadClaims(orgId: string): Promise<Claim[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("claims")
    .select("*")
    .eq("organization_id", orgId);

  if (error) {
    throw new Error(`[runAgent] Failed to load claims: ${error.message}`);
  }

  return (data ?? []) as Claim[];
}
