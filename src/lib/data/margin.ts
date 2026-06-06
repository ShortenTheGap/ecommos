/**
 * Margin module data loader — the read model behind Module 3.
 *
 * `loadMargin(supabase, orgId)` fetches org-scoped orders, order_lines, and
 * campaigns, delegates ALL math to the pure margin engine, and returns a
 * fully-typed `MarginData` ready for the page component.
 *
 * Payload is serialize-safe (plain objects/numbers) so orders + linesByOrderId
 * can be passed to the client-side ScenarioPlanner without additional transforms.
 *
 * Money convention: decimal currency units (USD), matching the engines.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  marginByChannel,
  marginByCampaign,
  type ChannelMarginRow,
  type CampaignMarginRow,
} from "@/lib/domain/margin";
import type { Order, OrderLine, Campaign } from "@/lib/types";

// =============================================================================
// Exported types
// =============================================================================

export interface ChannelMarginRowWithAov extends ChannelMarginRow {
  /** Average order value for this channel. 0 when no orders. */
  aov: number;
  /** Contribution margin as a fraction of revenue (0–1). 0 when revenue 0. */
  cmPct: number;
}

export interface MarginData {
  // ── Headline totals ──────────────────────────────────────────────────────
  /** Sum of revenue across all orders. */
  totalRevenue: number;
  /** Sum of contribution margin across all orders (no ad spend deducted). */
  totalContributionMargin: number;
  /**
   * Blended CM % as a fraction (0–1). Null when totalRevenue is 0
   * (divide-by-zero guard) so the UI can render an em-dash.
   */
  blendedCmPct: number | null;

  // ── Channel breakdown ────────────────────────────────────────────────────
  byChannel: ChannelMarginRowWithAov[];

  // ── Campaign profitability ───────────────────────────────────────────────
  byCampaign: CampaignMarginRow[];

  // ── Raw data for the client-side ScenarioPlanner ─────────────────────────
  /** All org orders (plain rows — serialize-safe). */
  orders: Order[];
  /** order.id → OrderLine[] map (plain rows — serialize-safe). */
  linesByOrderId: Record<string, OrderLine[]>;
}

// =============================================================================
// Main loader
// =============================================================================

/**
 * Load and assemble all margin data for an organization.
 *
 * @param supabase Any Supabase client. Pass the cookie-aware server client for
 *                 RLS-respecting reads, or a service client for admin/verify use.
 * @param orgId    The active organization id.
 */
export async function loadMargin(
  supabase: SupabaseClient,
  orgId: string,
): Promise<MarginData> {
  // Fetch orders, order_lines, and campaigns in parallel.
  const [ordersRes, campaignsRes] = await Promise.all([
    supabase
      .from("orders")
      .select("*")
      .eq("organization_id", orgId)
      .order("ordered_at", { ascending: true }),
    supabase
      .from("campaigns")
      .select("*")
      .eq("organization_id", orgId)
      .order("start_date", { ascending: true }),
  ]);

  if (ordersRes.error) {
    throw new Error(`[margin] Supabase read failed (orders): ${ordersRes.error.message}`);
  }
  if (campaignsRes.error) {
    throw new Error(`[margin] Supabase read failed (campaigns): ${campaignsRes.error.message}`);
  }

  const orders = (ordersRes.data ?? []) as Order[];
  const campaigns = (campaignsRes.data ?? []) as Campaign[];

  // Fetch order_lines only for the orders we have.
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
        `[margin] Supabase read failed (order_lines): ${linesRes.error.message}`,
      );
    }
    orderLines = (linesRes.data ?? []) as OrderLine[];
  }

  // Build linesByOrderId index.
  const linesByOrderId: Record<string, OrderLine[]> = {};
  for (const line of orderLines) {
    if (!line.order_id) continue;
    (linesByOrderId[line.order_id] ??= []).push(line);
  }

  // ── Delegate all math to the pure engine ────────────────────────────────
  const rawByChannel = marginByChannel(orders, linesByOrderId);
  const byCampaign = marginByCampaign(orders, linesByOrderId, campaigns);

  // Enrich channel rows with AOV and CM%.
  const byChannel: ChannelMarginRowWithAov[] = rawByChannel.map((row) => ({
    ...row,
    aov: row.orders > 0 ? row.revenue / row.orders : 0,
    cmPct: row.revenue > 0 ? row.contributionMargin / row.revenue : 0,
  }));

  // ── Headline totals ──────────────────────────────────────────────────────
  const totalRevenue = byChannel.reduce((s, r) => s + r.revenue, 0);
  const totalContributionMargin = byChannel.reduce(
    (s, r) => s + r.contributionMargin,
    0,
  );
  const blendedCmPct =
    totalRevenue > 0 ? totalContributionMargin / totalRevenue : null;

  return {
    totalRevenue,
    totalContributionMargin,
    blendedCmPct,
    byChannel,
    byCampaign,
    orders,
    linesByOrderId,
  };
}
