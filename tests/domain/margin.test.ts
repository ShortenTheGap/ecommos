import { describe, it, expect } from 'vitest'
import {
  orderCogs,
  contributionMargin,
  contributionMarginPct,
  marginByChannel,
  marginByCampaign,
  scenarioMargin,
} from '@/lib/domain/margin'
import type { Order, OrderLine, Campaign } from '@/lib/types'

// ---------------------------------------------------------------------------
// Helpers — minimal valid objects with only the fields the engine reads
// ---------------------------------------------------------------------------

const makeOrder = (overrides: Partial<Order> = {}): Order => ({
  id: 'o1',
  organization_id: 'org1',
  channel: 'shopify',
  customer_id: null,
  revenue: 50,
  discount: 5,
  shipping_cost: 8,
  packaging_cost: 1,
  pickpack_cost: 2.5,
  tax: 3,
  fulfillment_status: null,
  region: null,
  ordered_at: '2024-03-15T00:00:00Z',
  created_at: '2024-03-15T00:00:00Z',
  updated_at: null,
  ...overrides,
})

const makeLine = (quantity: number, unit_cost: number, overrides: Partial<OrderLine> = {}): OrderLine => ({
  id: `l-${Math.random()}`,
  organization_id: 'org1',
  order_id: 'o1',
  variant_id: null,
  quantity,
  unit_cost,
  unit_price: null,
  created_at: '2024-03-15T00:00:00Z',
  ...overrides,
})

const makeCampaign = (overrides: Partial<Campaign> = {}): Campaign => ({
  id: 'c1',
  organization_id: 'org1',
  channel: 'shopify',
  objective: null,
  spend: 100,
  start_date: '2024-03-01',
  end_date: '2024-03-31',
  target_product_id: null,
  created_at: '2024-03-01T00:00:00Z',
  updated_at: null,
  ...overrides,
})

// ---------------------------------------------------------------------------
// 1. orderCogs
// ---------------------------------------------------------------------------

describe('orderCogs', () => {
  it('sums quantity * unit_cost across lines', () => {
    const lines = [makeLine(2, 5), makeLine(3, 4)]
    // 2*5 + 3*4 = 10 + 12 = 22
    expect(orderCogs(lines)).toBe(22)
  })

  it('returns 0 for empty lines array', () => {
    expect(orderCogs([])).toBe(0)
  })

  it('handles a single line', () => {
    expect(orderCogs([makeLine(4, 3)])).toBe(12)
  })

  it('treats null quantity or unit_cost as 0', () => {
    const line = makeLine(0, 0, { quantity: null, unit_cost: null })
    expect(orderCogs([line])).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 2. contributionMargin
// ---------------------------------------------------------------------------

describe('contributionMargin', () => {
  it('computes correctly with known numbers', () => {
    // revenue=50, cogs=12, discount=5, shipping=8, packaging=1, pickpack=2.5, adSpend=0
    // CM = 50 - 12 - 5 - 8 - 1 - 2.5 - 0 = 21.5
    const order = makeOrder()           // revenue=50, discount=5, shipping=8, packaging=1, pickpack=2.5
    const lines = [makeLine(2, 3), makeLine(2, 3)] // cogs = 2*3+2*3=12
    expect(contributionMargin(order, lines)).toBe(21.5)
  })

  it('subtracts allocatedAdSpend when provided', () => {
    const order = makeOrder()
    const lines = [makeLine(2, 3), makeLine(2, 3)]
    // CM = 21.5 - 10 = 11.5
    expect(contributionMargin(order, lines, 10)).toBe(11.5)
  })

  it('excludes tax from contribution margin calculation', () => {
    // Tax is pass-through; changing tax should NOT change CM
    const orderLowTax = makeOrder({ tax: 1 })
    const orderHighTax = makeOrder({ tax: 99 })
    const lines = [makeLine(1, 5)]
    expect(contributionMargin(orderLowTax, lines)).toBe(contributionMargin(orderHighTax, lines))
  })

  it('returns negative margin when costs exceed revenue', () => {
    // revenue=20, cogs=30, discount=0, shipping=0, packaging=0, pickpack=0
    // CM = 20 - 30 = -10
    const order = makeOrder({ revenue: 20, discount: 0, shipping_cost: 0, packaging_cost: 0, pickpack_cost: 0 })
    const lines = [makeLine(3, 10)] // cogs = 30
    expect(contributionMargin(order, lines)).toBeLessThan(0)
    expect(contributionMargin(order, lines)).toBe(-10)
  })

  it('treats null numeric fields as 0', () => {
    const order = makeOrder({ discount: null, shipping_cost: null, packaging_cost: null, pickpack_cost: null, revenue: 50 })
    const lines = [makeLine(1, 10)]
    // CM = 50 - 10 - 0 - 0 - 0 - 0 = 40
    expect(contributionMargin(order, lines)).toBe(40)
  })
})

// ---------------------------------------------------------------------------
// 3. contributionMarginPct
// ---------------------------------------------------------------------------

describe('contributionMarginPct', () => {
  it('computes CM / revenue correctly', () => {
    const order = makeOrder() // CM = 21.5, revenue = 50
    const lines = [makeLine(2, 3), makeLine(2, 3)]
    expect(contributionMarginPct(order, lines)).toBeCloseTo(21.5 / 50, 10)
  })

  it('returns 0 when revenue is 0 (divide-by-zero guard)', () => {
    const order = makeOrder({ revenue: 0 })
    const lines = [makeLine(1, 5)]
    expect(contributionMarginPct(order, lines)).toBe(0)
  })

  it('returns 0 when revenue is null', () => {
    const order = makeOrder({ revenue: null })
    const lines = [makeLine(1, 5)]
    expect(contributionMarginPct(order, lines)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 4. marginByChannel
// ---------------------------------------------------------------------------

describe('marginByChannel', () => {
  it('groups orders by channel and sums revenue, cogs, CM', () => {
    const shopifyOrder1 = makeOrder({ id: 'o1', channel: 'shopify', revenue: 100, discount: 10, shipping_cost: 5, packaging_cost: 2, pickpack_cost: 3 })
    const shopifyOrder2 = makeOrder({ id: 'o2', channel: 'shopify', revenue: 80,  discount: 5,  shipping_cost: 4, packaging_cost: 1, pickpack_cost: 2 })
    const amazonOrder   = makeOrder({ id: 'o3', channel: 'amazon',  revenue: 60,  discount: 0,  shipping_cost: 6, packaging_cost: 1, pickpack_cost: 1 })

    const lines = {
      o1: [makeLine(2, 10)],  // cogs=20
      o2: [makeLine(1, 15)],  // cogs=15
      o3: [makeLine(3, 5)],   // cogs=15
    }

    const result = marginByChannel([shopifyOrder1, shopifyOrder2, amazonOrder], lines)

    const shopify = result.find(r => r.channel === 'shopify')
    const amazon  = result.find(r => r.channel === 'amazon')

    expect(shopify).toBeDefined()
    expect(amazon).toBeDefined()

    // Shopify: revenue=180, cogs=35
    // CM = (100-20-10-5-2-3) + (80-15-5-4-1-2) = 60 + 53 = 113
    expect(shopify!.revenue).toBe(180)
    expect(shopify!.cogs).toBe(35)
    expect(shopify!.contributionMargin).toBe(113)
    expect(shopify!.orders).toBe(2)

    // Amazon: revenue=60, cogs=15, CM=60-15-0-6-1-1=37
    expect(amazon!.revenue).toBe(60)
    expect(amazon!.cogs).toBe(15)
    expect(amazon!.contributionMargin).toBe(37)
    expect(amazon!.orders).toBe(1)
  })

  it('returns empty array for empty orders input', () => {
    expect(marginByChannel([], {})).toEqual([])
  })

  it('handles order with no lines (cogs = 0)', () => {
    const order = makeOrder({ id: 'o1', revenue: 40, discount: 0, shipping_cost: 0, packaging_cost: 0, pickpack_cost: 0 })
    const result = marginByChannel([order], { o1: [] })
    expect(result[0].cogs).toBe(0)
    expect(result[0].contributionMargin).toBe(40)
  })
})

// ---------------------------------------------------------------------------
// 5. marginByCampaign
// ---------------------------------------------------------------------------

describe('marginByCampaign', () => {
  it('attributes in-window order to campaign', () => {
    const order = makeOrder({
      id: 'o1',
      channel: 'shopify',
      revenue: 100,
      discount: 0,
      shipping_cost: 5,
      packaging_cost: 2,
      pickpack_cost: 3,
      ordered_at: '2024-03-15T00:00:00Z', // within Mar 1-31
    })
    const campaign = makeCampaign({ id: 'c1', channel: 'shopify', spend: 20, start_date: '2024-03-01', end_date: '2024-03-31' })
    const lines = { o1: [makeLine(2, 10)] } // cogs=20

    const result = marginByCampaign([order], lines, [campaign])
    expect(result).toHaveLength(1)
    const row = result[0]
    expect(row.campaignId).toBe('c1')
    expect(row.channel).toBe('shopify')
    expect(row.attributedRevenue).toBe(100)
    // CM = order-level CM (100-20-0-5-2-3=70) - campaign spend (20) = 50
    expect(row.contributionMargin).toBe(50)
    expect(row.roas).toBeCloseTo(100 / 20, 10)
  })

  it('excludes out-of-window order from campaign attribution', () => {
    const inWindowOrder  = makeOrder({ id: 'o1', channel: 'shopify', revenue: 100, ordered_at: '2024-03-15T00:00:00Z' })
    const outWindowOrder = makeOrder({ id: 'o2', channel: 'shopify', revenue: 200, ordered_at: '2024-04-05T00:00:00Z' })
    const campaign = makeCampaign({ id: 'c1', channel: 'shopify', spend: 20, start_date: '2024-03-01', end_date: '2024-03-31' })
    const lines = { o1: [makeLine(1, 10)], o2: [makeLine(1, 10)] }

    const result = marginByCampaign([inWindowOrder, outWindowOrder], lines, [campaign])
    const row = result.find(r => r.campaignId === 'c1')!
    expect(row.attributedRevenue).toBe(100) // only in-window order
  })

  it('returns roas = 0 when campaign spend is 0', () => {
    const order = makeOrder({ id: 'o1', channel: 'shopify', revenue: 100, ordered_at: '2024-03-10T00:00:00Z' })
    const campaign = makeCampaign({ spend: 0 })
    const result = marginByCampaign([order], { o1: [] }, [campaign])
    expect(result[0].roas).toBe(0)
  })

  it('returns roas = 0 when campaign spend is null', () => {
    const order = makeOrder({ id: 'o1', channel: 'shopify', revenue: 100, ordered_at: '2024-03-10T00:00:00Z' })
    const campaign = makeCampaign({ spend: null })
    const result = marginByCampaign([order], { o1: [] }, [campaign])
    expect(result[0].roas).toBe(0)
  })

  it('does not attribute order to wrong channel campaign', () => {
    const order = makeOrder({ id: 'o1', channel: 'amazon', revenue: 100, ordered_at: '2024-03-10T00:00:00Z' })
    const campaign = makeCampaign({ channel: 'shopify', spend: 50 })
    const result = marginByCampaign([order], { o1: [makeLine(1, 5)] }, [campaign])
    expect(result[0].attributedRevenue).toBe(0)
    expect(result[0].roas).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 6. scenarioMargin
// ---------------------------------------------------------------------------

describe('scenarioMargin', () => {
  const baseOrders = [
    makeOrder({ id: 'o1', revenue: 100, discount: 10, shipping_cost: 5, packaging_cost: 2, pickpack_cost: 3 }),
    makeOrder({ id: 'o2', revenue: 80,  discount: 5,  shipping_cost: 4, packaging_cost: 1, pickpack_cost: 2 }),
  ]
  const baseLines = {
    o1: [makeLine(2, 10)], // cogs=20; CM = 100-20-10-5-2-3 = 60
    o2: [makeLine(1, 15)], // cogs=15; CM = 80-15-5-4-1-2   = 53
  }
  // Baseline total CM = 113, total revenue = 180

  it('returns correct baseline with no opts', () => {
    const result = scenarioMargin(baseOrders, baseLines, {})
    expect(result.totalRevenue).toBe(180)
    expect(result.totalContributionMargin).toBe(113)
  })

  it('a 20% extra discount reduces total contribution margin vs baseline', () => {
    const baseline = scenarioMargin(baseOrders, baseLines, {})
    const scenario = scenarioMargin(baseOrders, baseLines, { discountPct: 0.20 })
    expect(scenario.totalContributionMargin).toBeLessThan(baseline.totalContributionMargin)
  })

  it('addedAdSpend reduces total contribution margin', () => {
    const baseline = scenarioMargin(baseOrders, baseLines, {})
    const scenario = scenarioMargin(baseOrders, baseLines, { addedAdSpend: 50 })
    expect(scenario.totalContributionMargin).toBe(baseline.totalContributionMargin - 50)
  })

  it('freeShipThreshold: orders at/above threshold still bear shipping cost (brand absorbs)', () => {
    // With freeShipThreshold=90, o1 (rev=100) qualifies; o2 (rev=80) doesn't
    // Free shipping means brand still pays shipping_cost; CM unchanged vs baseline
    const baseline = scenarioMargin(baseOrders, baseLines, {})
    const scenario = scenarioMargin(baseOrders, baseLines, { freeShipThreshold: 90 })
    // shipping_cost is still a brand cost regardless of threshold — model documented assumption
    expect(scenario.totalContributionMargin).toBe(baseline.totalContributionMargin)
  })

  it('combined opts apply correctly', () => {
    // discountPct=0.10, addedAdSpend=20
    // o1: extra discount = 100*0.10=10; CM = 100-20-10-5-2-3-10 = 50
    // o2: extra discount = 80*0.10=8;   CM = 80-15-5-4-1-2-8   = 45
    // total CM = 95 - 20 (addedAdSpend) = 75
    const result = scenarioMargin(baseOrders, baseLines, { discountPct: 0.10, addedAdSpend: 20 })
    expect(result.totalContributionMargin).toBe(75)
  })
})

// ---------------------------------------------------------------------------
// 7. Negative margin case (explicit)
// ---------------------------------------------------------------------------

describe('negative margin', () => {
  it('order whose costs exceed revenue yields negative contributionMargin', () => {
    // revenue=10, cogs=20 → CM = 10-20 = -10 (before other costs)
    const order = makeOrder({ revenue: 10, discount: 0, shipping_cost: 0, packaging_cost: 0, pickpack_cost: 0 })
    const lines = [makeLine(4, 5)] // cogs = 20
    const cm = contributionMargin(order, lines)
    expect(cm).toBeLessThan(0)
  })
})
