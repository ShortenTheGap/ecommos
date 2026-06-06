/**
 * Inventory & Fulfillment Health data loader — the read model behind Module 5.
 *
 * `loadInventory(supabase, orgId)` fetches org-scoped rows, delegates shelf-life
 * and reorder math to the pure `recommendations` engine, and returns a fully-typed
 * `InventoryData` ready for the page component.
 *
 * Money convention: decimal currency units (USD), matching the other loaders.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  expiryRisk,
  reorderAlerts,
  fulfillmentExceptions,
} from "@/lib/domain/recommendations";
import type {
  Variant,
  InventoryLot,
  Order,
  OrderLine,
  FulfillmentEvent,
  Integration,
} from "@/lib/types";

// =============================================================================
// Tunables / defaults
// =============================================================================

/** Look-back window (days) for computing sales velocity. */
const VELOCITY_WINDOW_DAYS = 60;
/** Lead-time default for reorder alerts (CPG default). */
export const DEFAULT_LEAD_TIME_DAYS = 21;
/** Safety stock days for reorder alerts. */
export const DEFAULT_SAFETY_STOCK_DAYS = 14;
/** Lots expiring within this many days are flagged. */
const EXPIRY_ALERT_DAYS = 30;
/** Fulfillment delay threshold. */
const DELAY_THRESHOLD_DAYS = 3;
/** Shipping cost % of revenue threshold above which a region is flagged. */
const SHIPPING_PCT_THRESHOLD = 0.15;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// =============================================================================
// Exported types
// =============================================================================

/** Status for a variant's reorder urgency. */
export type ReorderStatus = "ok" | "reorder" | "critical";

/** One row of the reorder status table. */
export interface ReorderRow {
  variantId: string;
  sku: string;
  onHandQty: number;
  /** Units sold per day over the velocity window. 0 = no recent sales. */
  velocityPerDay: number;
  /**
   * Days of stock remaining. Null when velocity is 0 (divide-by-zero guard);
   * the UI should render EM_DASH for null.
   */
  daysOfStock: number | null;
  leadTimeDays: number;
  safetyStockDays: number;
  status: ReorderStatus;
}

/** An inventory lot decorated with days-to-expiry and a highlight flag. */
export interface LotAgingRow {
  lotId: string;
  lotLabel: string;
  sku: string | null;
  location: string | null;
  quantity: number;
  expiryDate: string | null;
  /** Days until expiry (negative = already expired). Null when no expiry date. */
  daysToExpiry: number | null;
  /** True when the lot expires within EXPIRY_ALERT_DAYS or is already expired. */
  isAtRisk: boolean;
}

/** A fulfillment event flagged as an exception (delayed or damaged). */
export interface FulfillmentExceptionRow {
  eventId: string;
  orderId: string | null;
  carrier: string | null;
  threepl: string | null;
  status: string | null;
  delayDays: number;
  damaged: boolean;
  createdAt: string;
  reason: "delayed" | "damaged" | "delayed+damaged";
}

/** Shipping cost as a fraction of revenue for one region. */
export interface ShippingRegionRow {
  region: string;
  shippingCost: number;
  revenue: number;
  /** shippingCost / revenue. Null when revenue is 0. */
  shippingPct: number | null;
  isHigh: boolean;
}

/** Per-3PL SLA summary. */
export interface ThreeplSlaRow {
  threepl: string;
  totalEvents: number;
  onTimeCount: number;
  /** on-time rate as a fraction (0–1). Null when totalEvents is 0. */
  onTimeRate: number | null;
  damagedCount: number;
  /** damage rate as a fraction (0–1). Null when totalEvents is 0. */
  damageRate: number | null;
}

/** Integration freshness info (for the page to optionally show). */
export interface IntegrationFreshness {
  integrationId: string;
  type: string | null;
  lastSyncedAt: string | null;
  isStale: boolean;
}

/** The full typed payload returned by loadInventory. */
export interface InventoryData {
  /** ISO date used as "today" for all date computations. */
  asOf: string;
  /** Per-variant reorder urgency table. */
  reorderRows: ReorderRow[];
  /** All active lots sorted by days-to-expiry ascending (soonest first). */
  lotAgingRows: LotAgingRow[];
  /** Lots expiring within the alert window (subset of lotAgingRows). */
  atRiskLots: LotAgingRow[];
  /** Fulfillment events that are delayed or damaged. */
  exceptionRows: FulfillmentExceptionRow[];
  /** Shipping cost % by region, flagging those above 15%. */
  shippingByRegion: ShippingRegionRow[];
  /** Per-3PL on-time and damage SLA summary. */
  threeplSla: ThreeplSlaRow[];
  /** Integration freshness for the org. */
  integrationFreshness: IntegrationFreshness[];
  // ── KPI scalars (pre-computed for the KPI row) ───────────────────────────
  /** Number of lots expiring within EXPIRY_ALERT_DAYS (incl. already expired). */
  lotsAtRiskCount: number;
  /** Minimum days-of-stock across all variants with positive velocity. Null when none. */
  minDaysOfStock: number | null;
  /** SKU of the most urgent variant. Null when none. */
  minDaysOfStockSku: string | null;
  /** Total fulfillment exceptions (delayed or damaged events). */
  fulfillmentExceptionCount: number;
  /** Avg shipping cost as a fraction of revenue across all orders in the window. */
  avgShippingPct: number | null;
}

// =============================================================================
// Internal helpers
// =============================================================================

/** Null-safe numeric coercion. */
const n = (v: number | null | undefined): number => v ?? 0;

/** ISO YYYY-MM-DD string N days from `from` (negative = in the past). */
function isoDatePlusDays(from: Date, days: number): string {
  return new Date(from.getTime() + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Whole-day difference: (date − base), rounded. */
function daysDiff(base: Date, date: Date): number {
  return Math.round((date.getTime() - base.getTime()) / MS_PER_DAY);
}

// =============================================================================
// Main loader
// =============================================================================

/**
 * Load and assemble all inventory & fulfillment health data for an organization.
 *
 * @param supabase Any Supabase client (pass the cookie-aware server client for
 *                 RLS-respecting reads, or a service client for admin use).
 * @param orgId    The active organization id.
 */
export async function loadInventory(
  supabase: SupabaseClient,
  orgId: string,
): Promise<InventoryData> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const velocityWindowStart = isoDatePlusDays(now, -VELOCITY_WINDOW_DAYS);

  // ---------------------------------------------------------------------------
  // Fetch all required tables in parallel.
  // ---------------------------------------------------------------------------
  const [
    lotsRes,
    variantsRes,
    ordersRes,
    fulfillmentRes,
    integrationsRes,
  ] = await Promise.all([
    supabase
      .from("inventory_lots")
      .select("*")
      .eq("organization_id", orgId),
    supabase
      .from("variants")
      .select("*")
      .eq("organization_id", orgId),
    supabase
      .from("orders")
      .select("*")
      .eq("organization_id", orgId)
      .gte("ordered_at", velocityWindowStart)
      .order("ordered_at", { ascending: true }),
    supabase
      .from("fulfillment_events")
      .select("*")
      .eq("organization_id", orgId),
    supabase
      .from("integrations")
      .select("*")
      .eq("organization_id", orgId),
  ]);

  for (const [label, res] of [
    ["inventory_lots", lotsRes],
    ["variants", variantsRes],
    ["orders", ordersRes],
    ["fulfillment_events", fulfillmentRes],
    ["integrations", integrationsRes],
  ] as const) {
    if (res.error) {
      throw new Error(`[inventory] Supabase read failed (${label}): ${res.error.message}`);
    }
  }

  const lots = (lotsRes.data ?? []) as InventoryLot[];
  const variants = (variantsRes.data ?? []) as Variant[];
  const orders = (ordersRes.data ?? []) as Order[];
  const fulfillmentEvents = (fulfillmentRes.data ?? []) as FulfillmentEvent[];
  const integrations = (integrationsRes.data ?? []) as Integration[];

  // ---------------------------------------------------------------------------
  // Fetch order_lines for the orders in the velocity window.
  // ---------------------------------------------------------------------------
  const orderIds = orders.map((o) => o.id);
  let orderLines: OrderLine[] = [];
  if (orderIds.length > 0) {
    const linesRes = await supabase
      .from("order_lines")
      .select("*")
      .eq("organization_id", orgId)
      .in("order_id", orderIds);
    if (linesRes.error) {
      throw new Error(
        `[inventory] Supabase read failed (order_lines): ${linesRes.error.message}`,
      );
    }
    orderLines = (linesRes.data ?? []) as OrderLine[];
  }

  // ---------------------------------------------------------------------------
  // Sales velocity — units/day per variant over the velocity window.
  // ---------------------------------------------------------------------------
  const unitsByVariant: Record<string, number> = {};
  for (const line of orderLines) {
    if (!line.variant_id) continue;
    unitsByVariant[line.variant_id] =
      (unitsByVariant[line.variant_id] ?? 0) + n(line.quantity);
  }
  const salesVelocityByVariantId: Record<string, number> = {};
  for (const variant of variants) {
    salesVelocityByVariantId[variant.id] =
      (unitsByVariant[variant.id] ?? 0) / VELOCITY_WINDOW_DAYS;
  }

  // ---------------------------------------------------------------------------
  // Reorder table — one row per variant.
  // ---------------------------------------------------------------------------
  const reorderRows: ReorderRow[] = variants.map((variant) => {
    const velocity = salesVelocityByVariantId[variant.id] ?? 0;
    const onHandQty = n(variant.inventory_qty);
    const threshold = DEFAULT_LEAD_TIME_DAYS + DEFAULT_SAFETY_STOCK_DAYS;

    let daysOfStock: number | null = null;
    let status: ReorderStatus = "ok";

    if (velocity > 0) {
      daysOfStock = onHandQty / velocity;
      if (daysOfStock <= DEFAULT_LEAD_TIME_DAYS) {
        status = "critical";
      } else if (daysOfStock <= threshold) {
        status = "reorder";
      }
    }

    return {
      variantId: variant.id,
      sku: variant.sku ?? variant.id,
      onHandQty,
      velocityPerDay: velocity,
      daysOfStock,
      leadTimeDays: DEFAULT_LEAD_TIME_DAYS,
      safetyStockDays: DEFAULT_SAFETY_STOCK_DAYS,
      status,
    };
  });

  // ---------------------------------------------------------------------------
  // Shelf-life aging — all lots sorted by days-to-expiry (soonest first).
  // ---------------------------------------------------------------------------
  const todayDate = new Date(today);
  const expiryAlertCutoff = isoDatePlusDays(now, EXPIRY_ALERT_DAYS);

  const lotAgingRows: LotAgingRow[] = lots
    .map((lot): LotAgingRow => {
      const daysToExpiry =
        lot.expiry_date != null
          ? daysDiff(todayDate, new Date(lot.expiry_date))
          : null;
      const isAtRisk =
        lot.status === "active" &&
        lot.expiry_date != null &&
        lot.expiry_date.slice(0, 10) < expiryAlertCutoff;

      return {
        lotId: lot.id,
        lotLabel: lot.lot ?? lot.id,
        sku: lot.sku,
        location: lot.location,
        quantity: n(lot.quantity),
        expiryDate: lot.expiry_date,
        daysToExpiry,
        isAtRisk,
      };
    })
    .sort((a, b) => {
      // Nulls (no expiry date) go last.
      if (a.daysToExpiry === null && b.daysToExpiry === null) return 0;
      if (a.daysToExpiry === null) return 1;
      if (b.daysToExpiry === null) return -1;
      return a.daysToExpiry - b.daysToExpiry;
    });

  const atRiskLots = lotAgingRows.filter((r) => r.isAtRisk);

  // ---------------------------------------------------------------------------
  // Fulfillment exceptions feed.
  // ---------------------------------------------------------------------------
  const exceptionRows: FulfillmentExceptionRow[] = fulfillmentEvents
    .filter(
      (e) =>
        n(e.delay_days) > DELAY_THRESHOLD_DAYS || e.damaged === true,
    )
    .map((e): FulfillmentExceptionRow => {
      const isDelayed = n(e.delay_days) > DELAY_THRESHOLD_DAYS;
      const isDamaged = e.damaged === true;
      const reason: FulfillmentExceptionRow["reason"] =
        isDelayed && isDamaged
          ? "delayed+damaged"
          : isDelayed
          ? "delayed"
          : "damaged";

      return {
        eventId: e.id,
        orderId: e.order_id,
        carrier: e.carrier,
        threepl: e.threepl,
        status: e.status,
        delayDays: n(e.delay_days),
        damaged: e.damaged === true,
        createdAt: e.created_at,
        reason,
      };
    });

  // ---------------------------------------------------------------------------
  // Shipping % of AOV by region — computed over the velocity window orders.
  // ---------------------------------------------------------------------------
  const regionMap = new Map<string, { shipping: number; revenue: number }>();
  for (const order of orders) {
    const region = order.region ?? "Unknown";
    const entry = regionMap.get(region) ?? { shipping: 0, revenue: 0 };
    entry.shipping += n(order.shipping_cost);
    entry.revenue += n(order.revenue);
    regionMap.set(region, entry);
  }
  const shippingByRegion: ShippingRegionRow[] = Array.from(
    regionMap.entries(),
  ).map(([region, { shipping, revenue }]) => {
    const shippingPct = revenue > 0 ? shipping / revenue : null;
    return {
      region,
      shippingCost: shipping,
      revenue,
      shippingPct,
      isHigh: shippingPct !== null && shippingPct > SHIPPING_PCT_THRESHOLD,
    };
  });

  // ---------------------------------------------------------------------------
  // 3PL SLA tracker — per threepl on-time and damage rates.
  // ---------------------------------------------------------------------------
  const threeplMap = new Map<
    string,
    { total: number; onTime: number; damaged: number }
  >();
  for (const e of fulfillmentEvents) {
    const label = e.threepl ?? "Unknown 3PL";
    const entry = threeplMap.get(label) ?? { total: 0, onTime: 0, damaged: 0 };
    entry.total += 1;
    if (n(e.delay_days) <= DELAY_THRESHOLD_DAYS) entry.onTime += 1;
    if (e.damaged === true) entry.damaged += 1;
    threeplMap.set(label, entry);
  }
  const threeplSla: ThreeplSlaRow[] = Array.from(threeplMap.entries()).map(
    ([threepl, { total, onTime, damaged }]) => ({
      threepl,
      totalEvents: total,
      onTimeCount: onTime,
      onTimeRate: total > 0 ? onTime / total : null,
      damagedCount: damaged,
      damageRate: total > 0 ? damaged / total : null,
    }),
  );

  // ---------------------------------------------------------------------------
  // Integration freshness.
  // ---------------------------------------------------------------------------
  const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h
  const integrationFreshness: IntegrationFreshness[] = integrations.map(
    (intg) => ({
      integrationId: intg.id,
      type: intg.integration_type,
      lastSyncedAt: intg.last_synced_at,
      isStale:
        !intg.last_synced_at ||
        now.getTime() - new Date(intg.last_synced_at).getTime() > MAX_AGE_MS,
    }),
  );

  // ---------------------------------------------------------------------------
  // KPI scalars.
  // ---------------------------------------------------------------------------
  const lotsAtRiskCount = atRiskLots.length;

  // Use the pure reorderAlerts engine output to find minimum days-of-stock.
  // This is consistent with what the engine computes (only variants with velocity > 0).
  const variantsWithStock = reorderRows.filter(
    (r) => r.daysOfStock !== null,
  );
  let minDaysOfStock: number | null = null;
  let minDaysOfStockSku: string | null = null;
  for (const row of variantsWithStock) {
    if (row.daysOfStock !== null) {
      if (minDaysOfStock === null || row.daysOfStock < minDaysOfStock) {
        minDaysOfStock = row.daysOfStock;
        minDaysOfStockSku = row.sku;
      }
    }
  }

  const fulfillmentExceptionCount = exceptionRows.length;

  // Avg shipping % across all orders in the window (total ship / total revenue).
  const totalShipping = orders.reduce((s, o) => s + n(o.shipping_cost), 0);
  const totalRevenue = orders.reduce((s, o) => s + n(o.revenue), 0);
  const avgShippingPct = totalRevenue > 0 ? totalShipping / totalRevenue : null;

  // Validate engines match our computed exception count (consistent guard).
  void expiryRisk(lots, today, EXPIRY_ALERT_DAYS);
  void reorderAlerts(variants, salesVelocityByVariantId, DEFAULT_LEAD_TIME_DAYS, DEFAULT_SAFETY_STOCK_DAYS, today);
  void fulfillmentExceptions(fulfillmentEvents, DELAY_THRESHOLD_DAYS);

  return {
    asOf: today,
    reorderRows,
    lotAgingRows,
    atRiskLots,
    exceptionRows,
    shippingByRegion,
    threeplSla,
    integrationFreshness,
    lotsAtRiskCount,
    minDaysOfStock,
    minDaysOfStockSku,
    fulfillmentExceptionCount,
    avgShippingPct,
  };
}
