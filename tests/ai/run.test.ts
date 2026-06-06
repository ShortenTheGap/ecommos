/**
 * runAgent orchestrator — guardrail integration test.
 *
 * What is under test: that runAgent runs the Claude tool loop, then passes the
 * FULL draft through the claim-to-evidence guardrail before returning. We inject
 * a mock Anthropic client (no real API key) and a fixed claims array (no DB), so
 * the only live behaviour exercised is the loop + guardrail wiring.
 *
 * The mock returns a single-turn (stop_reason 'end_turn') draft containing:
 *   - an APPROVED, evidenced claim  → must be CITED
 *   - an UNSUPPORTED immunity claim → must be BLOCKED (severity 'high') + stripped
 *
 * This mirrors the seed: one approved "Made with 100% raw wildflower honey"
 * claim and one rejected "Clinically proven to boost immunity" claim.
 */

import { describe, it, expect } from "vitest";

import { runAgent, type AnthropicLike, type AnthropicMessageResponse } from "@/lib/ai/run";
import type { Claim } from "@/lib/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeClaim = (overrides: Partial<Claim>): Claim => ({
  id: "claim-x",
  organization_id: "org-1",
  product_id: null,
  claim_text: "",
  claim_type: null,
  evidence: null,
  approval_status: "pending",
  risk_level: "low",
  channels_used: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: null,
  ...overrides,
});

const approvedHoney = makeClaim({
  id: "claim-honey",
  claim_text: "Made with 100% raw wildflower honey",
  claim_type: "ingredient",
  evidence: "Supplier COA #WH-2024-08; single-source apiary affidavit on file.",
  approval_status: "approved",
  risk_level: "low",
});

const rejectedImmunity = makeClaim({
  id: "claim-immunity",
  claim_text: "Clinically proven to boost immunity",
  claim_type: "health",
  evidence: null,
  approval_status: "rejected",
  risk_level: "high",
});

const SEED_CLAIMS: Claim[] = [approvedHoney, rejectedImmunity];

// Draft that asserts BOTH an approved claim and an unsupported one.
const DRAFT_TEXT =
  "Made with 100% raw wildflower honey. " +
  "It is clinically proven to boost immunity. " +
  "Drizzle it over anything.";

/**
 * Single-turn mock client: returns an 'end_turn' response with the draft text.
 * No tool_use blocks → deterministic, the guardrail is the only thing tested.
 */
function makeMockClient(text: string): AnthropicLike {
  return {
    messages: {
      create(): Promise<AnthropicMessageResponse> {
        return Promise.resolve({
          stop_reason: "end_turn",
          content: [{ type: "text", text }],
        });
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runAgent — claim-to-evidence guardrail", () => {
  it("blocks an unsupported immunity claim and cites an approved one", async () => {
    const result = await runAgent({
      orgId: "org-1",
      profile: "content_strategist",
      userText: "Write a hot honey caption.",
      client: makeMockClient(DRAFT_TEXT),
      claims: SEED_CLAIMS,
    });

    // Not ok — something was blocked.
    expect(result.ok).toBe(false);

    // The immunity claim is blocked at high severity.
    const immunityBlock = result.blocked.find((b) =>
      /immunity/i.test(b.phrase),
    );
    expect(immunityBlock).toBeDefined();
    expect(immunityBlock?.severity).toBe("high");

    // The blocked assertion is stripped from the returned text.
    expect(result.text.toLowerCase()).not.toContain("boost immunity");

    // The approved honey claim is cited with its evidence.
    const honeyCitation = result.citations.find((c) => c.claimId === "claim-honey");
    expect(honeyCitation).toBeDefined();
    expect(honeyCitation?.claimText).toBe("Made with 100% raw wildflower honey");
    expect(honeyCitation?.evidence).toContain("WH-2024-08");

    // The approved claim text survives sanitization.
    expect(result.text).toContain("Made with 100% raw wildflower honey");
  });

  it("uses injected claims and skips the DB load", async () => {
    // With an empty claims array, the approved honey claim is no longer citable;
    // the immunity assertion is still blocked by the denylist regardless.
    const result = await runAgent({
      orgId: "org-1",
      profile: "content_strategist",
      userText: "Write a hot honey caption.",
      client: makeMockClient(DRAFT_TEXT),
      claims: [],
    });

    expect(result.citations).toHaveLength(0);
    expect(result.ok).toBe(false);
    expect(result.text.toLowerCase()).not.toContain("boost immunity");
  });
});
