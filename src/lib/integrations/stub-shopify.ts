// =============================================================================
// NourishOS — StubShopifyAdapter
// =============================================================================
// Deterministic fixture data for a premium hot honey brand (Ember).
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

const PRODUCTS: ProductSync[] = [
  {
    external_id: 'shopify-prod-001',
    name: 'Ember — Premium Hot Honey',
    category: 'condiment',
    status: 'active',
    variants: [
      {
        sku: 'EMBER-HH-8OZ',
        price: 14.99,
        weight_grams: 340,
        inventory_qty: 480,
      },
      {
        sku: 'EMBER-HH-16OZ',
        price: 24.99,
        weight_grams: 680,
        inventory_qty: 210,
      },
    ],
  },
  {
    external_id: 'shopify-prod-002',
    name: 'Ember — Jalapeño Honey',
    category: 'condiment',
    status: 'active',
    variants: [
      {
        sku: 'EMBER-JH-8OZ',
        price: 15.99,
        weight_grams: 340,
        inventory_qty: 320,
      },
    ],
  },
]

const ORDERS: OrderSync[] = [
  {
    external_id: 'shopify-order-1001',
    channel: 'shopify',
    revenue: 29.98,
    discount: 0,
    shipping_cost: 5.99,
    region: 'US-CA',
    ordered_at: '2025-06-01T10:22:00Z',
    fulfillment_status: 'fulfilled',
  },
  {
    external_id: 'shopify-order-1002',
    channel: 'shopify',
    revenue: 49.97,
    discount: 5.0,
    shipping_cost: 0,
    region: 'US-TX',
    ordered_at: '2025-06-02T14:05:00Z',
    fulfillment_status: 'fulfilled',
  },
  {
    external_id: 'shopify-order-1003',
    channel: 'shopify',
    revenue: 14.99,
    discount: 0,
    shipping_cost: 5.99,
    region: 'US-NY',
    ordered_at: '2025-06-03T09:11:00Z',
    fulfillment_status: 'pending',
  },
]

/** Not served by Shopify — returns empty array. */
const AD_SPEND: AdSpendSync[] = []

/** Not served by Shopify — returns empty array. */
const INVENTORY: InventorySync[] = []

/** Not served by Shopify — returns empty array. */
const FULFILLMENT: FulfillmentSync[] = []

export class StubShopifyAdapter implements IntegrationAdapter {
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
