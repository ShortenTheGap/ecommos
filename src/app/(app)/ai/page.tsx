/**
 * AI Workspace (Module 6) — server component.
 *
 * 1. Resolves the active org (RLS-respecting via requireOrg()).
 * 2. Derives the profile list (key, label, suggestions) from AGENT_PROFILES.
 *    This data is plain (no IO, no server-only imports) — safe to pass to the
 *    client component as props, keeping server-only tool/run modules out of
 *    the client bundle entirely.
 * 3. Renders the eyebrow, heading, and lede, then the client <AiChat>.
 */

import { requireOrg } from "@/lib/data/org";
import { AGENT_PROFILES } from "@/lib/ai/agents";
import type { AgentProfile } from "@/lib/ai/agents";
import { Eyebrow } from "@/components/bento";
import { AiChat } from "./_components/AiChat";
import type { ProfileItem } from "./_components/AiChat";

export default async function AiPage() {
  const { org } = await requireOrg();

  // Derive the picker data on the server — no server-only symbols cross into
  // the client component, and the `system` prompt stays server-side.
  const profiles: ProfileItem[] = (
    Object.keys(AGENT_PROFILES) as AgentProfile[]
  ).map((key) => ({
    key,
    label: AGENT_PROFILES[key].label,
    suggestions: AGENT_PROFILES[key].suggestions,
  }));

  return (
    <div className="ai-page">
      {/* ── Header ── */}
      <section className="cockpit-section cockpit-head">
        <Eyebrow>AI Workspace</Eyebrow>
        <h1 className="cockpit-title">Ask your AI analyst</h1>
        <p className="cockpit-lede">
          Pick an agent profile, ask a question, and get a grounded answer
          drawn from {org.name}&apos;s real data — with visible sources and
          transparent guardrails on every response.
        </p>
      </section>

      {/* ── Chat ── */}
      <section className="cockpit-section">
        <AiChat profiles={profiles} />
      </section>
    </div>
  );
}
