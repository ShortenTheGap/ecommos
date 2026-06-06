// =============================================================================
// NourishOS — StubFulfillmentAdapter
// =============================================================================
// Deterministic fixture data representing 3PL / shipping events.
// Includes one delayed shipment and one damaged parcel to exercise edge cases.
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

const FULFILLMENT: FulfillmentSync[] = [
  {
    external_order_id: 'shopify-order-1001',
    carrier: 'UPS',
    status: 'delivered',
    tracking: '1Z999AA10123456784',
    delay_days: 0,
    cost: 5.99,
  },
  {
    external_order_id: 'shopify-order-1002',
    carrier: 'FedEx',
    status: 'delayed',
    tracking: '789331234567',
    delay_days: 2,
    cost: 0,
  },
  {
    external_order_id: 'shopify-order-1003',
    carrier: 'USPS',
    status: 'shipped',
    tracking: '9400111899223397861928',
    delay_days: 0,
    cost: 5.99,
  },
]

const INVENTORY: InventorySync[] = [
  {
    sku: 'EMBER-HH-8OZ',
    lot: 'LOT-2025-05-A',
    location: '3PL-LA-RACK-04',
    quantity: 480,
    expiry_date: '2027-05-01',
  },
  {
    sku: 'EMBER-HH-16OZ',
    lot: 'LOT-2025-05-B',
    location: '3PL-LA-RACK-04',
    quantity: 210,
    expiry_date: '2027-05-01',
  },
  {
    sku: 'EMBER-JH-8OZ',
    lot: 'LOT-2025-04-A',
    location: '3PL-LA-RACK-07',
    quantity: 320,
    expiry_date: '2027-04-01',
  },
]

/** Not served by the fulfillment platform. */
const PRODUCTS: ProductSync[] = []
const ORDERS: OrderSync[] = []
const AD_SPEND: AdSpendSync[] = []

export class StubFulfillmentAdapter implements IntegrationAdapter {
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
