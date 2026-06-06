/**
 * Cockpit data loader — the read model behind the Daily Operating Cockpit.
 *
 * `loadCockpit(supabase, orgId)` fetches every org-scoped row the cockpit needs,
 * derives KPIs (trailing 30 days vs the prior 30 days), computes the inputs for
 * the PURE recommendations engine, and returns a fully-typed `CockpitData`.
 *
 * All domain math is delegated to the already-tested pure engines:
 *   - `@/lib/domain/margin`          (contribution margin)
 *   - `@/lib/domain/recommendations` (next-best-action feed)
 *
 * This module is the ONLY place that knows how to map DB rows into engine inputs;
 * the page component stays a thin renderer.
 *
 * Money convention: decimal currency units (USD), matching the engines.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { contributionMargin } from "@/lib/domain/margin";
import {
  buildRecommendations,
  type Recommendation,
} from "@/lib/domain/recommendations";
import type {
  Order,
  OrderLine,
  Variant,
  InventoryLot,
  FulfillmentEvent,
  Subscription,
  Integration,
  Claim,
} from "@/lib/types";

// =============================================================================
// Tunables / defaults
// =============================================================================

/** Trailing window length, in days, for the "current" KPI period. */
const WINDOW_DAYS = 30;
/** How far back we pull raw rows (covers current + prior window). */
const LOOKBACK_DAYS = 60;
/** Days an at-risk lot must expire within to count toward "inventory at risk". */
const EXPIRY_WINDOW_DAYS = 30;
/** Fulfillment delay threshold (days) that counts as an exception. */
const DELAY_THRESHOLD_DAYS = 3;
/**
 * Reorder lead time + safety stock used by the recommendations engine. The org
 * settings JSON does not (yet) carry these, so we fall back to sensible CPG
 * defaults. Surfacing them here keeps the magic numbers in one place.
 */
const DEFAULT_LEAD_TIME_DAYS = 21;
const DEFAULT_SAFETY_STOCK_DAYS = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// =============================================================================
// Exported types
// =============================================================================

/** A single KPI with current value plus delta vs the prior period. */
export interface KpiMetric {
  /** Current-period value (30d). */
  value: number;
  /** Prior-period value (the 30d before that). Null when not applicable. */
  priorValue: number | null;
  /**
   * Relative change as a fraction (0.12 = +12%). Null when the prior value is
   * zero/absent (divide-by-zero) so the UI can render an em-dash instead.
   */
  deltaPct: number | null;
}

/** Headline KPIs for the cockpit (all trailing 30 days vs prior 30 days). */
export interface CockpitKpis {
  revenue: KpiMetric;
  contributionMargin: KpiMetric;
  orders: KpiMetric;
  aov: KpiMetric;
}

/** At-a-glance operational counts that drive the urgent KPI cards. */
export interface CockpitSummary {
  /** Active lots expiring within EXPIRY_WINDOW_DAYS. */
  inventoryAtRisk: number;
  /** Fulfillment events that are delayed (>3d) or damaged. */
  fulfillmentExceptions: number;
  /** churned / total subscriptions, as a fraction (0–1). 0 when no subs. */
  churnRate: number;
  /** Total subscriptions (denominator for churnRate). */
  totalSubscriptions: number;
}

/** Everything the cockpit page needs to render. */
export interface CockpitData {
  kpis: CockpitKpis;
  recommendations: Recommendation[];
  summary: CockpitSummary;
  /** ISO date (YYYY-MM-DD) used as "today" for all date-relative computations. */
  asOf: string;
}

// =============================================================================
// Internal helpers
// =============================================================================

/** Null-safe numeric coercion (mirrors the engines). */
const n = (v: number | null | undefined): number => v ?? 0;

/** ISO date string (YYYY-MM-DD) for a Date offset by `days` from `from`. */
function isoDateMinusDays(from: Date, days: number): string {
  return new Date(from.getTime() - days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** True when an order's date (date-portion) falls in [startInclusive, endExclusive). */
function isInWindow(
  orderedAt: string | null,
  startInclusive: string,
  endExclusive: string,
): boolean {
  if (!orderedAt) return false;
  const day = orderedAt.slice(0, 10);
  return day >= startInclusive && day < endExclusive;
}

/**
 * Relative delta as a fraction. Returns null on divide-by-zero / absent prior so
 * the UI shows an em-dash rather than Infinity.
 */
function relativeDelta(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return (current - prior) / prior;
}

/** Aggregate revenue, contribution margin and order count over a set of orders. */
function aggregate(
  orders: Order[],
  linesByOrderId: Record<string, OrderLine[]>,
): { revenue: number; cm: number; count: number } {
  let revenue = 0;
  let cm = 0;
  for (const order of orders) {
    revenue += n(order.revenue);
    cm += contributionMargin(order, linesByOrderId[order.id] ?? []);
  }
  return { revenue, cm, count: orders.length };
}

/** Build a KpiMetric from current/prior raw values. */
function makeMetric(current: number, prior: number | null): KpiMetric {
  return {
    value: current,
    priorValue: prior,
    deltaPct: prior === null ? null : relativeDelta(current, prior),
  };
}

// =============================================================================
// Main loader
// =============================================================================

/**
 * Load and assemble all cockpit data for an organization.
 *
 * @param supabase Any Supabase client. Pass the cookie-aware server client for
 *                 RLS-respecting reads, or a service client for admin/verify use.
 * @param orgId    The active organization id.
 */
export async function loadCockpit(
  supabase: SupabaseClient,
  orgId: string,
): Promise<CockpitData> {
  // Single "today" derived from app runtime (allowed here — not a pure engine).
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const lookbackStart = isoDateMinusDays(now, LOOKBACK_DAYS);

  // Window boundaries (date-only, half-open intervals).
  // currentEnd is exclusive at "tomorrow" so today's orders are included.
  const currentEnd = isoDateMinusDays(now, -1); // today + 1
  const currentStart = isoDateMinusDays(now, WINDOW_DAYS - 1); // last 30 days incl. today
  const priorEnd = currentStart;
  const priorStart = isoDateMinusDays(now, WINDOW_DAYS * 2 - 1);

  // ---------------------------------------------------------------------------
  // Fetch org-scoped rows in parallel.
  // ---------------------------------------------------------------------------
  const [
    ordersRes,
    variantsRes,
    lotsRes,
    fulfillmentRes,
    subscriptionsRes,
    integrationsRes,
    claimsRes,
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("*")
      .eq("organization_id", orgId)
      .gte("ordered_at", lookbackStart)
      .order("ordered_at", { ascending: true }),
    supabase.from("variants").select("*").eq("organization_id", orgId),
    supabase
      .from("inventory_lots")
      .select("*")
      .eq("organization_id", orgId)
      .eq("status", "active"),
    supabase.from("fulfillment_events").select("*").eq("organization_id", orgId),
    supabase.from("subscriptions").select("*").eq("organization_id", orgId),
    supabase.from("integrations").select("*").eq("organization_id", orgId),
    supabase.from("claims").select("*").eq("organization_id", orgId),
  ]);

  // Fail loudly: a partial cockpit would silently mislead the operator.
  for (const res of [
    ordersRes,
    variantsRes,
    lotsRes,
    fulfillmentRes,
    subscriptionsRes,
    integrationsRes,
    claimsRes,
  ]) {
    if (res.error) {
      throw new Error(`[cockpit] Supabase read failed: ${res.error.message}`);
    }
  }

  const orders = (ordersRes.data ?? []) as Order[];
  const variants = (variantsRes.data ?? []) as Variant[];
  const lots = (lotsRes.data ?? []) as InventoryLot[];
  const fulfillmentEvents = (fulfillmentRes.data ?? []) as FulfillmentEvent[];
  const subscriptions = (subscriptionsRes.data ?? []) as Subscription[];
  const integrations = (integrationsRes.data ?? []) as Integration[];
  const claims = (claimsRes.data ?? []) as Claim[];

  // ---------------------------------------------------------------------------
  // Order lines for the fetched orders → linesByOrderId.
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
        `[cockpit] Supabase read failed (order_lines): ${linesRes.error.message}`,
      );
    }
    orderLines = (linesRes.data ?? []) as OrderLine[];
  }

  const linesByOrderId: Record<string, OrderLine[]> = {};
  for (const line of orderLines) {
    if (!line.order_id) continue;
    (linesByOrderId[line.order_id] ??= []).push(line);
  }

  // ---------------------------------------------------------------------------
  // KPIs — current 30d vs prior 30d.
  // ---------------------------------------------------------------------------
  const currentOrders = orders.filter((o) =>
    isInWindow(o.ordered_at, currentStart, currentEnd),
  );
  const priorOrders = orders.filter((o) =>
    isInWindow(o.ordered_at, priorStart, priorEnd),
  );

  const cur = aggregate(currentOrders, linesByOrderId);
  const prv = aggregate(priorOrders, linesByOrderId);

  const curAov = cur.count > 0 ? cur.revenue / cur.count : 0;
  const prvAov = prv.count > 0 ? prv.revenue / prv.count : null;

  const kpis: CockpitKpis = {
    revenue: makeMetric(cur.revenue, prv.revenue),
    contributionMargin: makeMetric(cur.cm, prv.cm),
    orders: makeMetric(cur.count, prv.count),
    aov: makeMetric(curAov, prvAov),
  };

  // ---------------------------------------------------------------------------
  // Sales velocity per variant — units/day over the current 30d window.
  // ---------------------------------------------------------------------------
  const currentOrderIds = new Set(currentOrders.map((o) => o.id));
  const unitsByVariant: Record<string, number> = {};
  for (const line of orderLines) {
    if (!line.variant_id || !line.order_id) continue;
    if (!currentOrderIds.has(line.order_id)) continue;
    unitsByVariant[line.variant_id] =
      (unitsByVariant[line.variant_id] ?? 0) + n(line.quantity);
  }
  const salesVelocityByVariantId: Record<string, number> = {};
  for (const variant of variants) {
    salesVelocityByVariantId[variant.id] =
      (unitsByVariant[variant.id] ?? 0) / WINDOW_DAYS;
  }

  // ---------------------------------------------------------------------------
  // Shipping metrics per channel — sum(shipping_cost) / sum(revenue).
  // Computed over the current 30d window for consistency with the KPIs.
  // ---------------------------------------------------------------------------
  const shippingByChannel = new Map<string, { ship: number; rev: number }>();
  for (const order of currentOrders) {
    const channel = order.channel ?? "unknown";
    const entry = shippingByChannel.get(channel) ?? { ship: 0, rev: 0 };
    entry.ship += n(order.shipping_cost);
    entry.rev += n(order.revenue);
    shippingByChannel.set(channel, entry);
  }
  const shippingMetrics = Array.from(shippingByChannel.entries()).map(
    ([channel, { ship, rev }]) => ({
      channel,
      shippingPctOfAov: rev > 0 ? ship / rev : 0,
    }),
  );

  // ---------------------------------------------------------------------------
  // Summary counts.
  // ---------------------------------------------------------------------------
  const expiryCutoff = isoDateMinusDays(now, -EXPIRY_WINDOW_DAYS); // today + 30
  const inventoryAtRisk = lots.filter(
    (lot) => lot.expiry_date != null && lot.expiry_date.slice(0, 10) < expiryCutoff,
  ).length;

  const fulfillmentExceptions = fulfillmentEvents.filter(
    (e) => n(e.delay_days) > DELAY_THRESHOLD_DAYS || e.damaged === true,
  ).length;

  const totalSubscriptions = subscriptions.length;
  const churnedCount = subscriptions.filter((s) => s.status === "churned").length;
  const churnRate =
    totalSubscriptions > 0 ? churnedCount / totalSubscriptions : 0;

  const summary: CockpitSummary = {
    inventoryAtRisk,
    fulfillmentExceptions,
    churnRate,
    totalSubscriptions,
  };

  // ---------------------------------------------------------------------------
  // Recommendations — delegate to the pure engine.
  // ---------------------------------------------------------------------------
  const recommendations = buildRecommendations(
    {
      lots,
      variants,
      salesVelocityByVariantId,
      leadTimeDays: DEFAULT_LEAD_TIME_DAYS,
      safetyStockDays: DEFAULT_SAFETY_STOCK_DAYS,
      shippingMetrics,
      fulfillmentEvents,
      subscriptions,
      integrations,
      claims,
    },
    today,
  );

  return { kpis, recommendations, summary, asOf: today };
}
