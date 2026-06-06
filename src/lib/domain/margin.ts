/**
 * Contribution-margin engine — PURE functions (no DB, no IO).
 *
 * Reused by:
 *  - Margin module UI (aggregation / channel / campaign views)
 *  - AI "margin analyst" agent (tool calls that need deterministic math)
 *
 * Money convention: all numbers are decimal currency units (e.g. USD).
 * Nullable DB fields are treated as 0 throughout (null == not recorded == no cost).
 *
 * Tax is NOT included in contribution-margin calculations — it is a pass-through
 * collected on behalf of a tax authority and does not reflect brand economics.
 *
 * Free-shipping assumption (scenarioMargin freeShipThreshold):
 *   "Free shipping" is a customer-facing pricing decision. The brand still pays
 *   the physical shipping cost, so shipping_cost is still subtracted from CM.
 *   Revenue is unchanged (the shipping fee the customer would have paid is simply
 *   not charged, but that was already modeled as 0 discount in the base order).
 *   In other words: the threshold flag has no effect on the CM formula — it is
 *   retained for future extensions (e.g. modeling absorbed vs passed-on shipping).
 */

import type { Order, OrderLine, Campaign } from '@/lib/types'

// ---------------------------------------------------------------------------
// Null-safe numeric coercion
// ---------------------------------------------------------------------------
const n = (v: number | null | undefined): number => v ?? 0

// ---------------------------------------------------------------------------
// 1. orderCogs
// ---------------------------------------------------------------------------

/**
 * Returns the cost of goods for an order: sum of (quantity × unit_cost) over
 * each order line. Empty lines or null fields produce 0.
 */
export function orderCogs(lines: OrderLine[]): number {
  return lines.reduce((sum, line) => sum + n(line.quantity) * n(line.unit_cost), 0)
}

// ---------------------------------------------------------------------------
// 2. contributionMargin
// ---------------------------------------------------------------------------

/**
 * Contribution margin for a single order:
 *   revenue − COGS − discount − shipping_cost − packaging_cost − pickpack_cost − allocatedAdSpend
 *
 * Tax is excluded (pass-through).
 * allocatedAdSpend defaults to 0 and is used when a caller has already prorated
 * campaign spend to the order level.
 */
export function contributionMargin(
  order: Order,
  lines: OrderLine[],
  allocatedAdSpend = 0,
): number {
  return (
    n(order.revenue) -
    orderCogs(lines) -
    n(order.discount) -
    n(order.shipping_cost) -
    n(order.packaging_cost) -
    n(order.pickpack_cost) -
    allocatedAdSpend
  )
}

// ---------------------------------------------------------------------------
// 3. contributionMarginPct
// ---------------------------------------------------------------------------

/**
 * Contribution margin as a fraction of revenue (e.g. 0.43 = 43 %).
 * Returns 0 when revenue is 0 or null to avoid divide-by-zero.
 */
export function contributionMarginPct(
  order: Order,
  lines: OrderLine[],
  allocatedAdSpend = 0,
): number {
  const rev = n(order.revenue)
  if (rev === 0) return 0
  return contributionMargin(order, lines, allocatedAdSpend) / rev
}

// ---------------------------------------------------------------------------
// 4. marginByChannel
// ---------------------------------------------------------------------------

export interface ChannelMarginRow {
  channel: string
  revenue: number
  cogs: number
  contributionMargin: number
  orders: number
}

/**
 * Aggregates orders by channel.
 *
 * linesByOrderId: a Record mapping order.id → OrderLine[]. Missing keys are
 * treated as an empty lines array (COGS = 0).
 *
 * Orders with a null channel are grouped under the literal string "unknown".
 */
export function marginByChannel(
  orders: Order[],
  linesByOrderId: Record<string, OrderLine[]>,
): ChannelMarginRow[] {
  const map = new Map<string, ChannelMarginRow>()

  for (const order of orders) {
    const channel = order.channel ?? 'unknown'
    const lines = linesByOrderId[order.id] ?? []
    const cogs = orderCogs(lines)
    const cm = contributionMargin(order, lines)

    const existing = map.get(channel)
    if (existing) {
      existing.revenue += n(order.revenue)
      existing.cogs += cogs
      existing.contributionMargin += cm
      existing.orders += 1
    } else {
      map.set(channel, {
        channel,
        revenue: n(order.revenue),
        cogs,
        contributionMargin: cm,
        orders: 1,
      })
    }
  }

  return Array.from(map.values())
}

// ---------------------------------------------------------------------------
// 5. marginByCampaign
// ---------------------------------------------------------------------------

export interface CampaignMarginRow {
  campaignId: string
  channel: string
  spend: number
  attributedRevenue: number
  contributionMargin: number
  /** attributedRevenue / spend; 0 when spend is 0 */
  roas: number
}

/**
 * Attributes orders to campaigns by matching:
 *   - order.channel === campaign.channel  (null channel never matches)
 *   - order.ordered_at falls within [campaign.start_date, campaign.end_date] (inclusive, date comparison)
 *
 * Campaign spend is subtracted once at the group level (not per-order).
 * roas = attributedRevenue / spend; returns 0 when spend is 0.
 */
export function marginByCampaign(
  orders: Order[],
  linesByOrderId: Record<string, OrderLine[]>,
  campaigns: Campaign[],
): CampaignMarginRow[] {
  return campaigns.map((campaign) => {
    const spend = n(campaign.spend)
    const campaignChannel = campaign.channel
    const startDate = campaign.start_date ? campaign.start_date.slice(0, 10) : null
    const endDate = campaign.end_date ? campaign.end_date.slice(0, 10) : null

    let attributedRevenue = 0
    let orderLevelCm = 0

    for (const order of orders) {
      // Channel must match (null channel on either side never matches)
      if (!order.channel || !campaignChannel || order.channel !== campaignChannel) continue

      // Date must be within campaign window
      if (order.ordered_at && startDate && endDate) {
        const orderDate = order.ordered_at.slice(0, 10)
        if (orderDate < startDate || orderDate > endDate) continue
      } else {
        // If campaign has no dates, skip date filtering; if order has no date, skip attribution
        if (!order.ordered_at) continue
      }

      const lines = linesByOrderId[order.id] ?? []
      attributedRevenue += n(order.revenue)
      orderLevelCm += contributionMargin(order, lines)
    }

    // Subtract campaign spend from the aggregated order-level CM
    const totalCm = orderLevelCm - spend

    return {
      campaignId: campaign.id,
      channel: campaignChannel ?? 'unknown',
      spend,
      attributedRevenue,
      contributionMargin: totalCm,
      roas: spend === 0 ? 0 : attributedRevenue / spend,
    }
  })
}

// ---------------------------------------------------------------------------
// 6. scenarioMargin
// ---------------------------------------------------------------------------

export interface ScenarioOpts {
  /**
   * Additional discount as a fraction of each order's revenue (0–1).
   * E.g. 0.20 = 20 % off. Applied per-order before summing.
   */
  discountPct?: number
  /**
   * Revenue threshold above which the brand offers free shipping to the customer.
   * The brand still pays the shipping_cost (it remains a cost subtracted from CM).
   * This flag is retained for future modelling but currently has no formula effect.
   * See module-level docstring for full assumption.
   */
  freeShipThreshold?: number
  /**
   * Additional ad spend subtracted from the total contribution margin once
   * at the aggregate level (not per-order).
   */
  addedAdSpend?: number
}

export interface ScenarioResult {
  totalContributionMargin: number
  totalRevenue: number
}

/**
 * Recomputes aggregate contribution margin under hypothetical scenario opts.
 * Deterministic and side-effect-free — safe to call repeatedly for what-if analysis.
 */
export function scenarioMargin(
  baseOrders: Order[],
  linesByOrderId: Record<string, OrderLine[]>,
  opts: ScenarioOpts,
): ScenarioResult {
  const { discountPct = 0, addedAdSpend = 0 } = opts

  let totalRevenue = 0
  let totalCm = 0

  for (const order of baseOrders) {
    const rev = n(order.revenue)
    const lines = linesByOrderId[order.id] ?? []
    const extraDiscount = rev * discountPct

    // Free-shipping threshold: brand absorbs shipping cost regardless.
    // The shipping_cost is still subtracted (brand pays it).
    // No formula change needed — see module-level assumption comment.

    totalRevenue += rev
    // Apply per-order extra discount by layering on top of contributionMargin
    totalCm += contributionMargin(order, lines) - extraDiscount
  }

  // Subtract aggregate added ad spend once
  totalCm -= addedAdSpend

  return { totalContributionMargin: totalCm, totalRevenue }
}
