/**
 * Shared, purely-presentational compliance widgets (Module 2).
 *
 * Server-safe (no client hooks): used by both the catalogue list and the detail
 * page. Token styling only — classes defined in globals.css.
 */

import type { ClaimCounts, ProductListItem } from "@/lib/data/products";
import type { ProductTruthRecord } from "@/lib/types";

type TruthStatus = ProductTruthRecord["approval_status"] | null;

const TRUTH_LABEL: Record<NonNullable<TruthStatus>, string> = {
  draft: "Truth record · Draft",
  pending: "Truth record · Pending",
  approved: "Truth record · Approved",
};

const TRUTH_TONE: Record<NonNullable<TruthStatus>, string> = {
  draft: "compliance-pill--neutral",
  pending: "compliance-pill--warn",
  approved: "compliance-pill--ok",
};

/** A single pill summarising the truth-record approval status (or "none"). */
export function TruthStatusPill({ status }: { status: TruthStatus }) {
  if (status === null) {
    return (
      <span className="compliance-pill compliance-pill--neutral">
        No truth record
      </span>
    );
  }
  return (
    <span className={`compliance-pill ${TRUTH_TONE[status]}`}>
      {TRUTH_LABEL[status]}
    </span>
  );
}

/** Claim count badges: approved (ok), pending (warn), rejected (muted). */
export function ComplianceBadges({ counts }: { counts: ClaimCounts }) {
  if (counts.total === 0) {
    return <span className="compliance-badge compliance-badge--muted">No claims</span>;
  }
  return (
    <span className="compliance-badges">
      {counts.approved > 0 && (
        <span className="compliance-badge compliance-badge--ok">
          {counts.approved} approved
        </span>
      )}
      {counts.pending > 0 && (
        <span className="compliance-badge compliance-badge--warn">
          {counts.pending} pending
        </span>
      )}
      {counts.rejected > 0 && (
        <span className="compliance-badge compliance-badge--muted">
          {counts.rejected} rejected
        </span>
      )}
    </span>
  );
}

/**
 * Whether a product needs compliance attention — drives the single accent
 * highlight on the catalogue. True when the truth record is not approved, or
 * there are no approved claims, or any claim is still pending.
 */
export function needsAttention(item: ProductListItem): boolean {
  if (item.truthStatus !== "approved") return true;
  if (item.claims.approved === 0) return true;
  if (item.claims.pending > 0) return true;
  return false;
}
