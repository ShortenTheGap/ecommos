import { describe, it, expect } from 'vitest'
import { StubShopifyAdapter } from '@/lib/integrations/stub-shopify'
import { StubAdsAdapter } from '@/lib/integrations/stub-ads'
import { StubFulfillmentAdapter } from '@/lib/integrations/stub-fulfillment'

const ORG_ID = 'org-ember-001'

describe('StubShopifyAdapter', () => {
  const adapter = new StubShopifyAdapter()

  it('syncProducts returns a non-empty array with name and variant fields', async () => {
    const products = await adapter.syncProducts(ORG_ID)
    expect(products.length).toBeGreaterThan(0)
    for (const p of products) {
      expect(typeof p.name).toBe('string')
      expect(p.variants).toBeDefined()
      expect(Array.isArray(p.variants)).toBe(true)
      expect(p.variants.length).toBeGreaterThan(0)
    }
  })

  it('syncProducts is deterministic — two calls return deeply equal results', async () => {
    const first = await adapter.syncProducts(ORG_ID)
    const second = await adapter.syncProducts(ORG_ID)
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })

  it('syncOrders returns a non-empty array of orders with numeric revenue', async () => {
    const orders = await adapter.syncOrders(ORG_ID)
    expect(orders.length).toBeGreaterThan(0)
    for (const o of orders) {
      expect(typeof o.revenue).toBe('number')
    }
  })
})

describe('StubAdsAdapter', () => {
  const adapter = new StubAdsAdapter()

  it('syncAdSpend returns a non-empty array with numeric spend', async () => {
    const rows = await adapter.syncAdSpend(ORG_ID)
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(typeof r.spend).toBe('number')
    }
  })
})

describe('StubFulfillmentAdapter', () => {
  const adapter = new StubFulfillmentAdapter()

  it('syncFulfillment returns a non-empty array with a status field', async () => {
    const events = await adapter.syncFulfillment(ORG_ID)
    expect(events.length).toBeGreaterThan(0)
    for (const e of events) {
      expect(typeof e.status).toBe('string')
    }
  })
})
