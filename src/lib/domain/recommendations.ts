/**
 * Recommendations engine — PURE functions (no DB, no IO).
 *
 * Powers:
 *  - Cockpit "next-best-action" feed (Phase 3)
 *  - Inventory/fulfillment health module (Phase 4)
 *
 * All functions accept `today: string` (ISO date/datetime) as an explicit
 * parameter so tests remain deterministic. Parsing via `new Date(today)` is
 * allowed since it uses the caller-supplied value, not the system clock.
 *
 * Money / rate conventions: same decimal-currency units as margin.ts.
 */

import type { InventoryLot, Variant, FulfillmentEvent, Subscription, Integration, Claim } from '@/lib/types'

// =============================================================================
// Exported types
// =============================================================================

export type Severity = 'info' | 'warning' | 'critical'

export interface Recommendation {
  /** Stable key, e.g. `expiry:${lot.id}` */
  id: string
  severity: Severity
  module: 'inventory' | 'fulfillment' | 'margin' | 'retention' | 'compliance' | 'integrations'
  title: string
  /** What changed / why it matters */
  message: string
  /** What to do next */
  suggestedAction: string
}

// =============================================================================
// Helpers
// =============================================================================

/** Milliseconds in one day */
const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Difference in whole days: (date - base) truncated toward zero */
function daysDiff(base: Date, date: Date): number {
  return Math.round((date.getTime() - base.getTime()) / MS_PER_DAY)
}

// =============================================================================
// 1. expiryRisk
// =============================================================================

/**
 * For each active lot whose `expiry_date` is within `withinDays` of `today`
 * (or already expired), emit an inventory recommendation.
 *
 * - Already expired (daysUntilExpiry < 0): severity 'critical'
 * - Expiring within window (0 <= daysUntilExpiry < withinDays): severity 'warning'
 */
export function expiryRisk(
  lots: InventoryLot[],
  today: string,
  withinDays = 30,
): Recommendation[] {
  const todayDate = new Date(today)
  const recs: Recommendation[] = []

  for (const lot of lots) {
    if (lot.status !== 'active') continue
    if (!lot.expiry_date) continue

    const expiryDate = new Date(lot.expiry_date)
    const daysUntilExpiry = daysDiff(todayDate, expiryDate)

    if (daysUntilExpiry >= withinDays) continue

    const severity: Severity = daysUntilExpiry < 0 ? 'critical' : 'warning'
    const qty = lot.quantity ?? 0
    const lotLabel = lot.lot ?? lot.id

    const message =
      daysUntilExpiry < 0
        ? `Lot ${lotLabel} expired ${Math.abs(daysUntilExpiry)} day(s) ago. ${qty} units at risk.`
        : `Lot ${lotLabel} expires in ${daysUntilExpiry} day(s). ${qty} units remaining.`

    recs.push({
      id: `expiry:${lot.id}`,
      severity,
      module: 'inventory',
      title: `Lot ${lotLabel} nearing expiry`,
      message,
      suggestedAction: 'Promote, bundle, move to wholesale, or donate.',
    })
  }

  return recs
}

// =============================================================================
// 2. reorderAlerts
// =============================================================================

/**
 * For each variant whose current stock will run out before the reorder lead
 * time plus safety stock buffer, emit an inventory recommendation.
 *
 * daysOfStock = inventory_qty / velocity
 *
 * - daysOfStock <= leadTimeDays: severity 'critical' (already inside lead time)
 * - daysOfStock <= leadTimeDays + safetyStockDays: severity 'warning'
 *
 * Variants with velocity === 0 or not present in salesVelocityByVariantId are skipped.
 */
export function reorderAlerts(
  variants: Variant[],
  salesVelocityByVariantId: Record<string, number>,
  leadTimeDays: number,
  safetyStockDays = 14,
  today: string, // accepted for API symmetry / future use
): Recommendation[] {
  // Suppress unused-variable warning for `today` — kept for API consistency
  void today

  const recs: Recommendation[] = []
  const threshold = leadTimeDays + safetyStockDays

  for (const variant of variants) {
    const velocity = salesVelocityByVariantId[variant.id]
    if (!velocity || velocity <= 0) continue

    const qty = variant.inventory_qty ?? 0
    const daysOfStock = qty / velocity

    if (daysOfStock > threshold) continue

    const severity: Severity = daysOfStock <= leadTimeDays ? 'critical' : 'warning'
    const skuLabel = variant.sku ?? variant.id

    recs.push({
      id: `reorder:${variant.id}`,
      severity,
      module: 'inventory',
      title: `Reorder ${skuLabel}`,
      message:
        `Only ${Math.round(daysOfStock)} day(s) of stock remaining ` +
        `(lead time: ${leadTimeDays} day(s), safety buffer: ${safetyStockDays} day(s)).`,
      suggestedAction: 'Place production order now.',
    })
  }

  return recs
}

// =============================================================================
// 3. shippingCostAlerts
// =============================================================================

/**
 * For any channel whose shipping cost as a percentage of AOV exceeds the
 * threshold, emit a margin recommendation.
 */
export function shippingCostAlerts(
  metrics: { channel: string; shippingPctOfAov: number }[],
  threshold = 0.15,
): Recommendation[] {
  const recs: Recommendation[] = []

  for (const { channel, shippingPctOfAov } of metrics) {
    if (shippingPctOfAov <= threshold) continue

    recs.push({
      id: `shipping:${channel}`,
      severity: 'warning',
      module: 'margin',
      title: `High shipping cost on ${channel}`,
      message:
        `Shipping represents ${(shippingPctOfAov * 100).toFixed(1)}% of AOV on ${channel}, ` +
        `above the ${(threshold * 100).toFixed(0)}% threshold.`,
      suggestedAction:
        'Raise free-ship threshold or adjust carrier/bundle to reduce per-order shipping cost.',
    })
  }

  return recs
}

// =============================================================================
// 4. fulfillmentExceptions
// =============================================================================

/**
 * Scans fulfillment events for delays and damage.
 *
 * - Delay rec (module: 'fulfillment', severity: 'warning') when any events have delay_days > threshold.
 * - Damage rec (module: 'fulfillment') when any events have damaged === true:
 *     severity 'critical' if damage rate > 5%, otherwise 'warning'.
 */
export function fulfillmentExceptions(
  events: FulfillmentEvent[],
  delayThresholdDays = 3,
): Recommendation[] {
  if (events.length === 0) return []

  const recs: Recommendation[] = []

  const delayedCount = events.filter(e => (e.delay_days ?? 0) > delayThresholdDays).length
  const damagedCount = events.filter(e => e.damaged === true).length
  const total = events.length

  if (delayedCount > 0) {
    recs.push({
      id: 'fulfillment:delays',
      severity: 'warning',
      module: 'fulfillment',
      title: 'Fulfillment delays detected',
      message: `${delayedCount} shipment(s) delayed more than ${delayThresholdDays} day(s).`,
      suggestedAction: 'Open 3PL ticket to investigate root cause and improve carrier SLA.',
    })
  }

  if (damagedCount > 0) {
    const damageRate = damagedCount / total
    const severity: Severity = damageRate > 0.05 ? 'critical' : 'warning'

    recs.push({
      id: 'fulfillment:damage',
      severity,
      module: 'fulfillment',
      title: 'Damaged shipments detected',
      message:
        `${damagedCount} of ${total} shipment(s) arrived damaged ` +
        `(${(damageRate * 100).toFixed(1)}% damage rate).`,
      suggestedAction: 'Open 3PL ticket / review packaging SOP to reduce damage rate.',
    })
  }

  return recs
}

// =============================================================================
// 5. churnRisk
// =============================================================================

/**
 * If churned subscriptions / total > 0.10 (and total > 0), emit a retention
 * recommendation.
 */
export function churnRisk(subscriptions: Subscription[]): Recommendation[] {
  const total = subscriptions.length
  if (total === 0) return []

  const churned = subscriptions.filter(s => s.status === 'churned').length
  const churnRate = churned / total

  if (churnRate <= 0.1) return []

  return [
    {
      id: 'retention:churn',
      severity: 'warning',
      module: 'retention',
      title: 'Elevated subscription churn',
      message: `${(churnRate * 100).toFixed(0)}% of subscriptions have churned (${churned} of ${total}).`,
      suggestedAction:
        'Launch winback campaign and offer cadence adjustment or skip option to at-risk subscribers.',
    },
  ]
}

// =============================================================================
// 6. staleIntegrations
// =============================================================================

/**
 * For any integration whose `last_synced_at` is older than `maxAgeHours`
 * from `today` (or never synced), emit an integrations info recommendation.
 */
export function staleIntegrations(
  integrations: Integration[],
  today: string,
  maxAgeHours = 24,
): Recommendation[] {
  const todayDate = new Date(today)
  const recs: Recommendation[] = []

  for (const integration of integrations) {
    const isStale =
      !integration.last_synced_at ||
      (todayDate.getTime() - new Date(integration.last_synced_at).getTime()) >
        maxAgeHours * 60 * 60 * 1000

    if (!isStale) continue

    const typeLabel = integration.integration_type ?? integration.id

    recs.push({
      id: `integration:${integration.id}`,
      severity: 'info',
      module: 'integrations',
      title: `Stale integration: ${typeLabel}`,
      message: `Integration "${typeLabel}" data may be stale (last synced over ${maxAgeHours}h ago).`,
      suggestedAction:
        'Re-sync before trusting recommendations that depend on this integration.',
    })
  }

  return recs
}

// =============================================================================
// 7. complianceGaps
// =============================================================================

/**
 * For each claim with approval_status === 'pending', emit a compliance info
 * recommendation.
 */
export function complianceGaps(claims: Claim[]): Recommendation[] {
  return claims
    .filter(c => c.approval_status === 'pending')
    .map(claim => ({
      id: `compliance:${claim.id}`,
      severity: 'info' as Severity,
      module: 'compliance' as const,
      title: 'Approve claim',
      message: `Claim "${claim.claim_text}" is pending review.`,
      suggestedAction:
        'Add evidence and approve, or stop using this claim in marketing materials.',
    }))
}

// =============================================================================
// 8. buildRecommendations
// =============================================================================

/** Input shape for buildRecommendations — assembles all rule inputs in one object. */
export interface RecommendationsInput {
  lots: InventoryLot[]
  variants: Variant[]
  salesVelocityByVariantId: Record<string, number>
  leadTimeDays: number
  safetyStockDays: number
  shippingMetrics: { channel: string; shippingPctOfAov: number }[]
  fulfillmentEvents: FulfillmentEvent[]
  subscriptions: Subscription[]
  integrations: Integration[]
  claims: Claim[]
}

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2 }

/**
 * Aggregates all recommendation rules and returns a sorted list:
 * critical > warning > info (stable within each bucket).
 */
export function buildRecommendations(
  input: RecommendationsInput,
  today: string,
): Recommendation[] {
  const all: Recommendation[] = [
    ...expiryRisk(input.lots, today),
    ...reorderAlerts(
      input.variants,
      input.salesVelocityByVariantId,
      input.leadTimeDays,
      input.safetyStockDays,
      today,
    ),
    ...shippingCostAlerts(input.shippingMetrics),
    ...fulfillmentExceptions(input.fulfillmentEvents),
    ...churnRisk(input.subscriptions),
    ...staleIntegrations(input.integrations, today),
    ...complianceGaps(input.claims),
  ]

  // Stable sort by severity (critical first)
  return all.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}
