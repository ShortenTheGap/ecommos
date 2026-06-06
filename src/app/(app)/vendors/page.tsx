/**
 * Vendor Workspace — catalogue list (Module 6).
 *
 * Async server component:
 *   1. Resolves the active org (RLS-respecting via requireOrg()).
 *   2. Loads the vendor list read model (`loadVendors`).
 *   3. Renders one bento card per vendor with type badge, MOQ, lead time,
 *      certification chips, and production-run count. Each card links to
 *      /vendors/[id].
 *   4. Shows an inline "Add vendor" form (Server Action `createVendor`).
 *   5. EmptyState when the org has no vendors.
 *
 * Design: one accent card max per row (first vendor with shortest lead time
 * as the "book first" highlight). Token colors only. Paper & Ink Bento.
 */

import type { CSSProperties } from "react";
import Link from "next/link";

import { requireOrg } from "@/lib/data/org";
import { createClient } from "@/lib/supabase/server";
import { loadVendors, type VendorListItem } from "@/lib/data/vendors";
import { formatNumber, EM_DASH } from "@/lib/format";
import { Card, Eyebrow } from "@/components/bento";
import { EmptyState } from "@/components/states";
import { AddVendorForm } from "./_components/AddVendorForm";
import type { VendorType } from "@/lib/types";

// =============================================================================
// Presentation helpers
// =============================================================================

const VENDOR_TYPE_LABELS: Record<VendorType, string> = {
  co_packer: "Co-packer",
  supplier: "Supplier",
  packaging: "Packaging",
  "3pl": "3PL",
  agency: "Agency",
};

function TypeBadge({ type }: { type: VendorType | null }) {
  if (!type) return null;
  return (
    <span className="vendor-type-badge">
      {VENDOR_TYPE_LABELS[type] ?? type}
    </span>
  );
}

function CertChip({ cert }: { cert: string }) {
  return <span className="vendor-cert-chip">{cert}</span>;
}

function VendorCard({
  item,
  highlight,
}: {
  item: VendorListItem;
  highlight: boolean;
}) {
  const { vendor, productionRunCount } = item;

  return (
    <Link
      href={`/vendors/${vendor.id}`}
      className="vendor-card-link"
      aria-label={`Open ${vendor.name ?? "vendor"}`}
    >
      <Card variant={highlight ? "accent" : "default"} className="vendor-card">
        <div className="vendor-card__head">
          <span className="vendor-card__name">
            {vendor.name ?? "Unnamed vendor"}
          </span>
          <TypeBadge type={vendor.vendor_type} />
        </div>

        <div className="vendor-card__meta">
          <span className="vendor-card__meta-item">
            {vendor.moq != null
              ? `MOQ ${formatNumber(vendor.moq)}`
              : "MOQ " + EM_DASH}
          </span>
          <span className="vendor-card__dot" aria-hidden="true">·</span>
          <span className="vendor-card__meta-item">
            {vendor.lead_time_days != null
              ? `${vendor.lead_time_days}d lead`
              : EM_DASH}
          </span>
          <span className="vendor-card__dot" aria-hidden="true">·</span>
          <span className="vendor-card__meta-item">
            {productionRunCount === 0
              ? "No runs"
              : `${formatNumber(productionRunCount)} run${productionRunCount === 1 ? "" : "s"}`}
          </span>
        </div>

        {(vendor.certifications ?? []).length > 0 && (
          <div className="vendor-card__certs">
            {(vendor.certifications ?? []).map((cert) => (
              <CertChip key={cert} cert={cert} />
            ))}
          </div>
        )}
      </Card>
    </Link>
  );
}

// =============================================================================
// Page
// =============================================================================

export default async function VendorsPage() {
  const { org } = await requireOrg();
  const supabase = await createClient();
  const vendors = await loadVendors(supabase, org.id);

  // Accent highlight: the vendor with the shortest lead time (book soonest).
  const highlightId =
    vendors.reduce<VendorListItem | null>((best, item) => {
      const days = item.vendor.lead_time_days;
      if (days == null) return best;
      if (best == null || best.vendor.lead_time_days == null) return item;
      return days < best.vendor.lead_time_days ? item : best;
    }, null)?.vendor.id ?? null;

  const span6: CSSProperties = { gridColumn: "span 6" };
  const spanFull: CSSProperties = { gridColumn: "span 12" };

  return (
    <div>
      {/* ── Header ── */}
      <section className="cockpit-section cockpit-head">
        <Eyebrow>Vendors</Eyebrow>
        <h1 className="cockpit-title">Vendor Workspace</h1>
        <p className="cockpit-lede">
          Co-packers, suppliers, packaging partners, and 3PLs. Track
          certifications, MOQs, lead times, and production runs — all in one
          place. The highlighted vendor has the shortest lead time.
        </p>
      </section>

      {/* ── Vendor grid ── */}
      <section className="cockpit-section">
        {vendors.length === 0 ? (
          <EmptyState
            label="No vendors yet"
            description="Add your co-packers, suppliers, and packaging partners to start tracking production runs and documents."
          />
        ) : (
          <div className="bento-grid">
            {vendors.map((item) => (
              <div key={item.vendor.id} style={span6}>
                <VendorCard
                  item={item}
                  highlight={item.vendor.id === highlightId}
                />
              </div>
            ))}
          </div>
        )}

        {/* ── Add vendor ── */}
        <div
          className="bento-grid"
          style={{ marginTop: "var(--space-6)" }}
        >
          <div style={spanFull}>
            <AddVendorForm />
          </div>
        </div>
      </section>
    </div>
  );
}
