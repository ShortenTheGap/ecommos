/**
 * Products & Compliance Vault data loaders (Module 2).
 *
 * Two read models, both org-scoped and RLS-respecting when passed the cookie
 * client:
 *
 *   loadProducts(supabase, orgId) — the catalogue list. Each product carries a
 *     variant summary (count + price range) and a compliance summary (truth
 *     record approval status + claim counts by status). Used by the list page.
 *
 *   loadProduct(supabase, orgId, productId) — a single product with its
 *     variants, its single product_truth_record (or null), and all of its
 *     claims. Used by the detail/editor page.
 *
 * Storage convention: label/nutrition uploads live in the private `files`
 * bucket under `${orgId}/${productId}/...`. Reads use signed URLs (see the
 * actions module). This loader only deals with relational data.
 *
 * Money convention: decimal currency units (USD), matching the rest of the app.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Product,
  Variant,
  ProductTruthRecord,
  Claim,
  ClaimApprovalStatus,
} from "@/lib/types";

// =============================================================================
// Exported types
// =============================================================================

/** Variant rollup for the list view. */
export interface VariantSummary {
  count: number;
  /** Lowest variant price (decimal USD), or null when no priced variants. */
  minPrice: number | null;
  /** Highest variant price (decimal USD), or null when no priced variants. */
  maxPrice: number | null;
}

/** Claim counts grouped by approval status. */
export interface ClaimCounts {
  approved: number;
  pending: number;
  rejected: number;
  total: number;
}

/** A product as shown in the catalogue list. */
export interface ProductListItem {
  product: Product;
  variants: VariantSummary;
  /** Approval status of the product's truth record, or null when none exists. */
  truthStatus: ProductTruthRecord["approval_status"] | null;
  claims: ClaimCounts;
}

/** Full detail payload for the editor page. */
export interface ProductDetail {
  product: Product;
  variants: Variant[];
  /** The single truth record, or null when the product has none yet. */
  truthRecord: ProductTruthRecord | null;
  claims: Claim[];
}

// =============================================================================
// Internal helpers
// =============================================================================

/** Build a ClaimCounts tally from a list of claims. */
function tallyClaims(claims: Pick<Claim, "approval_status">[]): ClaimCounts {
  const counts: ClaimCounts = { approved: 0, pending: 0, rejected: 0, total: 0 };
  for (const claim of claims) {
    const status: ClaimApprovalStatus = claim.approval_status;
    counts[status] += 1;
    counts.total += 1;
  }
  return counts;
}

/** Variant price range over a list of variants (null-safe). */
function summariseVariants(variants: Pick<Variant, "price">[]): VariantSummary {
  let minPrice: number | null = null;
  let maxPrice: number | null = null;
  for (const variant of variants) {
    const price = variant.price;
    if (price == null) continue;
    minPrice = minPrice === null ? price : Math.min(minPrice, price);
    maxPrice = maxPrice === null ? price : Math.max(maxPrice, price);
  }
  return { count: variants.length, minPrice, maxPrice };
}

// =============================================================================
// loadProducts — catalogue list
// =============================================================================

/**
 * Load every product for an org with variant + compliance summaries.
 *
 * Fetches products, variants, truth records and claims in parallel, then groups
 * the child rows by product_id in memory (avoids N+1 round-trips).
 */
export async function loadProducts(
  supabase: SupabaseClient,
  orgId: string,
): Promise<ProductListItem[]> {
  const [productsRes, variantsRes, truthRes, claimsRes] = await Promise.all([
    supabase
      .from("products")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: true }),
    supabase
      .from("variants")
      .select("id, product_id, price")
      .eq("organization_id", orgId),
    supabase
      .from("product_truth_records")
      .select("product_id, approval_status")
      .eq("organization_id", orgId),
    supabase
      .from("claims")
      .select("product_id, approval_status")
      .eq("organization_id", orgId),
  ]);

  for (const res of [productsRes, variantsRes, truthRes, claimsRes]) {
    if (res.error) {
      throw new Error(`[products] Supabase read failed: ${res.error.message}`);
    }
  }

  const products = (productsRes.data ?? []) as Product[];
  const variants = (variantsRes.data ?? []) as Pick<
    Variant,
    "id" | "product_id" | "price"
  >[];
  const truthRecords = (truthRes.data ?? []) as Pick<
    ProductTruthRecord,
    "product_id" | "approval_status"
  >[];
  const claims = (claimsRes.data ?? []) as Pick<
    Claim,
    "product_id" | "approval_status"
  >[];

  // Group children by product_id.
  const pushBy = <T extends { product_id: string | null }>(
    rows: T[],
  ): Map<string, T[]> => {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      if (!row.product_id) continue;
      const bucket = map.get(row.product_id);
      if (bucket) bucket.push(row);
      else map.set(row.product_id, [row]);
    }
    return map;
  };

  const variantsByProduct = pushBy(variants);
  const claimsByProduct = pushBy(claims);

  const truthByProduct = new Map<string, ProductTruthRecord["approval_status"]>();
  for (const t of truthRecords) {
    if (!t.product_id) continue;
    // A product should have at most one truth record; first wins if duplicated.
    if (!truthByProduct.has(t.product_id)) {
      truthByProduct.set(t.product_id, t.approval_status);
    }
  }

  return products.map((product) => ({
    product,
    variants: summariseVariants(variantsByProduct.get(product.id) ?? []),
    truthStatus: truthByProduct.get(product.id) ?? null,
    claims: tallyClaims(claimsByProduct.get(product.id) ?? []),
  }));
}

// =============================================================================
// loadProduct — single product detail
// =============================================================================

/**
 * Load a single product with its variants, truth record (or null) and claims.
 * Returns null when the product does not exist or is not visible to the caller.
 */
export async function loadProduct(
  supabase: SupabaseClient,
  orgId: string,
  productId: string,
): Promise<ProductDetail | null> {
  const productRes = await supabase
    .from("products")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", productId)
    .maybeSingle<Product>();

  if (productRes.error) {
    throw new Error(`[products] Supabase read failed: ${productRes.error.message}`);
  }
  if (!productRes.data) {
    return null;
  }

  const [variantsRes, truthRes, claimsRes] = await Promise.all([
    supabase
      .from("variants")
      .select("*")
      .eq("organization_id", orgId)
      .eq("product_id", productId)
      .order("sku", { ascending: true }),
    supabase
      .from("product_truth_records")
      .select("*")
      .eq("organization_id", orgId)
      .eq("product_id", productId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle<ProductTruthRecord>(),
    supabase
      .from("claims")
      .select("*")
      .eq("organization_id", orgId)
      .eq("product_id", productId)
      .order("created_at", { ascending: true }),
  ]);

  for (const res of [variantsRes, truthRes, claimsRes]) {
    if (res.error) {
      throw new Error(`[products] Supabase read failed: ${res.error.message}`);
    }
  }

  return {
    product: productRes.data,
    variants: (variantsRes.data ?? []) as Variant[],
    truthRecord: truthRes.data ?? null,
    claims: (claimsRes.data ?? []) as Claim[],
  };
}
