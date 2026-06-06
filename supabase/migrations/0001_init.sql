-- =============================================================================
-- NourishOS — Migration 0001: initial schema
-- =============================================================================
-- This is the foundational data model for NourishOS. Every domain table is
-- multi-tenant and scoped by organization_id (FK -> organizations, on delete
-- cascade). Row-Level Security policies are added in a later migration
-- (0002_rls.sql); this migration only defines tables, constraints and indexes.
--
-- Conventions:
--   * id          uuid primary key default gen_random_uuid()
--   * created_at  timestamptz not null default now()
--   * updated_at  timestamptz (only where rows are edited in place)
--   * snake_case  column names; TS types in src/lib/types.ts mirror these 1:1
--
-- gen_random_uuid() is available on Supabase by default (pgcrypto). We enable
-- the extension explicitly so the migration is portable to a bare Postgres.
--
-- How to run:
--   * Supabase SQL editor: paste this file and run.
--   * CLI:                 `supabase db push`  (after `supabase link`)
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. organizations  (tenant root — NOT organization_id-scoped)
-- -----------------------------------------------------------------------------
create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  plan        text not null default 'launch',
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);

-- -----------------------------------------------------------------------------
-- 2. memberships  (user <-> org mapping; user_id references auth.users)
-- -----------------------------------------------------------------------------
create table memberships (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,            -- references auth.users(id)
  organization_id uuid not null references organizations(id) on delete cascade,
  role            text not null check (role in ('owner','operator','viewer')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  unique (user_id, organization_id)
);

-- -----------------------------------------------------------------------------
-- 3. stores
-- -----------------------------------------------------------------------------
create table stores (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  platform        text,
  url             text,
  currency        text default 'USD',
  channels        text[],
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);

-- -----------------------------------------------------------------------------
-- 4. products
-- -----------------------------------------------------------------------------
create table products (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text,
  category        text,
  status          text default 'draft',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);

-- -----------------------------------------------------------------------------
-- 5. variants
-- -----------------------------------------------------------------------------
create table variants (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  product_id      uuid references products(id) on delete cascade,
  sku             text,
  price           numeric(12,2),
  weight_grams    numeric,
  dimensions      jsonb,
  inventory_qty   int default 0,
  cogs            numeric(12,2),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);

-- -----------------------------------------------------------------------------
-- 6. product_truth_records
-- -----------------------------------------------------------------------------
create table product_truth_records (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  product_id          uuid references products(id) on delete cascade,
  ingredients         text[],
  allergens           text[],
  nutrition_file_path text,
  serving_size        text,
  net_weight          text,
  version             int default 1,
  approval_status     text not null default 'draft' check (approval_status in ('draft','pending','approved')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz
);

-- -----------------------------------------------------------------------------
-- 7. claims
-- -----------------------------------------------------------------------------
create table claims (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  product_id      uuid references products(id) on delete cascade,
  claim_text      text not null,
  claim_type      text,
  evidence        text,
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected')),
  risk_level      text not null default 'medium' check (risk_level in ('low','medium','high')),
  channels_used   text[],
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);

-- -----------------------------------------------------------------------------
-- 8. vendors
-- -----------------------------------------------------------------------------
create table vendors (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  vendor_type     text check (vendor_type in ('co_packer','supplier','packaging','3pl','agency')),
  name            text,
  contacts        jsonb,
  certifications  text[],
  capabilities    text[],
  moq             int,
  lead_time_days  int,
  terms           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);

-- -----------------------------------------------------------------------------
-- 9. production_runs
-- -----------------------------------------------------------------------------
create table production_runs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  vendor_id       uuid references vendors(id) on delete set null,
  product_id      uuid references products(id) on delete set null,
  batch           text,
  lot             text,
  quantity        int,
  cost            numeric(12,2),
  production_date date,
  expiry_date     date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);

-- -----------------------------------------------------------------------------
-- 10. inventory_lots
-- -----------------------------------------------------------------------------
create table inventory_lots (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  sku               text,
  lot               text,
  location          text,
  quantity          int,
  expiry_date       date,
  status            text default 'active',
  production_run_id uuid references production_runs(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz
);

-- -----------------------------------------------------------------------------
-- 11. customers
-- -----------------------------------------------------------------------------
create table customers (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  email_hash          text,
  segment             text,
  purchase_count      int default 0,
  subscription_status text,
  preferences         jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz
);

-- -----------------------------------------------------------------------------
-- 12. orders
-- -----------------------------------------------------------------------------
create table orders (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  channel             text,
  customer_id         uuid references customers(id) on delete set null,
  revenue             numeric(12,2),
  discount            numeric(12,2) default 0,
  shipping_cost       numeric(12,2) default 0,
  packaging_cost      numeric(12,2) default 0,
  pickpack_cost       numeric(12,2) default 0,
  tax                 numeric(12,2) default 0,
  fulfillment_status  text,
  region              text,
  ordered_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz
);

-- -----------------------------------------------------------------------------
-- 13. order_lines
-- -----------------------------------------------------------------------------
create table order_lines (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  order_id        uuid references orders(id) on delete cascade,
  variant_id      uuid references variants(id) on delete set null,
  quantity        int,
  unit_price      numeric(12,2),
  unit_cost       numeric(12,2),
  created_at      timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 14. campaigns
-- -----------------------------------------------------------------------------
create table campaigns (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  channel           text,
  objective         text,
  spend             numeric(12,2) default 0,
  start_date        date,
  end_date          date,
  target_product_id uuid references products(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz
);

-- -----------------------------------------------------------------------------
-- 15. content_assets
-- -----------------------------------------------------------------------------
create table content_assets (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  asset_type      text,
  angle           text,
  claim_id        uuid references claims(id) on delete set null,
  creator         text,
  file_path       text,
  rights          text,
  performance     jsonb,
  campaign_id     uuid references campaigns(id) on delete set null,
  product_id      uuid references products(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);

-- -----------------------------------------------------------------------------
-- 16. subscriptions
-- -----------------------------------------------------------------------------
create table subscriptions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id     uuid references customers(id) on delete cascade,
  product_id      uuid references products(id) on delete set null,
  cadence         text,
  status          text,
  churn_reason    text,
  next_order_date date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);

-- -----------------------------------------------------------------------------
-- 17. fulfillment_events
-- -----------------------------------------------------------------------------
create table fulfillment_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  order_id        uuid references orders(id) on delete cascade,
  carrier         text,
  threepl         text,
  status          text,
  delay_days      int default 0,
  damaged         boolean default false,
  cost            numeric(12,2),
  tracking        text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);

-- -----------------------------------------------------------------------------
-- 18. workflow_tasks
-- -----------------------------------------------------------------------------
create table workflow_tasks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  owner           text,
  due_date        date,
  module          text,
  priority        text default 'medium',
  dependencies    text[],
  status          text default 'open',
  title           text,
  description     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);

-- -----------------------------------------------------------------------------
-- 19. integrations
-- -----------------------------------------------------------------------------
create table integrations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  integration_type text,
  status           text default 'stub',
  last_synced_at   timestamptz,
  config           jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz
);

-- -----------------------------------------------------------------------------
-- 20. ai_conversations
-- -----------------------------------------------------------------------------
create table ai_conversations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id         uuid,                     -- references auth.users(id)
  agent_profile   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);

-- -----------------------------------------------------------------------------
-- 21. ai_messages
-- -----------------------------------------------------------------------------
create table ai_messages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  conversation_id uuid references ai_conversations(id) on delete cascade,
  role            text,
  content         text,
  citations       jsonb not null default '[]'::jsonb,
  blocked_claims  jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 22. audit_log
-- -----------------------------------------------------------------------------
create table audit_log (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  actor           uuid,                     -- references auth.users(id)
  entity          text,
  entity_id       uuid,
  field           text,
  old_value       text,
  new_value       text,
  created_at      timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 23. metrics_daily  (pre-aggregated contribution margin per day/channel)
-- -----------------------------------------------------------------------------
create table metrics_daily (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  day                 date not null,
  channel             text,
  revenue             numeric(14,2),
  cogs                numeric(14,2),
  contribution_margin numeric(14,2),
  orders_count        int,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz,
  unique (organization_id, day, channel)
);

-- =============================================================================
-- Indexes
-- =============================================================================
-- organization_id on every domain table (tenant-scoped query path).
create index idx_memberships_organization_id        on memberships (organization_id);
create index idx_stores_organization_id             on stores (organization_id);
create index idx_products_organization_id           on products (organization_id);
create index idx_variants_organization_id           on variants (organization_id);
create index idx_product_truth_records_organization on product_truth_records (organization_id);
create index idx_claims_organization_id             on claims (organization_id);
create index idx_vendors_organization_id            on vendors (organization_id);
create index idx_production_runs_organization_id    on production_runs (organization_id);
create index idx_inventory_lots_organization_id     on inventory_lots (organization_id);
create index idx_customers_organization_id          on customers (organization_id);
create index idx_orders_organization_id             on orders (organization_id);
create index idx_order_lines_organization_id        on order_lines (organization_id);
create index idx_campaigns_organization_id          on campaigns (organization_id);
create index idx_content_assets_organization_id     on content_assets (organization_id);
create index idx_subscriptions_organization_id      on subscriptions (organization_id);
create index idx_fulfillment_events_organization_id on fulfillment_events (organization_id);
create index idx_workflow_tasks_organization_id     on workflow_tasks (organization_id);
create index idx_integrations_organization_id       on integrations (organization_id);
create index idx_ai_conversations_organization_id   on ai_conversations (organization_id);
create index idx_ai_messages_organization_id        on ai_messages (organization_id);
create index idx_audit_log_organization_id          on audit_log (organization_id);
create index idx_metrics_daily_organization_id      on metrics_daily (organization_id);

-- High-traffic foreign keys.
create index idx_membership_user_id            on memberships (user_id);
create index idx_variants_product_id           on variants (product_id);
create index idx_claims_product_id             on claims (product_id);
create index idx_order_lines_order_id          on order_lines (order_id);
create index idx_order_lines_variant_id        on order_lines (variant_id);
create index idx_inventory_lots_production_run on inventory_lots (production_run_id);
create index idx_orders_customer_id            on orders (customer_id);
create index idx_ai_messages_conversation_id   on ai_messages (conversation_id);
