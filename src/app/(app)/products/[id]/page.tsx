/**
 * Product & Compliance Vault — detail / editor (Module 2).
 *
 * Async server component. `params` is async in this Next version:
 *   const { id } = await params;
 *
 * Loads one product (variants + truth record + claims) and renders three bento
 * sections, each a card:
 *   1. Truth record editor (ingredients, allergens, serving size, net weight,
 *      approval status, nutrition + label uploads) — saved via updateTruthRecord.
 *   2. Claims tracker (list + per-claim edit + add-claim) — saved via upsertClaim.
 *   3. Product-page sync checklist — derived, purely presentational.
 *
 * The interactive forms are client sub-components that call the Server Actions
 * and surface pending/error state. One accent card max per visible row.
 */

import { notFound } from "next/navigation";
import Link from "next/link";

import { requireOrg } from "@/lib/data/org";
import { createClient } from "@/lib/supabase/server";
import { loadProduct, type ProductDetail } from "@/lib/data/products";
import { formatCurrency, formatNumber, EM_DASH } from "@/lib/format";
import { Card, Eyebrow } from "@/components/bento";
import { TruthRecordForm } from "./_components/TruthRecordForm";
import { ClaimsTracker } from "./_components/ClaimsTracker";
import { SyncChecklist } from "./_components/SyncChecklist";

// =============================================================================
// Variant summary card (read-only)
// =============================================================================

function VariantSummaryCard({ detail }: { detail: ProductDetail }) {
  const { variants } = detail;
  return (
    <Card variant="soft">
      <p className="kpi-label">Variants</p>
      {variants.length === 0 ? (
        <p className="vault-empty-note">No variants on this product yet.</p>
      ) : (
        <ul className="variant-list">
          {variants.map((v) => (
            <li key={v.id} className="variant-row">
              <span className="variant-row__sku">{v.sku ?? "—"}</span>
              <span className="variant-row__price">
                {v.price === null ? EM_DASH : formatCurrency(v.price, "USD", 2)}
              </span>
              <span className="variant-row__qty">
                {v.inventory_qty === null
                  ? EM_DASH
                  : `${formatNumber(v.inventory_qty)} on hand`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// =============================================================================
// Page
// =============================================================================

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { org } = await requireOrg();
  const supabase = await createClient();
  const detail = await loadProduct(supabase, org.id, id);

  if (!detail) {
    notFound();
  }

  const { product, truthRecord, claims } = detail;

  return (
    <div>
      {/* ── Header ── */}
      <section className="cockpit-section cockpit-head">
        <Link href="/products" className="vault-back-link">
          ← All products
        </Link>
        <Eyebrow>Product Vault</Eyebrow>
        <h1 className="cockpit-title">{product.name ?? "Untitled product"}</h1>
        <p className="cockpit-lede">
          {product.category ? `${product.category} · ` : ""}
          {product.status ?? "draft"}. Manage the single source of truth and the
          claims your marketing can legally stand behind.
        </p>
      </section>

      {/* ── Row 1: Truth record editor + variants ── */}
      <section className="cockpit-section">
        <div className="cockpit-head">
          <Eyebrow>Source of truth</Eyebrow>
          <h2 className="cockpit-subhead" style={{ marginTop: "var(--space-3)" }}>
            Truth record
          </h2>
          <p className="cockpit-subhead-note">
            Ingredients, allergens, and nutrition artwork. Set the approval status
            once it is reviewed — approved records are what the AI cites.
          </p>
        </div>
        <div
          className="bento-grid"
          style={{ marginTop: "var(--space-6)", alignItems: "start" }}
        >
          <div style={{ gridColumn: "span 8" }}>
            <TruthRecordForm productId={product.id} record={truthRecord} />
          </div>
          <div style={{ gridColumn: "span 4" }}>
            <VariantSummaryCard detail={detail} />
          </div>
        </div>
      </section>

      {/* ── Row 2: Claims tracker ── */}
      <section className="cockpit-section">
        <div className="cockpit-head">
          <Eyebrow>Marketing claims</Eyebrow>
          <h2 className="cockpit-subhead" style={{ marginTop: "var(--space-3)" }}>
            Claims tracker
          </h2>
          <p className="cockpit-subhead-note">
            Only claims that are <strong>approved with evidence</strong> are
            citable by the AI. Pending and rejected claims are flagged so nothing
            ships unsubstantiated.
          </p>
        </div>
        <div style={{ marginTop: "var(--space-6)" }}>
          <ClaimsTracker productId={product.id} claims={claims} />
        </div>
      </section>

      {/* ── Row 3: Product-page sync checklist ── */}
      <section className="cockpit-section">
        <div className="cockpit-head">
          <Eyebrow>Launch readiness</Eyebrow>
          <h2 className="cockpit-subhead" style={{ marginTop: "var(--space-3)" }}>
            Product-page sync checklist
          </h2>
          <p className="cockpit-subhead-note">
            What still needs doing before this product page is compliant and ready
            to publish.
          </p>
        </div>
        <div style={{ marginTop: "var(--space-6)" }}>
          <SyncChecklist truthRecord={truthRecord} claims={claims} />
        </div>
      </section>
    </div>
  );
}
