/**
 * Product & Compliance Vault — catalogue list (Module 2).
 *
 * Async server component:
 *   1. Resolves the active org (RLS-respecting via requireOrg()).
 *   2. Loads the catalogue read model (`loadProducts`).
 *   3. Renders one bento card per product with a variant summary and a
 *      compliance summary (truth-record status + claim badges).
 *
 * Each card links to /products/[id]. EmptyState when the org has no products.
 * One accent card max per row (the highest-priority compliance attention item).
 */

import type { CSSProperties } from "react";
import Link from "next/link";

import { requireOrg } from "@/lib/data/org";
import { createClient } from "@/lib/supabase/server";
import {
  loadProducts,
  type ProductListItem,
  type VariantSummary,
} from "@/lib/data/products";
import { formatCurrency, formatNumber, EM_DASH } from "@/lib/format";
import { Card, Eyebrow } from "@/components/bento";
import { EmptyState } from "@/components/states";
import {
  ComplianceBadges,
  TruthStatusPill,
  needsAttention,
} from "./_components/compliance";

// =============================================================================
// Presentation helpers
// =============================================================================

/** "$8 – $12", "$8", or em-dash when no priced variants. */
function priceRange(summary: VariantSummary): string {
  if (summary.minPrice === null || summary.maxPrice === null) return EM_DASH;
  if (summary.minPrice === summary.maxPrice) {
    return formatCurrency(summary.minPrice, "USD", 2);
  }
  return `${formatCurrency(summary.minPrice, "USD", 2)} – ${formatCurrency(
    summary.maxPrice,
    "USD",
    2,
  )}`;
}

function ProductCard({
  item,
  highlight,
}: {
  item: ProductListItem;
  highlight: boolean;
}) {
  const { product, variants, truthStatus, claims } = item;
  return (
    <Link
      href={`/products/${product.id}`}
      className="product-card-link"
      aria-label={`Open ${product.name ?? "product"}`}
    >
      <Card variant={highlight ? "accent" : "default"}>
        <div className="product-card">
          <div className="product-card__head">
            <span className="product-card__name">{product.name ?? "Untitled product"}</span>
            {product.category && (
              <span className="product-card__category">{product.category}</span>
            )}
          </div>

          <div className="product-card__meta">
            <span className="product-card__meta-item">
              {formatNumber(variants.count)} variant{variants.count === 1 ? "" : "s"}
            </span>
            <span className="product-card__dot" aria-hidden="true">
              ·
            </span>
            <span className="product-card__meta-item">{priceRange(variants)}</span>
            {product.status && (
              <>
                <span className="product-card__dot" aria-hidden="true">
                  ·
                </span>
                <span className="product-card__meta-item product-card__status">
                  {product.status}
                </span>
              </>
            )}
          </div>

          <div className="product-card__compliance">
            <TruthStatusPill status={truthStatus} />
            <ComplianceBadges counts={claims} />
          </div>
        </div>
      </Card>
    </Link>
  );
}

// =============================================================================
// Page
// =============================================================================

export default async function ProductsPage() {
  const { org } = await requireOrg();
  const supabase = await createClient();
  const products = await loadProducts(supabase, org.id);

  // The single accent highlight: the first product that needs compliance
  // attention (no approved truth record, or no approved claim, or pending items).
  const highlightId = products.find((p) => needsAttention(p))?.product.id ?? null;

  const span6: CSSProperties = { gridColumn: "span 6" };

  return (
    <div>
      <section className="cockpit-section cockpit-head">
        <Eyebrow>Product Vault</Eyebrow>
        <h1 className="cockpit-title">Products &amp; Compliance</h1>
        <p className="cockpit-lede">
          Every SKU&apos;s source of truth: ingredients, allergens, nutrition
          artwork, and the claims your marketing can legally stand behind. The
          highlighted card needs your attention first.
        </p>
      </section>

      <section className="cockpit-section">
        {products.length === 0 ? (
          <EmptyState
            label="No products yet"
            description="Once products sync from your store or are added manually, they appear here with their compliance status."
          />
        ) : (
          <div className="bento-grid">
            {products.map((item) => (
              <div key={item.product.id} style={span6}>
                <ProductCard
                  item={item}
                  highlight={item.product.id === highlightId}
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
