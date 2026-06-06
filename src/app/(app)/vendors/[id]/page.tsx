/**
 * Vendor Workspace — detail page (Module 6).
 *
 * Async server component. `params` is async in this Next version:
 *   const { id } = await params;
 *
 * Loads one vendor (with production runs + lots) and renders four bento
 * sections:
 *   1. Vendor profile card (editable via `updateVendor` Server Action).
 *   2. Production-run planner (list + add form via `createProductionRun`).
 *   3. Documents card (list + upload via `uploadVendorDoc`).
 *   4. RFQ builder (AI-assisted drafting, degrades gracefully before /api/ai).
 *
 * One accent card max per visible row; design tokens only.
 */

import { notFound } from "next/navigation";
import Link from "next/link";

import { requireOrg } from "@/lib/data/org";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { loadVendor } from "@/lib/data/vendors";
import { Eyebrow } from "@/components/bento";
import type { Product, Variant } from "@/lib/types";

import { VendorProfileForm } from "./_components/VendorProfileForm";
import { ProductionRunPlanner } from "./_components/ProductionRunPlanner";
import { VendorDocsCard } from "./_components/VendorDocsCard";
import type { VendorDoc } from "./_components/VendorDocsCard";
import { RFQBuilder } from "./_components/RFQBuilder";

const STORAGE_BUCKET = "files";
const SIGNED_URL_TTL = 3600; // 1 hour

// =============================================================================
// Page
// =============================================================================

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { org } = await requireOrg();
  const supabase = await createClient();

  const detail = await loadVendor(supabase, org.id, id);
  if (!detail) {
    notFound();
  }

  const { vendor, runs } = detail;

  // ── Load products (for the "add run" product dropdown) ──────────────────────
  const productsRes = await supabase
    .from("products")
    .select("id, name")
    .eq("organization_id", org.id)
    .order("name", { ascending: true });

  const products = (productsRes.data ?? []) as Pick<Product, "id" | "name">[];

  // ── COGS: grab first variant's cogs for COGS impact display ─────────────────
  const variantsRes = await supabase
    .from("variants")
    .select("cogs")
    .eq("organization_id", org.id)
    .not("cogs", "is", null)
    .limit(1)
    .maybeSingle<Pick<Variant, "cogs">>();

  const variantCogs = variantsRes.data?.cogs ?? null;

  // ── List vendor documents from the bucket ────────────────────────────────────
  // Use service client for storage listing (bucket is private; RLS policies
  // may not cover storage list operations via the user client).
  const serviceClient = createServiceClient();
  const prefix = `${org.id}/vendors/${id}/`;
  const listRes = await serviceClient.storage
    .from(STORAGE_BUCKET)
    .list(prefix, { limit: 100, sortBy: { column: "created_at", order: "desc" } });

  const docFiles = (listRes.data ?? []).filter((f) => f.name !== ".emptyFolderPlaceholder");

  // Generate signed URLs for each file.
  const docs: VendorDoc[] = (
    await Promise.all(
      docFiles.map(async (f) => {
        const path = `${prefix}${f.name}`;
        const { data } = await serviceClient.storage
          .from(STORAGE_BUCKET)
          .createSignedUrl(path, SIGNED_URL_TTL);
        return {
          name: f.name,
          path,
          signedUrl: data?.signedUrl ?? "#",
        };
      }),
    )
  );

  const vendorTypePretty = vendor.vendor_type
    ? vendor.vendor_type.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : null;

  return (
    <div>
      {/* ── Header ── */}
      <section className="cockpit-section cockpit-head">
        <Link href="/vendors" className="vault-back-link">
          ← All vendors
        </Link>
        <Eyebrow>Vendors</Eyebrow>
        <h1 className="cockpit-title">{vendor.name ?? "Unnamed vendor"}</h1>
        <p className="cockpit-lede">
          {vendorTypePretty ? `${vendorTypePretty} · ` : ""}
          {runs.length === 0
            ? "No production runs yet."
            : `${runs.length} production run${runs.length === 1 ? "" : "s"}.`}{" "}
          Manage profile, runs, documents, and RFQs below.
        </p>
      </section>

      {/* ── Row 1: Profile (8col) + quick-stats (4col) ── */}
      <section className="cockpit-section">
        <div className="cockpit-head">
          <Eyebrow>Vendor profile</Eyebrow>
          <h2 className="cockpit-subhead" style={{ marginTop: "var(--space-3)" }}>
            Profile &amp; capabilities
          </h2>
          <p className="cockpit-subhead-note">
            Update contact info, certifications, MOQ, lead time, and payment
            terms.
          </p>
        </div>
        <div
          className="bento-grid"
          style={{ marginTop: "var(--space-6)", alignItems: "start" }}
        >
          <div style={{ gridColumn: "span 12" }}>
            <VendorProfileForm vendor={vendor} />
          </div>
        </div>
      </section>

      {/* ── Row 2: Production run planner (accent card — most action here) ── */}
      <section className="cockpit-section">
        <div className="cockpit-head">
          <Eyebrow>Production</Eyebrow>
          <h2 className="cockpit-subhead" style={{ marginTop: "var(--space-3)" }}>
            Production run planner
          </h2>
          <p className="cockpit-subhead-note">
            Track every batch: lot, quantity, total cost, unit cost vs COGS, and
            MOQ coverage. Add new runs as you schedule them.
          </p>
        </div>
        <div style={{ marginTop: "var(--space-6)" }}>
          <ProductionRunPlanner
            vendorId={id}
            runs={runs}
            moq={vendor.moq}
            variantCogs={variantCogs}
            products={products}
          />
        </div>
      </section>

      {/* ── Row 3: Documents ── */}
      <section className="cockpit-section">
        <div className="cockpit-head">
          <Eyebrow>Documents</Eyebrow>
          <h2 className="cockpit-subhead" style={{ marginTop: "var(--space-3)" }}>
            Certifications &amp; contracts
          </h2>
          <p className="cockpit-subhead-note">
            Upload PDFs or images for certifications, COAs, MSAs, and contracts.
            Files are stored privately under your org&apos;s folder.
          </p>
        </div>
        <div
          className="bento-grid"
          style={{ marginTop: "var(--space-6)", alignItems: "start" }}
        >
          <div style={{ gridColumn: "span 8" }}>
            <VendorDocsCard vendorId={id} initialDocs={docs} />
          </div>
        </div>
      </section>

      {/* ── Row 4: RFQ builder ── */}
      <section className="cockpit-section">
        <div className="cockpit-head">
          <Eyebrow>RFQ</Eyebrow>
          <h2 className="cockpit-subhead" style={{ marginTop: "var(--space-3)" }}>
            RFQ builder
          </h2>
          <p className="cockpit-subhead-note">
            Compose a Request for Quote. Fill in the details and draft manually
            or click &ldquo;Draft RFQ with AI&rdquo; when the AI workspace is
            ready.
          </p>
        </div>
        <div style={{ marginTop: "var(--space-6)" }}>
          <RFQBuilder vendor={vendor} />
        </div>
      </section>
    </div>
  );
}
