"use client";

/**
 * Message — renders a single conversation turn (user or assistant).
 *
 * User messages: right-aligned, soft-surface pill.
 * Assistant messages: full-width Bento card with optional Citations and
 * Blocked-claim notice sections.
 *
 * Design rules (Paper & Ink Bento):
 *   - Tokens only — no raw hex.
 *   - Citations → small muted list with an accent dot per entry.
 *   - Blocked claims → `.bento-card--accent` notice (NOT raw red) so the
 *     guardrail treatment reads as a feature, not an error state.
 *   - One ink card visible at a time (the "Thinking…" skeleton), accent only
 *     for the blocked-claims notice — satisfied by rendering at most one
 *     blocked-notice card per message.
 */

export interface Citation {
  claimId: string;
  claimText: string;
  evidence: string;
}

export interface BlockedClaim {
  phrase: string;
  reason: string;
  severity: string;
}

export type MessageRole = "user" | "assistant" | "thinking";

export interface MessageData {
  role: MessageRole;
  text: string;
  citations?: Citation[];
  blocked?: BlockedClaim[];
  ok?: boolean;
}

// =============================================================================
// Sub-sections
// =============================================================================

function CitationList({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null;
  return (
    <div className="msg-citations">
      <p className="msg-section-label">Sources</p>
      <ul className="msg-citations__list">
        {citations.map((c) => (
          <li key={c.claimId} className="msg-citations__item">
            <span className="eyebrow-dot msg-citations__dot" aria-hidden="true" />
            <span className="msg-citations__body">
              <span className="msg-citations__claim">{c.claimText}</span>
              <span className="msg-citations__evidence">{c.evidence}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BlockedNotice({ blocked }: { blocked: BlockedClaim[] }) {
  if (blocked.length === 0) return null;
  return (
    <div className="bento-card bento-card--accent msg-blocked" role="alert">
      <p className="msg-blocked__headline">
        <span aria-hidden="true">⚠</span>{" "}
        {blocked.length} claim{blocked.length === 1 ? "" : "s"} removed — not
        backed by approved evidence
      </p>
      <ul className="msg-blocked__list">
        {blocked.map((b, i) => (
          <li key={i} className="msg-blocked__item">
            <span className="msg-blocked__phrase">"{b.phrase}"</span>
            <span className="msg-blocked__reason">{b.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// =============================================================================
// Message component
// =============================================================================

interface MessageProps {
  message: MessageData;
}

export function Message({ message }: MessageProps) {
  const { role, text, citations = [], blocked = [] } = message;

  if (role === "user") {
    return (
      <div className="msg-row msg-row--user">
        <div className="msg-bubble">{text}</div>
      </div>
    );
  }

  if (role === "thinking") {
    return (
      <div className="msg-row msg-row--assistant">
        <div className="bento-card msg-assistant">
          <p className="msg-thinking">Thinking…</p>
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="msg-row msg-row--assistant">
      <div className="bento-card msg-assistant">
        <p className="msg-text">{text}</p>

        {citations.length > 0 && <CitationList citations={citations} />}

        {blocked.length > 0 && <BlockedNotice blocked={blocked} />}
      </div>
    </div>
  );
}
