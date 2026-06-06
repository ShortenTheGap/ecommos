"use client";

/**
 * Claims tracker — client component wrapping the `upsertClaim` Server Action
 * (Module 2).
 *
 * Lists every claim with its type, evidence, approval status, risk level and
 * channels. Each claim can be edited inline (approval status + evidence) and a
 * new claim can be added. Approved-with-evidence claims are visually marked as
 * "citable by AI"; pending/rejected are flagged.
 *
 * Each form posts native FormData to the action and surfaces pending + error
 * state, disabling its submit button while pending.
 */

import { useState, useTransition } from "react";

import { Card, Button } from "@/components/bento";
import type { Claim } from "@/lib/types";
import { claimApprovalStatuses, claimRiskLevels } from "@/lib/validation";
import { upsertClaim } from "../../actions";

const STATUS_LABEL: Record<(typeof claimApprovalStatuses)[number], string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const RISK_LABEL: Record<(typeof claimRiskLevels)[number], string> = {
  low: "Low risk",
  medium: "Medium risk",
  high: "High risk",
};

/** True when a claim is approved AND backed by evidence (i.e. AI-citable). */
function isCitable(claim: Claim): boolean {
  return claim.approval_status === "approved" && !!claim.evidence;
}

// =============================================================================
// Per-claim edit row
// =============================================================================

function ClaimRow({ productId, claim }: { productId: string; claim: Claim }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await upsertClaim(formData);
      if (result.ok) setSaved(true);
      else setError(result.error);
    });
  }

  const citable = isCitable(claim);
  const statusTone =
    claim.approval_status === "approved"
      ? "claim-status--ok"
      : claim.approval_status === "rejected"
        ? "claim-status--bad"
        : "claim-status--warn";

  return (
    <Card variant={citable ? "accent" : "default"}>
      <form action={handleSubmit} className="claim-form">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="claimId" value={claim.id} />
        {/* Preserve fields not exposed in the inline editor. */}
        <input type="hidden" name="claimText" value={claim.claim_text} />
        <input type="hidden" name="claimType" value={claim.claim_type ?? ""} />
        <input type="hidden" name="riskLevel" value={claim.risk_level} />
        <input
          type="hidden"
          name="channelsUsed"
          value={(claim.channels_used ?? []).join(", ")}
        />

        <div className="claim-head">
          <span className="claim-text">{claim.claim_text}</span>
          <span className="claim-tags">
            {citable ? (
              <span className="claim-badge claim-badge--citable">Citable by AI</span>
            ) : (
              <span className="claim-badge claim-badge--blocked">
                {claim.approval_status === "approved"
                  ? "Needs evidence"
                  : "Not citable"}
              </span>
            )}
            <span className={`claim-status ${statusTone}`}>
              {STATUS_LABEL[claim.approval_status]}
            </span>
          </span>
        </div>

        <div className="claim-meta">
          {claim.claim_type && (
            <span className="claim-meta-item">{claim.claim_type}</span>
          )}
          <span className="claim-meta-item">{RISK_LABEL[claim.risk_level]}</span>
          {(claim.channels_used ?? []).length > 0 && (
            <span className="claim-meta-item">
              {(claim.channels_used ?? []).join(", ")}
            </span>
          )}
        </div>

        <div className="vault-field">
          <label className="vault-label" htmlFor={`evidence-${claim.id}`}>
            Evidence
          </label>
          <textarea
            id={`evidence-${claim.id}`}
            name="evidence"
            className="vault-input vault-textarea"
            rows={2}
            defaultValue={claim.evidence ?? ""}
            placeholder="Link or citation substantiating this claim"
          />
        </div>

        <div className="claim-footer">
          <div className="vault-field vault-field--inline">
            <label className="vault-label" htmlFor={`status-${claim.id}`}>
              Approval
            </label>
            <select
              id={`status-${claim.id}`}
              name="approvalStatus"
              className="vault-input"
              defaultValue={claim.approval_status}
            >
              {claimApprovalStatuses.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="ghost" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          {error && (
            <span className="vault-msg vault-msg--error" role="alert">
              {error}
            </span>
          )}
          {saved && !error && (
            <span className="vault-msg vault-msg--ok" role="status">
              Saved.
            </span>
          )}
        </div>
      </form>
    </Card>
  );
}

// =============================================================================
// Add-claim form
// =============================================================================

function AddClaimForm({ productId }: { productId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await upsertClaim(formData);
      if (result.ok) {
        setFormKey((k) => k + 1); // reset the form fields
        setOpen(false);
      } else {
        setError(result.error);
      }
    });
  }

  if (!open) {
    return (
      <Card variant="soft">
        <div className="claim-add-collapsed">
          <span className="claim-add-note">Add a new marketing claim to track.</span>
          <Button type="button" onClick={() => setOpen(true)}>
            Add claim
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card variant="soft">
      <form key={formKey} action={handleSubmit} className="claim-form">
        <input type="hidden" name="productId" value={productId} />

        <div className="vault-field">
          <label className="vault-label" htmlFor="new-claim-text">
            Claim text
          </label>
          <input
            id="new-claim-text"
            name="claimText"
            type="text"
            className="vault-input"
            required
            placeholder="e.g. Sustainably sourced honey"
          />
        </div>

        <div className="vault-field-row">
          <div className="vault-field">
            <label className="vault-label" htmlFor="new-claim-type">
              Type
            </label>
            <input
              id="new-claim-type"
              name="claimType"
              type="text"
              className="vault-input"
              placeholder="e.g. sourcing, health, quality"
            />
          </div>
          <div className="vault-field">
            <label className="vault-label" htmlFor="new-claim-risk">
              Risk level
            </label>
            <select
              id="new-claim-risk"
              name="riskLevel"
              className="vault-input"
              defaultValue="medium"
            >
              {claimRiskLevels.map((r) => (
                <option key={r} value={r}>
                  {RISK_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="vault-field-row">
          <div className="vault-field">
            <label className="vault-label" htmlFor="new-claim-status">
              Approval status
            </label>
            <select
              id="new-claim-status"
              name="approvalStatus"
              className="vault-input"
              defaultValue="pending"
            >
              {claimApprovalStatuses.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="vault-field">
            <label className="vault-label" htmlFor="new-claim-channels">
              Channels used
            </label>
            <input
              id="new-claim-channels"
              name="channelsUsed"
              type="text"
              className="vault-input"
              placeholder="Comma-separated, e.g. Instagram, Email"
            />
          </div>
        </div>

        <div className="vault-field">
          <label className="vault-label" htmlFor="new-claim-evidence">
            Evidence
          </label>
          <textarea
            id="new-claim-evidence"
            name="evidence"
            className="vault-input vault-textarea"
            rows={2}
            placeholder="Link or citation (required before a claim can be approved & cited)"
          />
        </div>

        <div className="vault-form-footer">
          <Button type="submit" disabled={pending}>
            {pending ? "Adding…" : "Add claim"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          {error && (
            <span className="vault-msg vault-msg--error" role="alert">
              {error}
            </span>
          )}
        </div>
      </form>
    </Card>
  );
}

// =============================================================================
// Tracker
// =============================================================================

export function ClaimsTracker({
  productId,
  claims,
}: {
  productId: string;
  claims: Claim[];
}) {
  return (
    <div className="claims-stack">
      {claims.length === 0 ? (
        <Card variant="soft">
          <p className="vault-empty-note">
            No claims yet. Add one below — only approved claims with evidence
            become citable by the AI.
          </p>
        </Card>
      ) : (
        claims.map((claim) => (
          <ClaimRow key={claim.id} productId={productId} claim={claim} />
        ))
      )}
      <AddClaimForm productId={productId} />
    </div>
  );
}
