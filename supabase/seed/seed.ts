/**
 * NourishOS — demo seed data for the "Ember Goods" premium hot honey brand.
 *
 * `runSeed` is pure with respect to the runtime: it takes a service-role
 * Supabase client, performs all inserts, and returns row counts plus the demo
 * login credentials. It does NOT read env vars or construct a client — callers
 * (the CLI runner and the dev-only API route) own that.
 *
 * Idempotency: at the start we delete any existing org named "Ember Goods"
 * (FK on delete cascade removes all children), and we reuse the demo auth user
 * if it already exists. Running the seed twice leaves a single clean dataset.
 *
 * The dataset is intentionally rich enough that every module renders something
 * meaningful and the AI compliance guardrail can be demonstrated (a rejected,
 * high-risk "immunity" health claim that the AI must block).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Campaign,
  Claim,
  ContentAsset,
  Customer,
  FulfillmentEvent,
  Integration,
  InventoryLot,
  Membership,
  MetricsDaily,
  Order,
  OrderLine,
  Organization,
  ProductTruthRecord,
  ProductionRun,
  Product,
  Store,
  Subscription,
  Variant,
  Vendor,
  WorkflowTask,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEMO_EMAIL = 'demo@nourishos.app';
const DEMO_PASSWORD = 'NourishDemo!2026';
const ORG_NAME = 'Ember Goods';

const REGIONS = ['US-CA', 'US-NY', 'US-TX', 'US-FL'] as const;

const ORDER_COUNT = 120;
const CUSTOMER_COUNT = 40;

// Deterministic-ish pseudo-random: keeps total counts fixed across reruns while
// allowing varied values. Seeded mulberry32.
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isoDaysAgo(days: number, rng?: () => number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  if (rng) {
    // jitter the time-of-day so timestamps aren't all midnight
    d.setUTCHours(Math.floor(rng() * 24), Math.floor(rng() * 60), 0, 0);
  }
  return d.toISOString();
}

function dateDaysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Insert helper — throws with the Supabase error message on failure.
// ---------------------------------------------------------------------------

async function insertRows<T extends object>(
  supabase: SupabaseClient,
  table: string,
  rows: T[]
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from(table).insert(rows as never);
  if (error) {
    throw new Error(`[seed] insert into "${table}" failed: ${error.message}`);
  }
}

async function upsertRows<T extends object>(
  supabase: SupabaseClient,
  table: string,
  rows: T[],
  onConflict: string
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase
    .from(table)
    .upsert(rows as never, { onConflict });
  if (error) {
    throw new Error(`[seed] upsert into "${table}" failed: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Demo auth user — create or reuse.
// ---------------------------------------------------------------------------

async function ensureDemoUser(supabase: SupabaseClient): Promise<string> {
  const created = await supabase.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });

  if (created.data?.user) {
    return created.data.user.id;
  }

  // User likely already exists — look them up by paging through the list.
  // (admin.getUserById needs an id; there is no getUserByEmail, so we page.)
  const message = created.error?.message ?? '';
  const alreadyExists =
    /already.*registered|already.*exists|duplicate/i.test(message);

  if (!alreadyExists && created.error) {
    throw new Error(`[seed] createUser failed: ${created.error.message}`);
  }

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) {
      throw new Error(`[seed] listUsers failed: ${error.message}`);
    }
    const found = data.users.find(
      (u) => u.email?.toLowerCase() === DEMO_EMAIL.toLowerCase()
    );
    if (found) return found.id;
    if (data.users.length < 200) break; // no more pages
  }

  throw new Error(
    `[seed] demo user "${DEMO_EMAIL}" could not be created or found.`
  );
}

// ---------------------------------------------------------------------------
// runSeed
// ---------------------------------------------------------------------------

export async function runSeed(
  supabase: SupabaseClient
): Promise<{
  counts: Record<string, number>;
  demo: { email: string; password: string };
}> {
  const rng = makeRng(20260606);
  const counts: Record<string, number> = {};

  // --- Idempotency: wipe any existing "Ember Goods" org (cascades children) --
  const { data: existingOrgs, error: findErr } = await supabase
    .from('organizations')
    .select('id')
    .eq('name', ORG_NAME);
  if (findErr) {
    throw new Error(`[seed] lookup existing org failed: ${findErr.message}`);
  }
  if (existingOrgs && existingOrgs.length > 0) {
    const ids = existingOrgs.map((o) => o.id as string);
    const { error: delErr } = await supabase
      .from('organizations')
      .delete()
      .in('id', ids);
    if (delErr) {
      throw new Error(`[seed] delete existing org failed: ${delErr.message}`);
    }
  }

  // --- Demo auth user (create or reuse) -------------------------------------
  const userId = await ensureDemoUser(supabase);

  // --- Organization ---------------------------------------------------------
  const { data: orgRow, error: orgErr } = await supabase
    .from('organizations')
    .insert({
      name: ORG_NAME,
      plan: 'growth',
      settings: { brand: 'Ember Goods', vertical: 'specialty_condiment' },
    } satisfies Partial<Organization>)
    .select('id')
    .single();
  if (orgErr || !orgRow) {
    throw new Error(
      `[seed] insert organization failed: ${orgErr?.message ?? 'no row'}`
    );
  }
  const organizationId = orgRow.id as string;
  counts.organizations = 1;

  // --- Membership -----------------------------------------------------------
  await insertRows<Partial<Membership>>(supabase, 'memberships', [
    { user_id: userId, organization_id: organizationId, role: 'owner' },
  ]);
  counts.memberships = 1;

  // --- Store ----------------------------------------------------------------
  await insertRows<Partial<Store>>(supabase, 'stores', [
    {
      organization_id: organizationId,
      platform: 'shopify',
      url: 'ember-goods.myshopify.com',
      currency: 'USD',
      channels: ['dtc', 'wholesale'],
    },
  ]);
  counts.stores = 1;

  // --- Product --------------------------------------------------------------
  const { data: productRow, error: prodErr } = await supabase
    .from('products')
    .insert({
      organization_id: organizationId,
      name: 'Ember — Premium Hot Honey',
      category: 'condiment',
      status: 'active',
    } satisfies Partial<Product>)
    .select('id')
    .single();
  if (prodErr || !productRow) {
    throw new Error(
      `[seed] insert product failed: ${prodErr?.message ?? 'no row'}`
    );
  }
  const productId = productRow.id as string;
  counts.products = 1;

  // --- Variants -------------------------------------------------------------
  const { data: variantRows, error: varErr } = await supabase
    .from('variants')
    .insert([
      {
        organization_id: organizationId,
        product_id: productId,
        sku: 'EMBER-8OZ',
        price: 18.0,
        weight_grams: 340,
        inventory_qty: 600,
        cogs: 4.2,
        dimensions: { length_cm: 6, width_cm: 6, height_cm: 11 },
      },
      {
        organization_id: organizationId,
        product_id: productId,
        sku: 'EMBER-12OZ',
        price: 24.0,
        weight_grams: 480,
        inventory_qty: 300,
        cogs: 5.6,
        dimensions: { length_cm: 7, width_cm: 7, height_cm: 13 },
      },
    ] satisfies Partial<Variant>[])
    .select('id, sku, price, cogs');
  if (varErr || !variantRows || variantRows.length !== 2) {
    throw new Error(
      `[seed] insert variants failed: ${varErr?.message ?? 'wrong row count'}`
    );
  }
  counts.variants = variantRows.length;
  const variant8oz = variantRows.find((v) => v.sku === 'EMBER-8OZ')!;
  const variant12oz = variantRows.find((v) => v.sku === 'EMBER-12OZ')!;
  const variants = [variant8oz, variant12oz];

  // --- Product truth record -------------------------------------------------
  await insertRows<Partial<ProductTruthRecord>>(
    supabase,
    'product_truth_records',
    [
      {
        organization_id: organizationId,
        product_id: productId,
        ingredients: [
          'wildflower honey',
          'chili peppers',
          'apple cider vinegar',
          'sea salt',
        ],
        allergens: [],
        serving_size: '1 tbsp (21g)',
        net_weight: '8 oz (227g)',
        version: 1,
        approval_status: 'approved',
      },
    ]
  );
  counts.product_truth_records = 1;

  // --- Claims (drive the guardrail demo) ------------------------------------
  const { data: claimRows, error: claimErr } = await supabase
    .from('claims')
    .insert([
      {
        organization_id: organizationId,
        product_id: productId,
        claim_text: 'Made with 100% raw wildflower honey',
        claim_type: 'ingredient',
        evidence: 'Supplier COA #WH-2231',
        approval_status: 'approved',
        risk_level: 'low',
        channels_used: ['product_page', 'meta'],
      },
      {
        organization_id: organizationId,
        product_id: productId,
        claim_text: 'No artificial preservatives',
        claim_type: 'ingredient',
        evidence: 'Formulation spec v3',
        approval_status: 'approved',
        risk_level: 'low',
        channels_used: ['product_page'],
      },
      {
        organization_id: organizationId,
        product_id: productId,
        claim_text: 'Sustainably sourced honey',
        claim_type: 'sustainability',
        evidence: null,
        approval_status: 'pending',
        risk_level: 'medium',
        channels_used: [],
      },
      {
        organization_id: organizationId,
        product_id: productId,
        claim_text: 'Clinically proven to boost immunity',
        claim_type: 'health',
        evidence: null,
        approval_status: 'rejected',
        risk_level: 'high',
        channels_used: [],
      },
    ] satisfies Partial<Claim>[])
    .select('id, claim_text, approval_status');
  if (claimErr || !claimRows || claimRows.length !== 4) {
    throw new Error(
      `[seed] insert claims failed: ${claimErr?.message ?? 'wrong row count'}`
    );
  }
  counts.claims = claimRows.length;
  const approvedHoneyClaim = claimRows.find(
    (c) => c.claim_text === 'Made with 100% raw wildflower honey'
  )!;

  // --- Vendors --------------------------------------------------------------
  const { data: vendorRows, error: vendorErr } = await supabase
    .from('vendors')
    .insert([
      {
        organization_id: organizationId,
        vendor_type: 'co_packer',
        name: 'Cascade Co-Pack',
        certifications: ['SQF', 'Organic'],
        capabilities: ['hot-fill', 'glass-jar', 'kitting'],
        moq: 1000,
        lead_time_days: 35,
        terms: 'Net 30',
        contacts: { primary: 'ops@cascadecopack.com' },
      },
      {
        organization_id: organizationId,
        vendor_type: 'packaging',
        name: 'Glassline Jars',
        certifications: [],
        capabilities: ['glass-jars', 'custom-print'],
        moq: 5000,
        lead_time_days: 28,
        terms: 'Net 45',
        contacts: { primary: 'sales@glasslinejars.com' },
      },
    ] satisfies Partial<Vendor>[])
    .select('id, vendor_type');
  if (vendorErr || !vendorRows || vendorRows.length !== 2) {
    throw new Error(
      `[seed] insert vendors failed: ${vendorErr?.message ?? 'wrong row count'}`
    );
  }
  counts.vendors = vendorRows.length;
  const coPacker = vendorRows.find((v) => v.vendor_type === 'co_packer')!;

  // --- Production run -------------------------------------------------------
  const { data: runRow, error: runErr } = await supabase
    .from('production_runs')
    .insert({
      organization_id: organizationId,
      vendor_id: coPacker.id as string,
      product_id: productId,
      batch: 'B-2026-04',
      lot: 'L240',
      quantity: 2000,
      cost: 8400.0,
      production_date: dateDaysFromNow(-90),
      expiry_date: dateDaysFromNow(-90 + 270),
    } satisfies Partial<ProductionRun>)
    .select('id')
    .single();
  if (runErr || !runRow) {
    throw new Error(
      `[seed] insert production_run failed: ${runErr?.message ?? 'no row'}`
    );
  }
  const productionRunId = runRow.id as string;
  counts.production_runs = 1;

  // --- Inventory lots (one near-expiry to trip the expiry workflow) ---------
  await insertRows<Partial<InventoryLot>>(supabase, 'inventory_lots', [
    {
      organization_id: organizationId,
      sku: 'EMBER-8OZ',
      lot: 'L240',
      location: 'ShipBob-CA',
      quantity: 540,
      expiry_date: dateDaysFromNow(180),
      status: 'active',
      production_run_id: productionRunId,
    },
    {
      organization_id: organizationId,
      sku: 'EMBER-12OZ',
      lot: 'L241',
      location: 'ShipBob-CA',
      quantity: 260,
      expiry_date: dateDaysFromNow(210),
      status: 'active',
      production_run_id: productionRunId,
    },
    {
      // NEAR-EXPIRY lot — surfaces in the expiry-risk workflow.
      organization_id: organizationId,
      sku: 'EMBER-8OZ',
      lot: 'L228',
      location: 'Warehouse-East',
      quantity: 120,
      expiry_date: dateDaysFromNow(20),
      status: 'active',
      production_run_id: productionRunId,
    },
  ]);
  counts.inventory_lots = 3;

  // --- Customers ------------------------------------------------------------
  const segments = ['new', 'repeat', 'vip'] as const;
  const customerRowsInput: Partial<Customer>[] = [];
  for (let i = 0; i < CUSTOMER_COUNT; i += 1) {
    const segment = segments[i % segments.length];
    const purchaseCount =
      segment === 'new' ? 1 : segment === 'repeat' ? 2 + (i % 4) : 6 + (i % 8);
    const subStatus =
      i % 5 === 0 ? 'active' : i % 7 === 0 ? 'paused' : null;
    customerRowsInput.push({
      organization_id: organizationId,
      email_hash: `cust_${String(i + 1).padStart(4, '0')}`,
      segment,
      purchase_count: purchaseCount,
      subscription_status: subStatus,
      preferences: { heat_level: segment === 'vip' ? 'extra-hot' : 'medium' },
    });
  }
  const { data: customerRows, error: custErr } = await supabase
    .from('customers')
    .insert(customerRowsInput satisfies Partial<Customer>[])
    .select('id');
  if (custErr || !customerRows) {
    throw new Error(
      `[seed] insert customers failed: ${custErr?.message ?? 'no rows'}`
    );
  }
  counts.customers = customerRows.length;
  const customerIds = customerRows.map((c) => c.id as string);

  // --- Orders + order_lines -------------------------------------------------
  const orderRowsInput: Partial<Order>[] = [];
  // Track per-order line plan so we can build order_lines after orders insert.
  type LinePlan = { quantity: number; unit_price: number; unit_cost: number; variantIdx: number };
  const linePlans: LinePlan[][] = [];
  // Track derived cost components per order for metrics rollup.
  type OrderMeta = {
    channel: string;
    day: string;
    revenue: number;
    cogs: number;
    discount: number;
    shipping: number;
    packaging: number;
    pickpack: number;
  };
  const orderMetas: OrderMeta[] = [];

  for (let i = 0; i < ORDER_COUNT; i += 1) {
    // Spread across the last 60 days.
    const daysAgo = Math.floor((i / ORDER_COUNT) * 60);
    const orderedAt = isoDaysAgo(daysAgo, rng);
    const channel = i % 5 === 0 ? 'wholesale' : 'dtc'; // ~20% wholesale
    const region = REGIONS[i % REGIONS.length];

    // 1-3 lines per order.
    const lineCount = 1 + (i % 3);
    const lines: LinePlan[] = [];
    let revenue = 0;
    let cogs = 0;
    for (let l = 0; l < lineCount; l += 1) {
      const variantIdx = (i + l) % 2;
      const variant = variants[variantIdx];
      const price = Number(variant.price);
      const cost = Number(variant.cogs);
      const qty = channel === 'wholesale' ? 6 + Math.floor(rng() * 18) : 1 + Math.floor(rng() * 3);
      revenue += price * qty;
      cogs += cost * qty;
      lines.push({ quantity: qty, unit_price: price, unit_cost: cost, variantIdx });
    }
    linePlans.push(lines);

    const discount = i % 3 === 0 ? round2(revenue * 0.1) : 0;
    const shipping = channel === 'wholesale' ? round2(20 + rng() * 30) : round2(6 + rng() * 6);
    const packaging = round2(0.8 * lines.reduce((s, ln) => s + ln.quantity, 0) * 0.25 + 0.8);
    const pickpack = 2.5;
    const tax = round2((revenue - discount) * 0.07);
    const fulfillmentStatus = i % 17 === 0 ? 'processing' : 'fulfilled';

    orderRowsInput.push({
      organization_id: organizationId,
      channel,
      customer_id: customerIds[i % customerIds.length],
      revenue: round2(revenue),
      discount,
      shipping_cost: shipping,
      packaging_cost: packaging,
      pickpack_cost: pickpack,
      tax,
      fulfillment_status: fulfillmentStatus,
      region,
      ordered_at: orderedAt,
    });

    orderMetas.push({
      channel,
      day: dayKey(orderedAt),
      revenue: round2(revenue),
      cogs: round2(cogs),
      discount,
      shipping,
      packaging,
      pickpack,
    });
  }

  const { data: orderRows, error: orderErr } = await supabase
    .from('orders')
    .insert(orderRowsInput satisfies Partial<Order>[])
    .select('id');
  if (orderErr || !orderRows || orderRows.length !== ORDER_COUNT) {
    throw new Error(
      `[seed] insert orders failed: ${orderErr?.message ?? 'wrong row count'}`
    );
  }
  counts.orders = orderRows.length;
  const orderIds = orderRows.map((o) => o.id as string);

  // order_lines
  const orderLineRows: Partial<OrderLine>[] = [];
  for (let i = 0; i < orderIds.length; i += 1) {
    for (const ln of linePlans[i]) {
      orderLineRows.push({
        organization_id: organizationId,
        order_id: orderIds[i],
        variant_id: variants[ln.variantIdx].id as string,
        quantity: ln.quantity,
        unit_price: ln.unit_price,
        unit_cost: ln.unit_cost,
      });
    }
  }
  await insertRows<Partial<OrderLine>>(supabase, 'order_lines', orderLineRows);
  counts.order_lines = orderLineRows.length;

  // --- Subscriptions --------------------------------------------------------
  const subRowsInput: Partial<Subscription>[] = [];
  for (let i = 0; i < 6; i += 1) {
    const churned = i === 5;
    subRowsInput.push({
      organization_id: organizationId,
      customer_id: customerIds[i],
      product_id: productId,
      cadence: 'monthly',
      status: churned ? 'churned' : 'active',
      churn_reason: churned ? 'too much product' : null,
      next_order_date: churned ? null : dateDaysFromNow(10 + i * 3),
    });
  }
  await insertRows<Partial<Subscription>>(
    supabase,
    'subscriptions',
    subRowsInput
  );
  counts.subscriptions = subRowsInput.length;

  // --- Campaigns ------------------------------------------------------------
  const { data: campaignRows, error: campErr } = await supabase
    .from('campaigns')
    .insert([
      {
        organization_id: organizationId,
        channel: 'meta',
        objective: 'conversions',
        spend: 1200.0,
        start_date: dateDaysFromNow(-55),
        end_date: dateDaysFromNow(-5),
        target_product_id: productId,
      },
      {
        organization_id: organizationId,
        channel: 'google',
        objective: 'search',
        spend: 800.0,
        start_date: dateDaysFromNow(-40),
        end_date: dateDaysFromNow(-2),
        target_product_id: productId,
      },
      {
        organization_id: organizationId,
        channel: 'email',
        objective: 'retention',
        spend: 0.0,
        start_date: dateDaysFromNow(-30),
        end_date: dateDaysFromNow(0),
        target_product_id: productId,
      },
    ] satisfies Partial<Campaign>[])
    .select('id, channel');
  if (campErr || !campaignRows || campaignRows.length !== 3) {
    throw new Error(
      `[seed] insert campaigns failed: ${campErr?.message ?? 'wrong row count'}`
    );
  }
  counts.campaigns = campaignRows.length;
  const metaCampaign = campaignRows.find((c) => c.channel === 'meta')!;
  const googleCampaign = campaignRows.find((c) => c.channel === 'google')!;
  const emailCampaign = campaignRows.find((c) => c.channel === 'email')!;

  // --- Content assets -------------------------------------------------------
  await insertRows<Partial<ContentAsset>>(supabase, 'content_assets', [
    {
      organization_id: organizationId,
      asset_type: 'ad',
      angle: 'Drizzle it on everything — heat meets raw honey',
      claim_id: approvedHoneyClaim.id as string,
      creator: 'in-house',
      campaign_id: metaCampaign.id as string,
      product_id: productId,
      rights: 'owned',
      performance: { impressions: 142000, clicks: 3100, spend: 1200, revenue: 5400 },
    },
    {
      organization_id: organizationId,
      asset_type: 'ad',
      angle: 'Chef-approved finishing honey',
      claim_id: approvedHoneyClaim.id as string,
      creator: 'agency',
      campaign_id: googleCampaign.id as string,
      product_id: productId,
      rights: 'licensed',
      performance: { impressions: 58000, clicks: 1400, spend: 800, revenue: 2600 },
    },
    {
      organization_id: organizationId,
      asset_type: 'email',
      angle: 'Restock reminder — your Ember is running low',
      claim_id: null,
      creator: 'in-house',
      campaign_id: emailCampaign.id as string,
      product_id: productId,
      rights: 'owned',
      performance: { impressions: 9200, clicks: 740, spend: 0, revenue: 3100 },
    },
    {
      organization_id: organizationId,
      asset_type: 'ugc',
      angle: 'Customer pizza-night reel',
      claim_id: null,
      creator: 'customer',
      campaign_id: metaCampaign.id as string,
      product_id: productId,
      rights: 'ugc-release',
      performance: { impressions: 31000, clicks: 980, spend: 0, revenue: 1500 },
    },
    {
      organization_id: organizationId,
      asset_type: 'ad',
      angle: 'No artificial anything — just honey and heat',
      claim_id: null,
      creator: 'in-house',
      campaign_id: metaCampaign.id as string,
      product_id: productId,
      rights: 'owned',
      performance: { impressions: 47000, clicks: 1120, spend: 0, revenue: 2100 },
    },
  ]);
  counts.content_assets = 5;

  // --- Fulfillment events (incl. delays + a damaged shipment) ---------------
  const fulfillmentRows: Partial<FulfillmentEvent>[] = [];
  const carriers = ['USPS', 'UPS'] as const;
  for (let i = 0; i < 15; i += 1) {
    const delayed = i === 3 || i === 9; // 2 delayed >3 days
    const damaged = i === 6;
    fulfillmentRows.push({
      organization_id: organizationId,
      order_id: orderIds[i],
      carrier: carriers[i % carriers.length],
      threepl: 'ShipBob',
      status: damaged ? 'exception' : delayed ? 'delayed' : 'delivered',
      delay_days: delayed ? 4 + (i % 3) : 0,
      damaged,
      cost: round2(6 + rng() * 8),
      tracking: `1Z${100000 + i}`,
    });
  }
  await insertRows<Partial<FulfillmentEvent>>(
    supabase,
    'fulfillment_events',
    fulfillmentRows
  );
  counts.fulfillment_events = fulfillmentRows.length;

  // --- Integrations (stub, fresh sync timestamp) ----------------------------
  const nowIso = new Date().toISOString();
  await insertRows<Partial<Integration>>(supabase, 'integrations', [
    {
      organization_id: organizationId,
      integration_type: 'shopify',
      status: 'stub',
      last_synced_at: nowIso,
      config: { store: 'ember-goods.myshopify.com' },
    },
    {
      organization_id: organizationId,
      integration_type: 'ads',
      status: 'stub',
      last_synced_at: nowIso,
      config: { accounts: ['meta', 'google'] },
    },
    {
      organization_id: organizationId,
      integration_type: 'fulfillment',
      status: 'stub',
      last_synced_at: nowIso,
      config: { threepl: 'ShipBob' },
    },
  ]);
  counts.integrations = 3;

  // --- metrics_daily (rollup per day + channel from seeded orders) ----------
  const metricsMap = new Map<
    string,
    {
      day: string;
      channel: string;
      revenue: number;
      cogs: number;
      contribution_margin: number;
      orders_count: number;
    }
  >();
  for (const m of orderMetas) {
    const key = `${m.day}|${m.channel}`;
    const cm =
      m.revenue - m.cogs - m.discount - m.shipping - m.packaging - m.pickpack;
    const existing = metricsMap.get(key);
    if (existing) {
      existing.revenue += m.revenue;
      existing.cogs += m.cogs;
      existing.contribution_margin += cm;
      existing.orders_count += 1;
    } else {
      metricsMap.set(key, {
        day: m.day,
        channel: m.channel,
        revenue: m.revenue,
        cogs: m.cogs,
        contribution_margin: cm,
        orders_count: 1,
      });
    }
  }
  const metricsRows: Partial<MetricsDaily>[] = Array.from(
    metricsMap.values()
  ).map((m) => ({
    organization_id: organizationId,
    day: m.day,
    channel: m.channel,
    revenue: round2(m.revenue),
    cogs: round2(m.cogs),
    contribution_margin: round2(m.contribution_margin),
    orders_count: m.orders_count,
  }));
  await upsertRows<Partial<MetricsDaily>>(
    supabase,
    'metrics_daily',
    metricsRows,
    'organization_id,day,channel'
  );
  counts.metrics_daily = metricsRows.length;

  // --- Workflow tasks -------------------------------------------------------
  await insertRows<Partial<WorkflowTask>>(supabase, 'workflow_tasks', [
    {
      organization_id: organizationId,
      title: 'Reorder 8oz jars',
      description:
        'Near-expiry lot L228 plus rising velocity — place co-pack PO before stockout.',
      module: 'inventory',
      priority: 'high',
      status: 'open',
      owner: 'ops',
      due_date: dateDaysFromNow(7),
    },
    {
      organization_id: organizationId,
      title: 'Approve sustainability claim',
      description:
        'Review "Sustainably sourced honey" — needs supplier evidence before it can go on the product page.',
      module: 'compliance',
      priority: 'medium',
      status: 'open',
      owner: 'brand',
      due_date: dateDaysFromNow(14),
    },
    {
      organization_id: organizationId,
      title: 'Investigate damaged-shipment spike',
      description: 'One ShipBob exception this week — confirm packaging spec with co-packer.',
      module: 'fulfillment',
      priority: 'medium',
      status: 'open',
      owner: 'ops',
      due_date: dateDaysFromNow(10),
    },
  ]);
  counts.workflow_tasks = 3;

  return {
    counts,
    demo: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
  };
}
