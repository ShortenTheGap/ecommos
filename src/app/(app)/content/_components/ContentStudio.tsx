"use client";

/**
 * Content Studio — AI-assisted content drafting panel (Module 4).
 *
 * The form lets the user pick a content type (ad angle, product copy, email,
 * UGC brief) and enter an optional focus note, then POSTs to /api/ai with
 * profile "content_strategist".
 *
 * AI response rendering:
 *   - `text`      — the draft, rendered verbatim in a readable card.
 *   - `citations` — claim sources shown with accent dots (same visual pattern
 *                   as the AI workspace).
 *   - `blocked`   — any blocked-claim notice rendered as an accent card, NOT
 *                   red (informational, not an error).
 *
 * Graceful degradation: a 502 (missing ANTHROPIC_API_KEY) surfaces an inline
 * accent-card notice — "AI unavailable — set ANTHROPIC_API_KEY" — identical to
 * the RFQBuilder pattern. useTransition for pending/disabled state.
 */

import { useState, useTransition } from "react";

import { Card, Eyebrow, Button } from "@/components/bento";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ContentType = "ad_angle" | "product_copy" | "email" | "ugc_brief";

const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  ad_angle: "Ad Angle",
  product_copy: "Product Copy",
  email: "Email",
  ugc_brief: "UGC Brief",
};

interface Citation {
  claim_text?: string;
  text?: string;
  [key: string]: unknown;
}

interface BlockedClaim {
  claim_text?: string;
  reason?: string;
  [key: string]: unknown;
}

interface AiResponse {
  text?: string;
  citations?: Citation[];
  blocked?: BlockedClaim[];
  ok?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const PRODUCT_NAME = "Ember — Premium Hot Honey";

export function ContentStudio() {
  const [contentType, setContentType] = useState<ContentType>("ad_angle");
  const [focusNote, setFocusNote] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [blocked, setBlocked] = useState<BlockedClaim[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function buildMessage(): string {
    const typeLabel = CONTENT_TYPE_LABELS[contentType];
    return [
      `Create a ${typeLabel} for ${PRODUCT_NAME}.`,
      focusNote ? `Focus: ${focusNote}` : null,
      "Use approved health claims where applicable. Keep copy compelling and compliant.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  function handleDraft() {
    setNotice(null);
    setDraft(null);
    setCitations([]);
    setBlocked([]);

    startTransition(async () => {
      try {
        const res = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile: "content_strategist",
            message: buildMessage(),
          }),
        });

        if (res.status === 502) {
          setNotice("AI unavailable — set ANTHROPIC_API_KEY to enable drafting.");
          return;
        }

        if (!res.ok) {
          setNotice("AI drafting is unavailable right now. Try again shortly.");
          return;
        }

        const data = (await res.json()) as AiResponse;
        const text = data.text ?? "";

        if (!text) {
          setNotice("AI returned an empty draft. Try adjusting your focus note.");
          return;
        }

        setDraft(text);
        setCitations(Array.isArray(data.citations) ? data.citations : []);
        setBlocked(Array.isArray(data.blocked) ? data.blocked : []);
      } catch {
        // Network error or endpoint not reachable.
        setNotice("AI drafting is unavailable right now. Check your connection.");
      }
    });
  }

  return (
    <Card variant="soft">
      <Eyebrow>Generate Content</Eyebrow>
      <p className="vault-empty-note" style={{ marginTop: "var(--space-3)" }}>
        Pick a format and an optional focus, then draft with AI. All output
        references only approved claims.
      </p>

      <div className="vault-form" style={{ marginTop: "var(--space-5)" }}>
        {/* Content type selector */}
        <div className="vault-field-row">
          <div className="vault-field">
            <label className="vault-label" htmlFor="studio-type">
              Content type
            </label>
            <select
              id="studio-type"
              className="vault-input"
              value={contentType}
              onChange={(e) => setContentType(e.target.value as ContentType)}
            >
              {(Object.entries(CONTENT_TYPE_LABELS) as [ContentType, string][]).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ),
              )}
            </select>
          </div>

          <div className="vault-field">
            <label className="vault-label" htmlFor="studio-focus">
              Focus note{" "}
              <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>
                (optional)
              </span>
            </label>
            <input
              id="studio-focus"
              type="text"
              className="vault-input"
              value={focusNote}
              onChange={(e) => setFocusNote(e.target.value)}
              placeholder="e.g. winter gifting, heat level, chef audience"
            />
          </div>
        </div>

        {/* Draft button */}
        <div className="vault-form-footer">
          <Button
            type="button"
            variant="ghost"
            disabled={isPending}
            onClick={handleDraft}
          >
            {isPending ? "Drafting…" : "Draft with AI"}
          </Button>
        </div>

        {/* Graceful 502 / unavailable notice */}
        {notice && (
          <div
            className="bento-card bento-card--accent"
            role="status"
            style={{ marginTop: "var(--space-4)", padding: "var(--space-4) var(--space-5)" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <span
                aria-hidden="true"
                style={{
                  display: "inline-block",
                  width: 6,
                  height: 6,
                  borderRadius: "var(--radius-full)",
                  background: "var(--accent)",
                  flexShrink: 0,
                }}
              />
              <span className="vault-label" style={{ letterSpacing: 0 }}>
                {notice}
              </span>
            </div>
          </div>
        )}

        {/* Blocked-claim notice (accent card, not red) */}
        {blocked.length > 0 && (
          <div
            className="bento-card bento-card--accent"
            role="note"
            style={{ marginTop: "var(--space-4)", padding: "var(--space-4) var(--space-5)" }}
          >
            <p className="kpi-label" style={{ marginBottom: "var(--space-2)" }}>
              Some claims were not included
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
              {blocked.map((b, i) => {
                const text = b.claim_text ?? JSON.stringify(b);
                return (
                  <li key={i} style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-start" }}>
                    <span
                      aria-hidden="true"
                      style={{
                        marginTop: "0.35em",
                        display: "inline-block",
                        width: 5,
                        height: 5,
                        borderRadius: "var(--radius-full)",
                        background: "var(--accent)",
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
                      {text}
                      {b.reason ? ` — ${b.reason}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Draft output */}
        {draft && (
          <div style={{ marginTop: "var(--space-5)" }}>
            <div className="bento-card" style={{ whiteSpace: "pre-wrap", fontSize: "var(--text-sm)", lineHeight: 1.75 }}>
              {draft}
            </div>

            {/* Citations */}
            {citations.length > 0 && (
              <div style={{ marginTop: "var(--space-4)" }}>
                <p className="kpi-label" style={{ marginBottom: "var(--space-2)" }}>
                  Sources
                </p>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                  {citations.map((c, i) => {
                    const text = c.claim_text ?? c.text ?? JSON.stringify(c);
                    return (
                      <li key={i} style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-start" }}>
                        <span
                          aria-hidden="true"
                          style={{
                            marginTop: "0.4em",
                            display: "inline-block",
                            width: 5,
                            height: 5,
                            borderRadius: "var(--radius-full)",
                            background: "var(--accent)",
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
                          {String(text)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
