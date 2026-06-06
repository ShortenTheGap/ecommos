/**
 * Vendor Workspace data loaders (Module 6).
 *
 * Two read models, both org-scoped and RLS-respecting when passed the cookie
 * client:
 *
 *   loadVendors(supabase, orgId) — the vendor list. Each vendor carries a count
 *     of linked production_runs. Used by the list page.
 *
 *   loadVendor(supabase, orgId, vendorId) — a single vendor with its
 *     production_runs (including product name + any linked inventory_lots).
 *     Used by the detail page.
 *
 * Storage convention: vendor documents live in the private `files` bucket under
 * `${orgId}/vendors/${vendorId}/...`. This loader only deals with relational
 * data; signed URLs are generated in the actions module.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Vendor, ProductionRun, InventoryLot, Product } from "@/lib/types";

// =============================================================================
// Exported types
// =============================================================================

/** A vendor as shown in the catalogue list, with production-run count. */
export interface VendorListItem {
  vendor: Vendor;
  /** Number of production runs linked to this vendor. */
  productionRunCount: number;
}

/** A production run with optional product name and inventory lots. */
export interface ProductionRunDetail {
  run: ProductionRun;
  /** Name of the linked product, or null when product row not found. */
  productName: string | null;
  /** Inventory lots linked to this production run. */
  lots: InventoryLot[];
  /**
   * Unit cost (cost / quantity), or null when either value is absent or
   * quantity is zero (divide-by-zero guard).
   */
  unitCost: number | null;
}

/** Full detail payload for the vendor detail page. */
export interface VendorDetail {
  vendor: Vendor;
  runs: ProductionRunDetail[];
}

// =============================================================================
// Helpers
// =============================================================================

/** Safe unit cost calculation — returns null on missing/zero quantity. */
function calcUnitCost(
  cost: number | null,
  quantity: number | null,
): number | null {
  if (cost == null || quantity == null || quantity === 0) return null;
  return cost / quantity;
}

// =============================================================================
// loadVendors — vendor list
// =============================================================================

/**
 * Load every vendor for an org with production-run counts.
 *
 * Fetches vendors and production_runs in parallel, then groups runs by
 * vendor_id in memory (avoids N+1 round-trips).
 */
export async function loadVendors(
  supabase: SupabaseClient,
  orgId: string,
): Promise<VendorListItem[]> {
  const [vendorsRes, runsRes] = await Promise.all([
    supabase
      .from("vendors")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: true }),
    supabase
      .from("production_runs")
      .select("id, vendor_id")
      .eq("organization_id", orgId),
  ]);

  if (vendorsRes.error) {
    throw new Error(`[vendors] Supabase read failed: ${vendorsRes.error.message}`);
  }
  if (runsRes.error) {
    throw new Error(`[vendors] Supabase read failed: ${runsRes.error.message}`);
  }

  const vendors = (vendorsRes.data ?? []) as Vendor[];
  const runs = (runsRes.data ?? []) as Pick<ProductionRun, "id" | "vendor_id">[];

  // Count runs per vendor.
  const countByVendor = new Map<string, number>();
  for (const run of runs) {
    if (!run.vendor_id) continue;
    countByVendor.set(run.vendor_id, (countByVendor.get(run.vendor_id) ?? 0) + 1);
  }

  return vendors.map((vendor) => ({
    vendor,
    productionRunCount: countByVendor.get(vendor.id) ?? 0,
  }));
}

// =============================================================================
// loadVendor — single vendor detail
// =============================================================================

/**
 * Load a single vendor with its production runs (including product name and
 * linked inventory lots). Returns null when the vendor does not exist or is
 * not visible to the caller.
 */
export async function loadVendor(
  supabase: SupabaseClient,
  orgId: string,
  vendorId: string,
): Promise<VendorDetail | null> {
  const vendorRes = await supabase
    .from("vendors")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", vendorId)
    .maybeSingle<Vendor>();

  if (vendorRes.error) {
    throw new Error(`[vendors] Supabase read failed: ${vendorRes.error.message}`);
  }
  if (!vendorRes.data) {
    return null;
  }

  const vendor = vendorRes.data;

  // Fetch production runs for this vendor + all products + all inventory lots
  // in parallel, then join in memory.
  const [runsRes, productsRes, lotsRes] = await Promise.all([
    supabase
      .from("production_runs")
      .select("*")
      .eq("organization_id", orgId)
      .eq("vendor_id", vendorId)
      .order("production_date", { ascending: false }),
    supabase
      .from("products")
      .select("id, name")
      .eq("organization_id", orgId),
    supabase
      .from("inventory_lots")
      .select("*")
      .eq("organization_id", orgId),
  ]);

  if (runsRes.error) {
    throw new Error(`[vendors] Supabase read failed: ${runsRes.error.message}`);
  }
  if (productsRes.error) {
    throw new Error(`[vendors] Supabase read failed: ${productsRes.error.message}`);
  }
  if (lotsRes.error) {
    throw new Error(`[vendors] Supabase read failed: ${lotsRes.error.message}`);
  }

  const runs = (runsRes.data ?? []) as ProductionRun[];
  const products = (productsRes.data ?? []) as Pick<Product, "id" | "name">[];
  const lots = (lotsRes.data ?? []) as InventoryLot[];

  // Build lookup maps.
  const productNameById = new Map<string, string | null>();
  for (const p of products) {
    productNameById.set(p.id, p.name ?? null);
  }

  const lotsByRunId = new Map<string, InventoryLot[]>();
  for (const lot of lots) {
    if (!lot.production_run_id) continue;
    const bucket = lotsByRunId.get(lot.production_run_id);
    if (bucket) bucket.push(lot);
    else lotsByRunId.set(lot.production_run_id, [lot]);
  }

  const enrichedRuns: ProductionRunDetail[] = runs.map((run) => ({
    run,
    productName: run.product_id ? (productNameById.get(run.product_id) ?? null) : null,
    lots: lotsByRunId.get(run.id) ?? [],
    unitCost: calcUnitCost(run.cost, run.quantity),
  }));

  return { vendor, runs: enrichedRuns };
}
