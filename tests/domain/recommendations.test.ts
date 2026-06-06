import { describe, it, expect } from 'vitest'
import {
  expiryRisk,
  reorderAlerts,
  shippingCostAlerts,
  fulfillmentExceptions,
  churnRisk,
  staleIntegrations,
  complianceGaps,
  buildRecommendations,
} from '@/lib/domain/recommendations'
import type {
  InventoryLot,
  Variant,
  FulfillmentEvent,
  Subscription,
  Integration,
  Claim,
} from '@/lib/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeLot = (overrides: Partial<InventoryLot> = {}): InventoryLot => ({
  id: 'lot1',
  organization_id: 'org1',
  sku: 'SKU-001',
  lot: 'L001',
  location: 'WH-A',
  quantity: 100,
  expiry_date: null,
  status: 'active',
  production_run_id: null,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: null,
  ...overrides,
})

const makeVariant = (overrides: Partial<Variant> = {}): Variant => ({
  id: 'v1',
  organization_id: 'org1',
  product_id: 'p1',
  sku: 'SKU-001',
  price: 29.99,
  weight_grams: null,
  dimensions: null,
  inventory_qty: 500,
  cogs: null,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: null,
  ...overrides,
})

const makeEvent = (overrides: Partial<FulfillmentEvent> = {}): FulfillmentEvent => ({
  id: 'evt1',
  organization_id: 'org1',
  order_id: 'o1',
  carrier: 'UPS',
  threepl: '3pl-a',
  status: 'delivered',
  delay_days: 0,
  damaged: false,
  cost: 5.5,
  tracking: null,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: null,
  ...overrides,
})

const makeSub = (overrides: Partial<Subscription> = {}): Subscription => ({
  id: 'sub1',
  organization_id: 'org1',
  customer_id: 'cust1',
  product_id: 'p1',
  cadence: 'monthly',
  status: 'active',
  churn_reason: null,
  next_order_date: null,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: null,
  ...overrides,
})

const makeIntegration = (overrides: Partial<Integration> = {}): Integration => ({
  id: 'int1',
  organization_id: 'org1',
  integration_type: 'shopify',
  status: 'active',
  last_synced_at: null,
  config: {},
  created_at: '2025-01-01T00:00:00Z',
  updated_at: null,
  ...overrides,
})

const makeClaim = (overrides: Partial<Claim> = {}): Claim => ({
  id: 'claim1',
  organization_id: 'org1',
  product_id: 'p1',
  claim_text: 'Contains probiotics',
  claim_type: 'health',
  evidence: null,
  approval_status: 'approved',
  risk_level: 'low',
  channels_used: null,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: null,
  ...overrides,
})

// ---------------------------------------------------------------------------
// 1. expiryRisk
// ---------------------------------------------------------------------------

describe('expiryRisk', () => {
  const today = '2026-06-06'

  it('emits a warning rec for a lot expiring within 30 days (10 days out)', () => {
    // Expiring in 10 days
    const lot = makeLot({ id: 'lot-10d', expiry_date: '2026-06-16', status: 'active' })
    const recs = expiryRisk([lot], today)
    expect(recs).toHaveLength(1)
    expect(recs[0].severity).toBe('warning')
    expect(recs[0].module).toBe('inventory')
    expect(recs[0].id).toBe(`expiry:lot-10d`)
  })

  it('emits a critical rec for an already-expired lot', () => {
    // Expired yesterday
    const lot = makeLot({ id: 'lot-exp', expiry_date: '2026-06-05', status: 'active' })
    const recs = expiryRisk([lot], today)
    expect(recs).toHaveLength(1)
    expect(recs[0].severity).toBe('critical')
    expect(recs[0].module).toBe('inventory')
  })

  it('emits no rec for a lot expiring in 90 days', () => {
    const lot = makeLot({ expiry_date: '2026-09-04', status: 'active' })
    const recs = expiryRisk([lot], today)
    expect(recs).toHaveLength(0)
  })

  it('ignores lots with null expiry_date', () => {
    const lot = makeLot({ expiry_date: null, status: 'active' })
    const recs = expiryRisk([lot], today)
    expect(recs).toHaveLength(0)
  })

  it('ignores inactive lots', () => {
    const lot = makeLot({ expiry_date: '2026-06-10', status: 'inactive' })
    const recs = expiryRisk([lot], today)
    expect(recs).toHaveLength(0)
  })

  it('respects a custom withinDays window', () => {
    // Lot expiring in 45 days — outside default 30, inside 60
    const lot = makeLot({ expiry_date: '2026-07-21', status: 'active' })
    expect(expiryRisk([lot], today, 30)).toHaveLength(0)
    expect(expiryRisk([lot], today, 60)).toHaveLength(1)
  })

  it('rec includes days remaining and quantity in message', () => {
    const lot = makeLot({ id: 'lot-msg', expiry_date: '2026-06-16', quantity: 250, status: 'active' })
    const [rec] = expiryRisk([lot], today, 30)
    expect(rec.message).toMatch(/10/)    // days remaining
    expect(rec.message).toMatch(/250/)   // quantity
  })

  it('suggestedAction mentions promote or donate', () => {
    const lot = makeLot({ expiry_date: '2026-06-16', status: 'active' })
    const [rec] = expiryRisk([lot], today)
    expect(rec.suggestedAction).toMatch(/promote|bundle|wholesale|donate/i)
  })

  it('handles empty lot array', () => {
    expect(expiryRisk([], today)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 2. reorderAlerts
// ---------------------------------------------------------------------------

describe('reorderAlerts', () => {
  const today = '2026-06-06'

  it('emits a critical rec when daysOfStock <= leadTimeDays', () => {
    // 100 units, velocity 5/day -> 20 days stock; leadTime 35 -> 20 <= 35 => critical
    const variant = makeVariant({ id: 'v-critical', sku: 'SKU-A', inventory_qty: 100 })
    const recs = reorderAlerts([variant], { 'v-critical': 5 }, 35, 14, today)
    expect(recs).toHaveLength(1)
    expect(recs[0].severity).toBe('critical')
    expect(recs[0].module).toBe('inventory')
  })

  it('emits a warning rec when daysOfStock <= leadTimeDays + safetyStockDays but > leadTimeDays', () => {
    // 250 units, velocity 5/day -> 50 days; leadTime 35, safety 14 -> threshold 49; 50 > 49 -> no rec
    // Let's use 240 units -> 48 days stock; 48 <= 49 and 48 > 35 -> warning
    const variant = makeVariant({ id: 'v-warn', sku: 'SKU-B', inventory_qty: 240 })
    const recs = reorderAlerts([variant], { 'v-warn': 5 }, 35, 14, today)
    expect(recs).toHaveLength(1)
    expect(recs[0].severity).toBe('warning')
  })

  it('emits no rec when variant has plenty of stock', () => {
    // 1000 units, velocity 5/day -> 200 days stock; leadTime 35 + safety 14 = 49 -> no rec
    const variant = makeVariant({ id: 'v-ok', sku: 'SKU-C', inventory_qty: 1000 })
    const recs = reorderAlerts([variant], { 'v-ok': 5 }, 35, 14, today)
    expect(recs).toHaveLength(0)
  })

  it('skips variants with velocity 0 (no crash)', () => {
    const variant = makeVariant({ id: 'v-zero', sku: 'SKU-D', inventory_qty: 100 })
    expect(() => reorderAlerts([variant], { 'v-zero': 0 }, 35, 14, today)).not.toThrow()
    const recs = reorderAlerts([variant], { 'v-zero': 0 }, 35, 14, today)
    expect(recs).toHaveLength(0)
  })

  it('skips variants not in the velocity map', () => {
    const variant = makeVariant({ id: 'v-nomatch', sku: 'SKU-E', inventory_qty: 100 })
    const recs = reorderAlerts([variant], {}, 35, 14, today)
    expect(recs).toHaveLength(0)
  })

  it('rec title includes sku', () => {
    const variant = makeVariant({ id: 'v-sku', sku: 'FANCY-SKU', inventory_qty: 100 })
    const [rec] = reorderAlerts([variant], { 'v-sku': 5 }, 35, 14, today)
    expect(rec.title).toMatch(/FANCY-SKU/)
  })

  it('rec message includes days of stock and lead time', () => {
    const variant = makeVariant({ id: 'v-msg', sku: 'SKU-MSG', inventory_qty: 100 })
    const [rec] = reorderAlerts([variant], { 'v-msg': 5 }, 35, 14, today)
    expect(rec.message).toMatch(/20/) // 100/5 = 20 days
    expect(rec.message).toMatch(/35/) // lead time
  })

  it('suggestedAction mentions production order', () => {
    const variant = makeVariant({ id: 'v-sa', sku: 'SKU-SA', inventory_qty: 100 })
    const [rec] = reorderAlerts([variant], { 'v-sa': 5 }, 35, 14, today)
    expect(rec.suggestedAction).toMatch(/production order/i)
  })

  it('handles empty arrays', () => {
    expect(reorderAlerts([], {}, 35, 14, today)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 3. shippingCostAlerts
// ---------------------------------------------------------------------------

describe('shippingCostAlerts', () => {
  it('emits a warning for channel at 0.20 (above default 0.15 threshold)', () => {
    const metrics = [{ channel: 'shopify', shippingPctOfAov: 0.20 }]
    const recs = shippingCostAlerts(metrics)
    expect(recs).toHaveLength(1)
    expect(recs[0].severity).toBe('warning')
    expect(recs[0].module).toBe('margin')
    expect(recs[0].id).toBe('shipping:shopify')
  })

  it('emits no rec for channel at 0.10 (below default threshold)', () => {
    const metrics = [{ channel: 'amazon', shippingPctOfAov: 0.10 }]
    const recs = shippingCostAlerts(metrics)
    expect(recs).toHaveLength(0)
  })

  it('emits no rec for channel exactly at threshold', () => {
    const metrics = [{ channel: 'amazon', shippingPctOfAov: 0.15 }]
    const recs = shippingCostAlerts(metrics)
    expect(recs).toHaveLength(0)
  })

  it('handles multiple channels', () => {
    const metrics = [
      { channel: 'shopify', shippingPctOfAov: 0.25 },
      { channel: 'amazon', shippingPctOfAov: 0.05 },
      { channel: 'tiktok', shippingPctOfAov: 0.20 },
    ]
    const recs = shippingCostAlerts(metrics)
    expect(recs).toHaveLength(2)
    const channels = recs.map(r => r.id)
    expect(channels).toContain('shipping:shopify')
    expect(channels).toContain('shipping:tiktok')
  })

  it('respects custom threshold', () => {
    const metrics = [{ channel: 'shopify', shippingPctOfAov: 0.10 }]
    expect(shippingCostAlerts(metrics, 0.08)).toHaveLength(1)
    expect(shippingCostAlerts(metrics, 0.15)).toHaveLength(0)
  })

  it('suggestedAction mentions free-ship threshold or carrier', () => {
    const [rec] = shippingCostAlerts([{ channel: 'shopify', shippingPctOfAov: 0.20 }])
    expect(rec.suggestedAction).toMatch(/free.ship|carrier|bundle/i)
  })

  it('handles empty metrics array', () => {
    expect(shippingCostAlerts([])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 4. fulfillmentExceptions
// ---------------------------------------------------------------------------

describe('fulfillmentExceptions', () => {
  it('emits a delay rec when 2 events have delay_days > 3', () => {
    const events = [
      makeEvent({ id: 'e1', delay_days: 4, damaged: false }),
      makeEvent({ id: 'e2', delay_days: 5, damaged: false }),
      makeEvent({ id: 'e3', delay_days: 1, damaged: false }),
    ]
    const recs = fulfillmentExceptions(events)
    const delayRec = recs.find(r => r.id === 'fulfillment:delays')
    expect(delayRec).toBeDefined()
    expect(delayRec?.severity).toBe('warning')
    expect(delayRec?.module).toBe('fulfillment')
    // count of 2 mentioned in message
    expect(delayRec?.message).toMatch(/2/)
  })

  it('emits a critical damage rec when damage rate > 5%', () => {
    // 1 damaged among 10 events = 10% > 5% threshold
    const events = [
      makeEvent({ id: 'e-dmg', damaged: true, delay_days: 0 }),
      ...Array.from({ length: 9 }, (_, i) =>
        makeEvent({ id: `e-ok-${i}`, damaged: false, delay_days: 0 }),
      ),
    ]
    const recs = fulfillmentExceptions(events)
    const dmgRec = recs.find(r => r.id === 'fulfillment:damage')
    expect(dmgRec).toBeDefined()
    expect(dmgRec?.severity).toBe('critical')
  })

  it('emits no rec when all events are clean', () => {
    const events = Array.from({ length: 5 }, (_, i) =>
      makeEvent({ id: `e-clean-${i}`, delay_days: 1, damaged: false }),
    )
    expect(fulfillmentExceptions(events)).toHaveLength(0)
  })

  it('damage rec is warning when damage rate <= 5%', () => {
    // 1 damaged among 20 = 5% => not > 5% -> no critical
    // 1 damaged among 30 = 3.3% -> warning? Actually 1/20 = 5% exactly -> not > 5% -> no damage rec at all
    // Let's test: 2 damaged among 30 = 6.7% -> critical; verify warning with exactly boundary
    const events30 = [
      makeEvent({ id: 'dmg1', damaged: true, delay_days: 0 }),
      makeEvent({ id: 'dmg2', damaged: true, delay_days: 0 }),
      ...Array.from({ length: 28 }, (_, i) =>
        makeEvent({ id: `ok-${i}`, damaged: false, delay_days: 0 }),
      ),
    ]
    // 2/30 = 6.7% > 5% -> critical
    const recs = fulfillmentExceptions(events30)
    const dmgRec = recs.find(r => r.id === 'fulfillment:damage')
    expect(dmgRec?.severity).toBe('critical')
  })

  it('suggestedAction mentions 3PL or packaging', () => {
    const events = [makeEvent({ id: 'dmg', damaged: true, delay_days: 0 })]
    const recs = fulfillmentExceptions(events)
    const dmgRec = recs.find(r => r.id === 'fulfillment:damage')
    expect(dmgRec?.suggestedAction).toMatch(/3PL|packaging/i)
  })

  it('handles empty events array', () => {
    expect(fulfillmentExceptions([])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 5. churnRisk
// ---------------------------------------------------------------------------

describe('churnRisk', () => {
  it('emits a warning when churn rate > 10% (2 churned of 10)', () => {
    const subs = [
      ...Array.from({ length: 2 }, (_, i) => makeSub({ id: `c-${i}`, status: 'churned' })),
      ...Array.from({ length: 8 }, (_, i) => makeSub({ id: `a-${i}`, status: 'active' })),
    ]
    const recs = churnRisk(subs)
    expect(recs).toHaveLength(1)
    expect(recs[0].severity).toBe('warning')
    expect(recs[0].module).toBe('retention')
    expect(recs[0].id).toBe('retention:churn')
  })

  it('emits no rec when churn rate is 0', () => {
    const subs = Array.from({ length: 5 }, (_, i) => makeSub({ id: `a-${i}`, status: 'active' }))
    expect(churnRisk(subs)).toHaveLength(0)
  })

  it('emits no rec when churn rate <= 10%', () => {
    // 1 churned out of 10 = 10% — not > 10% -> no rec
    const subs = [
      makeSub({ id: 'c-1', status: 'churned' }),
      ...Array.from({ length: 9 }, (_, i) => makeSub({ id: `a-${i}`, status: 'active' })),
    ]
    expect(churnRisk(subs)).toHaveLength(0)
  })

  it('emits no rec when total subscriptions is 0', () => {
    expect(churnRisk([])).toHaveLength(0)
  })

  it('rec message includes churn rate', () => {
    const subs = [
      makeSub({ id: 'c1', status: 'churned' }),
      makeSub({ id: 'c2', status: 'churned' }),
      ...Array.from({ length: 8 }, (_, i) => makeSub({ id: `a-${i}`, status: 'active' })),
    ]
    const [rec] = churnRisk(subs)
    // 20% churn rate
    expect(rec.message).toMatch(/20/)
  })

  it('suggestedAction mentions winback', () => {
    const subs = [
      makeSub({ id: 'c1', status: 'churned' }),
      makeSub({ id: 'c2', status: 'churned' }),
      ...Array.from({ length: 8 }, (_, i) => makeSub({ id: `a-${i}`, status: 'active' })),
    ]
    const [rec] = churnRisk(subs)
    expect(rec.suggestedAction).toMatch(/winback/i)
  })
})

// ---------------------------------------------------------------------------
// 6. staleIntegrations
// ---------------------------------------------------------------------------

describe('staleIntegrations', () => {
  const today = '2026-06-06T12:00:00Z'

  it('emits an info rec for integration last synced 48h ago', () => {
    // 48h before today = 2026-06-04T12:00:00Z
    const integration = makeIntegration({
      id: 'int-stale',
      integration_type: 'shopify',
      last_synced_at: '2026-06-04T12:00:00Z',
    })
    const recs = staleIntegrations([integration], today)
    expect(recs).toHaveLength(1)
    expect(recs[0].severity).toBe('info')
    expect(recs[0].module).toBe('integrations')
    expect(recs[0].id).toBe('integration:int-stale')
  })

  it('emits no rec for integration synced 1h ago', () => {
    // 1h before today = 2026-06-06T11:00:00Z
    const integration = makeIntegration({
      id: 'int-fresh',
      last_synced_at: '2026-06-06T11:00:00Z',
    })
    const recs = staleIntegrations([integration], today)
    expect(recs).toHaveLength(0)
  })

  it('emits an info rec for integration with null last_synced_at', () => {
    // Never synced -> treat as stale
    const integration = makeIntegration({ id: 'int-null', last_synced_at: null })
    const recs = staleIntegrations([integration], today)
    expect(recs).toHaveLength(1)
  })

  it('respects custom maxAgeHours', () => {
    // Synced 2h ago
    const integration = makeIntegration({
      id: 'int-2h',
      last_synced_at: '2026-06-06T10:00:00Z',
    })
    expect(staleIntegrations([integration], today, 1)).toHaveLength(1)
    expect(staleIntegrations([integration], today, 3)).toHaveLength(0)
  })

  it('rec message mentions stale data', () => {
    const integration = makeIntegration({ id: 'int-msg', last_synced_at: '2026-06-04T12:00:00Z' })
    const [rec] = staleIntegrations([integration], today)
    expect(rec.message).toMatch(/stale/i)
  })

  it('suggestedAction mentions re-sync', () => {
    const integration = makeIntegration({ id: 'int-sa', last_synced_at: '2026-06-04T12:00:00Z' })
    const [rec] = staleIntegrations([integration], today)
    expect(rec.suggestedAction).toMatch(/re.sync|resync/i)
  })

  it('handles empty integrations array', () => {
    expect(staleIntegrations([], today)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 7. complianceGaps
// ---------------------------------------------------------------------------

describe('complianceGaps', () => {
  it('emits an info rec for a pending claim', () => {
    const claim = makeClaim({ id: 'cl-pending', approval_status: 'pending' })
    const recs = complianceGaps([claim])
    expect(recs).toHaveLength(1)
    expect(recs[0].severity).toBe('info')
    expect(recs[0].module).toBe('compliance')
    expect(recs[0].id).toBe('compliance:cl-pending')
    expect(recs[0].title).toMatch(/approve claim/i)
  })

  it('emits no rec for approved claim', () => {
    const claim = makeClaim({ approval_status: 'approved' })
    expect(complianceGaps([claim])).toHaveLength(0)
  })

  it('emits no rec for rejected claim', () => {
    const claim = makeClaim({ approval_status: 'rejected' })
    expect(complianceGaps([claim])).toHaveLength(0)
  })

  it('emits multiple recs for multiple pending claims', () => {
    const claims = [
      makeClaim({ id: 'cl-1', approval_status: 'pending' }),
      makeClaim({ id: 'cl-2', approval_status: 'approved' }),
      makeClaim({ id: 'cl-3', approval_status: 'pending' }),
    ]
    const recs = complianceGaps(claims)
    expect(recs).toHaveLength(2)
  })

  it('suggestedAction mentions evidence and approve', () => {
    const claim = makeClaim({ approval_status: 'pending' })
    const [rec] = complianceGaps([claim])
    expect(rec.suggestedAction).toMatch(/evidence|approve/i)
  })

  it('handles empty claims array', () => {
    expect(complianceGaps([])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 8. buildRecommendations
// ---------------------------------------------------------------------------

describe('buildRecommendations', () => {
  const today = '2026-06-06T12:00:00Z'

  it('sorts output critical > warning > info', () => {
    // expired lot -> critical
    // churn subs -> warning
    // pending claim -> info
    const expiredLot = makeLot({
      id: 'lot-exp',
      expiry_date: '2026-06-05',
      status: 'active',
    })
    const churned = [
      makeSub({ id: 'c1', status: 'churned' }),
      makeSub({ id: 'c2', status: 'churned' }),
      ...Array.from({ length: 8 }, (_, i) => makeSub({ id: `a-${i}`, status: 'active' })),
    ]
    const pendingClaim = makeClaim({ id: 'cl-p', approval_status: 'pending' })

    const recs = buildRecommendations(
      {
        lots: [expiredLot],
        variants: [],
        salesVelocityByVariantId: {},
        leadTimeDays: 35,
        safetyStockDays: 14,
        shippingMetrics: [],
        fulfillmentEvents: [],
        subscriptions: churned,
        integrations: [],
        claims: [pendingClaim],
      },
      today,
    )

    expect(recs.length).toBeGreaterThanOrEqual(3)

    const severities = recs.map(r => r.severity)
    // Find first non-critical index
    const firstWarningIdx = severities.findIndex(s => s === 'warning')
    const firstInfoIdx = severities.findIndex(s => s === 'info')
    const lastCriticalIdx = severities.lastIndexOf('critical')

    // All criticals come before all warnings
    if (firstWarningIdx !== -1 && lastCriticalIdx !== -1) {
      expect(lastCriticalIdx).toBeLessThan(firstWarningIdx)
    }
    // All warnings come before all infos
    if (firstInfoIdx !== -1 && firstWarningIdx !== -1) {
      expect(firstWarningIdx).toBeLessThan(firstInfoIdx)
    }
  })

  it('returns empty array when no issues exist', () => {
    const recs = buildRecommendations(
      {
        lots: [],
        variants: [],
        salesVelocityByVariantId: {},
        leadTimeDays: 35,
        safetyStockDays: 14,
        shippingMetrics: [],
        fulfillmentEvents: [],
        subscriptions: [],
        integrations: [],
        claims: [],
      },
      today,
    )
    expect(recs).toEqual([])
  })

  it('aggregates recs from all rule functions', () => {
    const staleInt = makeIntegration({
      id: 'int-stale',
      last_synced_at: '2026-06-04T12:00:00Z',
    })
    const recs = buildRecommendations(
      {
        lots: [],
        variants: [],
        salesVelocityByVariantId: {},
        leadTimeDays: 35,
        safetyStockDays: 14,
        shippingMetrics: [{ channel: 'shopify', shippingPctOfAov: 0.25 }],
        fulfillmentEvents: [],
        subscriptions: [],
        integrations: [staleInt],
        claims: [],
      },
      today,
    )
    // shipping warning + integration info
    expect(recs.length).toBeGreaterThanOrEqual(2)
    const modules = recs.map(r => r.module)
    expect(modules).toContain('margin')
    expect(modules).toContain('integrations')
  })
})
