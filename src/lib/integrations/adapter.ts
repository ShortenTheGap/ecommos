// =============================================================================
// NourishOS — IntegrationAdapter interface + shared sync payload types
// =============================================================================
// Each *Sync type represents the lightweight shape that a real external API
// (Shopify, Meta/Google Ads, 3PL) returns BEFORE it is mapped into DB rows.
// Stub adapters implement this interface with deterministic fixture data.
// Real adapters will swap in later — one per integration_type.
// =============================================================================

/** A variant returned by a commerce platform (e.g. Shopify variant). */
export interface VariantSync {
  sku: string
  price: number
  weight_grams: number
  inventory_qty: number
}

/** A product returned by a commerce platform. */
export interface ProductSync {
  external_id: string
  name: string
  category: string
  status: 'active' | 'draft' | 'archived'
  variants: VariantSync[]
}

/** An order returned by a commerce platform. */
export interface OrderSync {
  external_id: string
  channel: string
  revenue: number
  discount: number
  shipping_cost: number
  region: string
  ordered_at: string
  fulfillment_status: string
}

/** An inventory record returned by a 3PL or WMS. */
export interface InventorySync {
  sku: string
  lot: string
  location: string
  quantity: number
  expiry_date: string
}

/** An ad-spend row returned by an ads platform (Meta, Google, etc.). */
export interface AdSpendSync {
  external_campaign_id: string
  channel: 'meta' | 'google' | 'tiktok' | string
  spend: number
  impressions: number
  clicks: number
  date: string
}

/** A fulfillment event returned by a 3PL or shipping platform. */
export interface FulfillmentSync {
  external_order_id: string
  carrier: string
  status: 'pending' | 'shipped' | 'delivered' | 'delayed' | 'damaged'
  tracking: string
  delay_days: number
  cost: number
}

// =============================================================================
// IntegrationAdapter — the swappable contract every connector must satisfy
// =============================================================================

export interface IntegrationAdapter {
  /** Pull product + variant catalog from the platform. */
  syncProducts(orgId: string): Promise<ProductSync[]>

  /** Pull order history from the platform. */
  syncOrders(orgId: string): Promise<OrderSync[]>

  /** Pull live inventory levels from the 3PL / WMS. */
  syncInventory(orgId: string): Promise<InventorySync[]>

  /** Pull ad-spend rows from the ads platform. */
  syncAdSpend(orgId: string): Promise<AdSpendSync[]>

  /** Pull fulfillment events from the 3PL / shipping platform. */
  syncFulfillment(orgId: string): Promise<FulfillmentSync[]>
}
