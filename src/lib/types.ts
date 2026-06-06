// =============================================================================
// NourishOS — shared database row types
// =============================================================================
// These interfaces mirror supabase/migrations/0001_init.sql column-for-column.
// Properties stay in snake_case so Supabase rows map 1:1 with no transform.
// Keep this file in sync with the migration: if a column changes, change it
// here too. jsonb columns are typed as Record<string, unknown> (objects) or
// `unknown[]` (arrays) per their default; dates/timestamps are ISO strings.
// =============================================================================

export type Json = Record<string, unknown>;
export type JsonArray = unknown[];

// 1. organizations
export interface Organization {
  id: string;
  name: string;
  plan: string;
  settings: Json;
  created_at: string;
  updated_at: string | null;
}

// 2. memberships
export type MembershipRole = 'owner' | 'operator' | 'viewer';

export interface Membership {
  id: string;
  user_id: string;
  organization_id: string;
  role: MembershipRole;
  created_at: string;
  updated_at: string | null;
}

// 3. stores
export interface Store {
  id: string;
  organization_id: string;
  platform: string | null;
  url: string | null;
  currency: string | null;
  channels: string[] | null;
  created_at: string;
  updated_at: string | null;
}

// 4. products
export interface Product {
  id: string;
  organization_id: string;
  name: string | null;
  category: string | null;
  status: string | null;
  created_at: string;
  updated_at: string | null;
}

// 5. variants
export interface Variant {
  id: string;
  organization_id: string;
  product_id: string | null;
  sku: string | null;
  price: number | null;
  weight_grams: number | null;
  dimensions: Json | null;
  inventory_qty: number | null;
  cogs: number | null;
  created_at: string;
  updated_at: string | null;
}

// 6. product_truth_records
export type ApprovalStatusTruth = 'draft' | 'pending' | 'approved';

export interface ProductTruthRecord {
  id: string;
  organization_id: string;
  product_id: string | null;
  ingredients: string[] | null;
  allergens: string[] | null;
  nutrition_file_path: string | null;
  serving_size: string | null;
  net_weight: string | null;
  version: number | null;
  approval_status: ApprovalStatusTruth;
  created_at: string;
  updated_at: string | null;
}

// 7. claims
export type ClaimApprovalStatus = 'pending' | 'approved' | 'rejected';
export type ClaimRiskLevel = 'low' | 'medium' | 'high';

export interface Claim {
  id: string;
  organization_id: string;
  product_id: string | null;
  claim_text: string;
  claim_type: string | null;
  evidence: string | null;
  approval_status: ClaimApprovalStatus;
  risk_level: ClaimRiskLevel;
  channels_used: string[] | null;
  created_at: string;
  updated_at: string | null;
}

// 8. vendors
export type VendorType = 'co_packer' | 'supplier' | 'packaging' | '3pl' | 'agency';

export interface Vendor {
  id: string;
  organization_id: string;
  vendor_type: VendorType | null;
  name: string | null;
  contacts: Json | null;
  certifications: string[] | null;
  capabilities: string[] | null;
  moq: number | null;
  lead_time_days: number | null;
  terms: string | null;
  created_at: string;
  updated_at: string | null;
}

// 9. production_runs
export interface ProductionRun {
  id: string;
  organization_id: string;
  vendor_id: string | null;
  product_id: string | null;
  batch: string | null;
  lot: string | null;
  quantity: number | null;
  cost: number | null;
  production_date: string | null;
  expiry_date: string | null;
  created_at: string;
  updated_at: string | null;
}

// 10. inventory_lots
export interface InventoryLot {
  id: string;
  organization_id: string;
  sku: string | null;
  lot: string | null;
  location: string | null;
  quantity: number | null;
  expiry_date: string | null;
  status: string | null;
  production_run_id: string | null;
  created_at: string;
  updated_at: string | null;
}

// 11. customers
export interface Customer {
  id: string;
  organization_id: string;
  email_hash: string | null;
  segment: string | null;
  purchase_count: number | null;
  subscription_status: string | null;
  preferences: Json | null;
  created_at: string;
  updated_at: string | null;
}

// 12. orders
export interface Order {
  id: string;
  organization_id: string;
  channel: string | null;
  customer_id: string | null;
  revenue: number | null;
  discount: number | null;
  shipping_cost: number | null;
  packaging_cost: number | null;
  pickpack_cost: number | null;
  tax: number | null;
  fulfillment_status: string | null;
  region: string | null;
  ordered_at: string | null;
  created_at: string;
  updated_at: string | null;
}

// 13. order_lines
export interface OrderLine {
  id: string;
  organization_id: string;
  order_id: string | null;
  variant_id: string | null;
  quantity: number | null;
  unit_price: number | null;
  unit_cost: number | null;
  created_at: string;
}

// 14. campaigns
export interface Campaign {
  id: string;
  organization_id: string;
  channel: string | null;
  objective: string | null;
  spend: number | null;
  start_date: string | null;
  end_date: string | null;
  target_product_id: string | null;
  created_at: string;
  updated_at: string | null;
}

// 15. content_assets
export interface ContentAsset {
  id: string;
  organization_id: string;
  asset_type: string | null;
  angle: string | null;
  claim_id: string | null;
  creator: string | null;
  file_path: string | null;
  rights: string | null;
  performance: Json | null;
  campaign_id: string | null;
  product_id: string | null;
  created_at: string;
  updated_at: string | null;
}

// 16. subscriptions
export interface Subscription {
  id: string;
  organization_id: string;
  customer_id: string | null;
  product_id: string | null;
  cadence: string | null;
  status: string | null;
  churn_reason: string | null;
  next_order_date: string | null;
  created_at: string;
  updated_at: string | null;
}

// 17. fulfillment_events
export interface FulfillmentEvent {
  id: string;
  organization_id: string;
  order_id: string | null;
  carrier: string | null;
  threepl: string | null;
  status: string | null;
  delay_days: number | null;
  damaged: boolean | null;
  cost: number | null;
  tracking: string | null;
  created_at: string;
  updated_at: string | null;
}

// 18. workflow_tasks
export interface WorkflowTask {
  id: string;
  organization_id: string;
  owner: string | null;
  due_date: string | null;
  module: string | null;
  priority: string | null;
  dependencies: string[] | null;
  status: string | null;
  title: string | null;
  description: string | null;
  created_at: string;
  updated_at: string | null;
}

// 19. integrations
export interface Integration {
  id: string;
  organization_id: string;
  integration_type: string | null;
  status: string | null;
  last_synced_at: string | null;
  config: Json;
  created_at: string;
  updated_at: string | null;
}

// 20. ai_conversations
export interface AiConversation {
  id: string;
  organization_id: string;
  user_id: string | null;
  agent_profile: string | null;
  created_at: string;
  updated_at: string | null;
}

// 21. ai_messages
export interface AiMessage {
  id: string;
  organization_id: string;
  conversation_id: string | null;
  role: string | null;
  content: string | null;
  citations: JsonArray;
  blocked_claims: JsonArray;
  created_at: string;
}

// 22. audit_log
export interface AuditLog {
  id: string;
  organization_id: string;
  actor: string | null;
  entity: string | null;
  entity_id: string | null;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

// 23. metrics_daily
export interface MetricsDaily {
  id: string;
  organization_id: string;
  day: string;
  channel: string | null;
  revenue: number | null;
  cogs: number | null;
  contribution_margin: number | null;
  orders_count: number | null;
  created_at: string;
  updated_at: string | null;
}
