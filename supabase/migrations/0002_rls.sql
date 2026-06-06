-- =============================================================================
-- NourishOS — Migration 0002: Row-Level Security
-- =============================================================================
-- Depends on: 0001_init.sql
--
-- This migration enables RLS on all 23 domain tables and creates policies so
-- that an authenticated user can only read or write rows that belong to an
-- organization they are a member of (via the memberships table).
--
-- service_role (used by server-side seed scripts and admin utilities) bypasses
-- RLS automatically in Supabase/Postgres — no policies are needed for it here.
-- =============================================================================

-- =============================================================================
-- Helper function
-- =============================================================================
-- Returns the set of organization_ids the current user belongs to.
-- security definer + explicit search_path prevents search_path hijacking.
create or replace function public.current_org_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$ select organization_id from public.memberships where user_id = auth.uid() $$;

-- =============================================================================
-- Enable RLS on all 23 tables
-- =============================================================================
alter table organizations          enable row level security;
alter table memberships            enable row level security;
alter table stores                 enable row level security;
alter table products               enable row level security;
alter table variants               enable row level security;
alter table product_truth_records  enable row level security;
alter table claims                 enable row level security;
alter table vendors                enable row level security;
alter table production_runs        enable row level security;
alter table inventory_lots         enable row level security;
alter table customers              enable row level security;
alter table orders                 enable row level security;
alter table order_lines            enable row level security;
alter table campaigns              enable row level security;
alter table content_assets         enable row level security;
alter table subscriptions          enable row level security;
alter table fulfillment_events     enable row level security;
alter table workflow_tasks         enable row level security;
alter table integrations           enable row level security;
alter table ai_conversations       enable row level security;
alter table ai_messages            enable row level security;
alter table audit_log              enable row level security;
alter table metrics_daily          enable row level security;

-- =============================================================================
-- memberships policies
-- =============================================================================
-- A user sees only their own membership rows.
create policy "memberships_select"
  on memberships
  for select
  to authenticated
  using (user_id = auth.uid());

-- A user may insert a membership for themselves only.
create policy "memberships_insert"
  on memberships
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- A user may update their own membership row (e.g. role upgrade in MVP).
create policy "memberships_update"
  on memberships
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- A user may delete their own membership row (leave an org).
create policy "memberships_delete"
  on memberships
  for delete
  to authenticated
  using (user_id = auth.uid());

-- =============================================================================
-- organizations policies
-- =============================================================================
-- A user sees orgs they belong to.
create policy "organizations_select"
  on organizations
  for select
  to authenticated
  using (id in (select public.current_org_ids()));

-- Any authenticated user may create a new org (bootstrap flow).
create policy "organizations_insert"
  on organizations
  for insert
  to authenticated
  with check (true);

-- Members may update the orgs they belong to (MVP: no role-gating here).
create policy "organizations_update"
  on organizations
  for update
  to authenticated
  using (id in (select public.current_org_ids()))
  with check (id in (select public.current_org_ids()));

-- Members may delete an org they belong to (MVP: owner-only enforcement deferred).
create policy "organizations_delete"
  on organizations
  for delete
  to authenticated
  using (id in (select public.current_org_ids()));

-- =============================================================================
-- stores — org-scoped (for all)
-- =============================================================================
create policy "stores_policy"
  on stores
  for all
  to authenticated
  using (organization_id in (select public.current_org_ids()))
  with check (organization_id in (select public.current_org_ids()));

-- =============================================================================
-- products — org-scoped (for all)
-- =============================================================================
create policy "products_policy"
  on products
  for all
  to authenticated
  using (organization_id in (select public.current_org_ids()))
  with check (organization_id in (select public.current_org_ids()));

-- =============================================================================
-- variants — org-scoped (for all)
-- =============================================================================
create policy "variants_policy"
  on variants
  for all
  to authenticated
  using (organization_id in (select public.current_org_ids()))
  with check (organization_id in (select public.current_org_ids()));

-- =============================================================================
-- product_truth_records — org-scoped (for all)
-- =============================================================================
create policy "product_truth_records_policy"
  on product_truth_records
  for all
  to authenticated
  using (organization_id in (select public.current_org_ids()))
  with check (organization_id in (select public.current_org_ids()));

-- =============================================================================
-- claims — org-scoped (for all)
-- =============================================================================
create policy "claims_policy"
  on claims
  for all
  to authenticated
  using (organization_id in (select public.current_org_ids()))
  with check (organization_id in (select public.current_org_ids()));

-- =============================================================================
-- vendors — org-scoped (for all)
-- =============================================================================
create policy "vendors_policy"
  on vendors
  for all
  to authenticated
  using (organization_id in (select public.current_org_ids()))
  with check (organization_id in (select public.current_org_ids()));

-- =============================================================================
-- production_runs — org-scoped (for all)
-- =============================================================================
create policy "production_runs_policy"
  on production_runs
  for all
  to authenticated
  using (organization_id in (select public.current_org_ids()))
  with check (organization_id in (select public.current_org_ids()));

-- =============================================================================
-- inventory_lots — org-scoped (for all)
-- =============================================================================
create policy "inventory_lots_policy"
  on inventory_lots
  for all
  to authenticated
  using (organization_id in (select public.current_org_ids()))
  with check (organization_id in (select public.current_org_ids()));

-- =============================================================================
-- customers — org-scoped (for all)
-- =============================================================================
create policy "customers_policy"
  on customers
  for all
  to authenticated
  using (organization_id in (select public.current_org_ids()))
  with check (organization_id in (select public.current_org_ids()));

-- =============================================================================
-- orders — org-scoped (for all)
-- =============================================================================
create policy "orders_policy"
  on orders
  for all
  to authenticated
  using (organization_id in (select public.current_org_ids()))
  with check (organization_id in (select public.current_org_ids()));

-- =============================================================================
-- order_lines — org-scoped (for all)
-- =============================================================================
create policy "order_lines_policy"
  on order_lines
  for all
  to authenticated
  using (organization_id in (select public.current_org_ids()))
  with check (organization_id in (select public.current_org_ids()));

-- =============================================================================
-- campaigns — org-scoped (for all)
-- =============================================================================
create policy "campaigns_policy"
  on campaigns
  for all
  to authenticated
  using (organization_id in (select public.current_org_ids()))
  with check (organization_id in (select public.current_org_ids()));

-- =============================================================================
-- content_assets — org-scoped (for all)
-- =============================================================================
create policy "content_assets_policy"
  on content_assets
  for all
  to authenticated
  using (organization_id in (select public.current_org_ids()))
  with check (organization_id in (select public.current_org_ids()));

-- =============================================================================
-- subscriptions — org-scoped (for all)
-- =============================================================================
create policy "subscriptions_policy"
  on subscriptions
  for all
  to authenticated
  using (organization_id in (select public.current_org_ids()))
  with check (organization_id in (select public.current_org_ids()));

-- =============================================================================
-- fulfillment_events — org-scoped (for all)
-- =============================================================================
create policy "fulfillment_events_policy"
  on fulfillment_events
  for all
  to authenticated
  using (organization_id in (select public.current_org_ids()))
  with check (organization_id in (select public.current_org_ids()));

-- =============================================================================
-- workflow_tasks — org-scoped (for all)
-- =============================================================================
create policy "workflow_tasks_policy"
  on workflow_tasks
  for all
  to authenticated
  using (organization_id in (select public.current_org_ids()))
  with check (organization_id in (select public.current_org_ids()));

-- =============================================================================
-- integrations — org-scoped (for all)
-- =============================================================================
create policy "integrations_policy"
  on integrations
  for all
  to authenticated
  using (organization_id in (select public.current_org_ids()))
  with check (organization_id in (select public.current_org_ids()));

-- =============================================================================
-- ai_conversations — org-scoped (for all)
-- =============================================================================
create policy "ai_conversations_policy"
  on ai_conversations
  for all
  to authenticated
  using (organization_id in (select public.current_org_ids()))
  with check (organization_id in (select public.current_org_ids()));

-- =============================================================================
-- ai_messages — org-scoped (for all)
-- =============================================================================
create policy "ai_messages_policy"
  on ai_messages
  for all
  to authenticated
  using (organization_id in (select public.current_org_ids()))
  with check (organization_id in (select public.current_org_ids()));

-- =============================================================================
-- audit_log — org-scoped (for all)
-- =============================================================================
-- Note: audit_log rows are typically written server-side via service_role
-- (which bypasses RLS). Authenticated users may read their org's audit trail.
create policy "audit_log_policy"
  on audit_log
  for all
  to authenticated
  using (organization_id in (select public.current_org_ids()))
  with check (organization_id in (select public.current_org_ids()));

-- =============================================================================
-- metrics_daily — org-scoped (for all)
-- =============================================================================
-- Note: metrics_daily rows are typically written server-side via service_role.
-- Authenticated users may read their org's metrics.
create policy "metrics_daily_policy"
  on metrics_daily
  for all
  to authenticated
  using (organization_id in (select public.current_org_ids()))
  with check (organization_id in (select public.current_org_ids()));
