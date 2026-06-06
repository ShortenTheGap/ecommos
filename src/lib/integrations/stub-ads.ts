// =============================================================================
// NourishOS — StubAdsAdapter
// =============================================================================
// Deterministic fixture data for Meta + Google ad-spend rows.
// All values are hardcoded constants — no Date.now() / Math.random().
// =============================================================================

import type {
  IntegrationAdapter,
  ProductSync,
  OrderSync,
  InventorySync,
  AdSpendSync,
  FulfillmentSync,
} from './adapter'

const AD_SPEND: AdSpendSync[] = [
  {
    external_campaign_id: 'meta-camp-0001',
    channel: 'meta',
    spend: 320.5,
    impressions: 42000,
    clicks: 1050,
    date: '2025-06-01',
  },
  {
    external_campaign_id: 'meta-camp-0002',
    channel: 'meta',
    spend: 215.0,
    impressions: 28500,
    clicks: 740,
    date: '2025-06-02',
  },
  {
    external_campaign_id: 'google-camp-0001',
    channel: 'google',
    spend: 180.75,
    impressions: 18200,
    clicks: 620,
    date: '2025-06-01',
  },
]

/** Not served by the ads platform — returns empty array. */
const PRODUCTS: ProductSync[] = []
const ORDERS: OrderSync[] = []
const INVENTORY: InventorySync[] = []
const FULFILLMENT: FulfillmentSync[] = []

export class StubAdsAdapter implements IntegrationAdapter {
  async syncProducts(_orgId: string): Promise<ProductSync[]> {
    return Promise.resolve(PRODUCTS)
  }

  async syncOrders(_orgId: string): Promise<OrderSync[]> {
    return Promise.resolve(ORDERS)
  }

  async syncInventory(_orgId: string): Promise<InventorySync[]> {
    return Promise.resolve(INVENTORY)
  }

  async syncAdSpend(_orgId: string): Promise<AdSpendSync[]> {
    return Promise.resolve(AD_SPEND)
  }

  async syncFulfillment(_orgId: string): Promise<FulfillmentSync[]> {
    return Promise.resolve(FULFILLMENT)
  }
}
