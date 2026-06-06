"use client";

/**
 * RFQ Builder — composes a Request for Quote for this vendor.
 *
 * The form lets the user fill in product, target volume, packaging needs,
 * required certifications, timeline, and free-form questions. A "Draft RFQ
 * with AI" button POSTs to /api/ai when that endpoint is available.
 *
 * Graceful degradation: /api/ai does not exist yet (it is built in a later
 * task). On any non-200 response (including 404/405) the button shows an
 * inline notice and leaves the manual textarea intact. The user can fill and
 * copy the RFQ manually. When /api/ai returns text it is injected into the
 * textarea.
 */

import { useState, useTransition } from "react";

import { Card, Eyebrow, Button } from "@/components/bento";
import type { Vendor } from "@/lib/types";

export function RFQBuilder({ vendor }: { vendor: Vendor }) {
  const [product, setProduct] = useState("");
  const [volume, setVolume] = useState("");
  const [packaging, setPackaging] = useState("");
  const [certs, setCerts] = useState(
    (vendor.certifications ?? []).join(", "),
  );
  const [timeline, setTimeline] = useState("");
  const [questions, setQuestions] = useState("");
  const [rfqDraft, setRfqDraft] = useState("");
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [aiPending, startAiTransition] = useTransition();

  /** Assemble the RFQ context string from the form values. */
  function buildContext(): string {
    return [
      `Vendor: ${vendor.name ?? "Unknown"}`,
      `Type: ${vendor.vendor_type ?? "—"}`,
      `MOQ: ${vendor.moq ?? "—"} units`,
      `Lead time: ${vendor.lead_time_days ?? "—"} days`,
      `Certifications: ${(vendor.certifications ?? []).join(", ") || "—"}`,
      "",
      `Product: ${product || "—"}`,
      `Target volume: ${volume || "—"}`,
      `Packaging needs: ${packaging || "—"}`,
      `Required certifications: ${certs || "—"}`,
      `Timeline: ${timeline || "—"}`,
      `Questions:\n${questions || "—"}`,
    ].join("\n");
  }

  function handleDraftWithAI() {
    setAiNotice(null);
    startAiTransition(async () => {
      try {
        const res = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile: "vendor_coordinator",
            message: buildContext(),
          }),
        });

        if (!res.ok) {
          // /api/ai not yet live — degrade gracefully.
          setAiNotice(
            "AI drafting will be available once the AI workspace is enabled.",
          );
          return;
        }

        const data = (await res.json()) as { reply?: string; text?: string };
        const text = data.reply ?? data.text ?? "";
        if (text) {
          setRfqDraft(text);
          setAiNotice(null);
        } else {
          setAiNotice(
            "AI drafting will be available once the AI workspace is enabled.",
          );
        }
      } catch {
        // Network error or endpoint missing.
        setAiNotice(
          "AI drafting will be available once the AI workspace is enabled.",
        );
      }
    });
  }

  return (
    <Card variant="soft">
      <Eyebrow>RFQ Builder</Eyebrow>
      <p className="vault-empty-note" style={{ marginTop: "var(--space-3)" }}>
        Compose a Request for Quote. Fill in the fields, then draft manually or
        let AI assemble it for you.
      </p>

      <div className="vault-form" style={{ marginTop: "var(--space-5)" }}>
        <div className="vault-field-row">
          <div className="vault-field">
            <label className="vault-label" htmlFor="rfq-product">
              Product
            </label>
            <input
              id="rfq-product"
              type="text"
              className="vault-input"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              placeholder="e.g. 8oz Hot Honey"
            />
          </div>
          <div className="vault-field">
            <label className="vault-label" htmlFor="rfq-volume">
              Target volume
            </label>
            <input
              id="rfq-volume"
              type="text"
              className="vault-input"
              value={volume}
              onChange={(e) => setVolume(e.target.value)}
              placeholder="e.g. 5,000 units/month"
            />
          </div>
        </div>

        <div className="vault-field-row">
          <div className="vault-field">
            <label className="vault-label" htmlFor="rfq-packaging">
              Packaging needs
            </label>
            <input
              id="rfq-packaging"
              type="text"
              className="vault-input"
              value={packaging}
              onChange={(e) => setPackaging(e.target.value)}
              placeholder="e.g. Glass jar, tamper-evident lid"
            />
          </div>
          <div className="vault-field">
            <label className="vault-label" htmlFor="rfq-timeline">
              Timeline
            </label>
            <input
              id="rfq-timeline"
              type="text"
              className="vault-input"
              value={timeline}
              onChange={(e) => setTimeline(e.target.value)}
              placeholder="e.g. First run needed by August 2026"
            />
          </div>
        </div>

        <div className="vault-field">
          <label className="vault-label" htmlFor="rfq-certs">
            Required certifications
          </label>
          <input
            id="rfq-certs"
            type="text"
            className="vault-input"
            value={certs}
            onChange={(e) => setCerts(e.target.value)}
            placeholder="SQF, Organic (pre-filled from vendor profile)"
          />
        </div>

        <div className="vault-field">
          <label className="vault-label" htmlFor="rfq-questions">
            Questions for the vendor
          </label>
          <textarea
            id="rfq-questions"
            className="vault-input vault-textarea"
            rows={3}
            value={questions}
            onChange={(e) => setQuestions(e.target.value)}
            placeholder="What is your minimum order for contract manufacturing? Do you handle ingredient sourcing?"
          />
        </div>

        {/* ── AI Draft button ── */}
        <div className="vault-form-footer">
          <Button
            type="button"
            variant="ghost"
            disabled={aiPending}
            onClick={handleDraftWithAI}
          >
            {aiPending ? "Drafting…" : "Draft RFQ with AI"}
          </Button>
        </div>

        {/* Graceful degradation notice */}
        {aiNotice && (
          <div className="rfq-ai-notice" role="status">
            <span className="eyebrow-dot" aria-hidden="true" />
            {aiNotice}
          </div>
        )}

        {/* ── Draft output / manual editor ── */}
        <div className="vault-field" style={{ marginTop: "var(--space-2)" }}>
          <label className="vault-label" htmlFor="rfq-draft">
            RFQ draft
          </label>
          <textarea
            id="rfq-draft"
            className="vault-input vault-textarea"
            rows={10}
            value={rfqDraft}
            onChange={(e) => setRfqDraft(e.target.value)}
            placeholder="Your RFQ will appear here — or write it manually. Copy and send to the vendor directly."
          />
          <span className="vault-help">
            Edit freely. Copy and paste into your email to the vendor.
          </span>
        </div>
      </div>
    </Card>
  );
}
