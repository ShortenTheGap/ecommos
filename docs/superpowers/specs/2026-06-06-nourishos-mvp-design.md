# NourishOS — MVP Design Spec (Iteration 1)

**Date:** 2026-06-06
**Status:** Approved (design), pending implementation plan
**Working title:** NourishOS
**Product:** AI operating system for premium single-product edible eCommerce brands

---

## 1. Goal & scope of this iteration

Build a single demoable SaaS web application containing **all six modules** from the
brief, navigable and functional, running on a **real shared Supabase data model** with a
seeded demo brand. Manual data entry works across every module. External integrations are
**stubbed behind a clean adapter interface**. The **AI workspace is live on Claude
Sonnet 4.6** with real grounding and guardrails. The result is deployed to a shareable
**Railway** URL.

### In scope (iteration 1)
- All six modules: Daily Cockpit, Product & Compliance Vault, Margin-aware Growth
  Intelligence, Content & Campaign Engine, Inventory & Fulfillment Health, Vendor Workspace.
- Real Supabase schema for all core entities, with Row-Level Security multi-tenancy.
- Seeded demo brand: a **premium hot honey** single-product brand.
- Manual create/edit across all modules.
- Stub integration adapters (Shopify / ads / fulfillment) returning seeded data behind a
  swappable interface.
- Live AI workspace on Claude with RAG grounding + claim-to-evidence guardrails.
- Deploy to Railway + Supabase cloud.

### Explicitly deferred (not missing — slot in behind the same data model later)
- Embedded Shopify app surface.
- Live OAuth / real data sync for any integration.
- Marketplace & wholesale channels (Amazon, TikTok Shop, Faire).
- Recall-readiness lot/batch query workflows.
- Finance/accounting reconciliation connectors.

---

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| App framework | Next.js 15 (App Router) + TypeScript + React | Single SaaS surface for now |
| Data + auth | Supabase (Postgres, Auth email, RLS, Storage) | Storage for label/cert/nutrition files |
| Styling | Tailwind v4 + Paper & Ink Bento tokens | Sora + Manrope, paper surfaces, `var(--token)` only |
| AI | Claude API `claude-sonnet-4-6` via `@anthropic-ai/sdk` | AI workspace agents |
| Validation | Zod | All API inputs |
| API | Route handlers + server actions | Zod-validated |
| Deploy | Railway (Next.js) + Supabase cloud | Shareable URL |

**Design system:** Follow `/Users/primeai/.claude/DESIGN_SYSTEM.md` (Paper & Ink Bento)
literally — warm off-white paper base, yellow accent sparingly, one ink anchor + one accent
card per row, bento-grid layout, all colors via CSS `var(--token)`.

---

## 3. Architecture (layers & boundaries)

```
UI (App Router, Bento components)
   |
Application API (route handlers + server actions, Zod-validated)
   |
Domain services -- Margin/Metrics engine . Guardrail engine . Workflow/Task engine
   |
Operating data store (Supabase Postgres, RLS by organization_id)
   ^
Integration layer (IntegrationAdapter interface -> Stub adapters for iter 1)
AI workspace (Claude + RAG over product-truth vault + guardrail gate)
```

**Layer 0 first.** The data model + auth + integration-adapter interface are built and
locked before the six modules go on top, so the schema is not re-litigated per module.
This is the single most important sequencing rule for an all-at-once build.

---

## 4. Multi-tenancy & security

- `organization_id` on every domain row; Supabase **RLS** isolates organizations.
- Supabase Auth (email) for login.
- `memberships` table maps users -> orgs with roles: `owner`, `operator`, `viewer`.
- Service-role key used only on the server; anon key client-side.
- `audit_log` table records compliance-field edits (claims, allergens, ingredients).
- Recommendations are gated on integration `last_synced_at` freshness — stale data never
  silently drives a recommendation.

---

## 5. Data model

All tables are `organization_id`-scoped unless noted.

| Entity | Key fields | Relationships |
|---|---|---|
| organizations | name, plan, settings | owns everything |
| memberships | user_id, organization_id, role | user <-> org |
| stores | platform, url, currency, channels | belongs to org; has products/orders/customers |
| products | name, category, status | has variants, truth record, campaigns |
| variants | sku, price, weight, dimensions, inventory, cogs | belongs to product; in order_lines |
| product_truth_records | ingredients, allergens, nutrition_file, serving, net_weight, version, approval_status | belongs to product; feeds AI guardrails |
| claims | claim_text, type, evidence, approval_status, risk_level, channels_used | linked to products, content_assets, campaigns |
| vendors | type, contacts, certifications, capabilities, moq, lead_time, terms | linked to products, production_runs |
| production_runs | vendor, product, batch, lot, quantity, cost, production_date, expiry_date | creates inventory_lots |
| inventory_lots | sku, lot, location, quantity, expiry, status | linked to orders, fulfillment |
| orders | channel, customer, revenue, discounts, shipping, taxes, fulfillment_status | has order_lines |
| order_lines | order_id, variant_id, qty, unit_price, unit_cost | belongs to order |
| customers | email_hash, segment, purchase_history, subscription_status | linked to orders, subscriptions |
| campaigns | channel, objective, spend, dates, target_products | linked to content_assets, metrics |
| content_assets | type, angle, claim_usage, creator, file, rights, performance | linked to campaigns, products, claims |
| subscriptions | customer, product, cadence, status, churn_reason, next_order_date | retention workflows |
| fulfillment_events | carrier, 3pl, status, delay, damage, cost, tracking | linked to orders, vendors |
| workflow_tasks | owner, due_date, module, priority, dependencies, status | created manually or by AI |
| integrations | type, status, last_synced_at, config | per org |
| ai_conversations | user_id, agent_profile, created_at | has ai_messages |
| ai_messages | conversation_id, role, content, citations, blocked_claims | belongs to conversation |
| audit_log | actor, entity, field, old_value, new_value, ts | compliance trail |

**Metrics:** contribution margin is **pre-aggregated** into a `metrics_daily` table
refreshed on write — not computed on read — so the cockpit scales. Formula:
`revenue - COGS - packaging - pick/pack - shipping - discounts - ad spend`, sliceable by
order / channel / campaign.

---

## 6. The six modules (iteration-1 depth)

1. **Daily Operating Cockpit** — KPI cards (revenue, contribution margin, inventory risk,
   fulfillment exceptions, churn risk); rule-generated next-best-action feed; "what changed
   / why it matters / what next" framing; weekly operating review summary.
2. **Product & Compliance Vault** — products list; truth-record editor (ingredients,
   allergens, nutrition file upload, serving size, net weight); **claims tracker** (claim ->
   evidence -> approval status -> channels used); label artwork vault (versioned upload);
   product-page sync checklist.
3. **Margin-aware Growth Intelligence** — contribution-margin model per order/channel/
   campaign; scenario planner (discount %, free-shipping threshold, CAC payback).
4. **Content & Campaign Engine** — content calendar; **AI drafts** (ad angles, product
   copy, email/SMS, UGC briefs) grounded in the truth vault with claim guardrails; asset
   library; creative-test tracker (hook / angle / spend / ROAS / contribution margin).
5. **Inventory & Fulfillment Health** — reorder alerts (velocity + lead time + safety
   stock); shelf-life aging by lot; fulfillment exception feed; shipping cost as % of AOV by
   region; 3PL SLA tracker.
6. **Vendor Workspace** — vendor profiles (certs, MOQ, lead time); **AI-assisted RFQ
   builder**; document storage; production-run planner (MOQ coverage, expected receipt, COGS
   impact).

---

## 7. AI workspace + guardrails

The differentiator. Designed as concrete mechanism, not adjectives.

- **Surface:** a conversation page plus contextual "ask AI" actions inside modules.
- **Agent profiles:** launch-readiness, margin analyst, content strategist, fulfillment
  operator, vendor coordinator, retention strategist.
- **Grounding via tools:** Claude is given tools (`lookup_product_truth`, `check_claim`,
  `get_metrics`) that hit the DB for the org. Sensitive facts (ingredients, allergens,
  nutrition, claims) are **read from typed records, never generated**.
- **Claim-to-evidence gate (hard):** a post-generation validation pass scans output for
  claims; any claim lacking an **approved evidence record** is **blocked**, not
  flagged-and-shipped. Output must **cite the source record**; a missing record produces an
  explicit refusal ("no approved record for X").
- **No auto-publish:** the AI never writes to a live product page; a human approval gate is
  always required for compliance-relevant output.

---

## 8. Integration abstraction

`IntegrationAdapter` interface:
`syncProducts · syncOrders · syncInventory · syncAdSpend · syncFulfillment`.

Iteration 1 ships `StubShopifyAdapter`, `StubAdsAdapter`, `StubFulfillmentAdapter` that load
the seeded demo brand deterministically. The `integrations` table tracks connection state +
`last_synced_at`. Swapping in the real Shopify adapter later touches nothing above this
layer.

---

## 9. Build sequence

1. Scaffold Next.js + Tailwind v4 + Bento tokens + Supabase client + auth.
2. Data-model migrations + RLS + seed script (demo brand: premium hot honey).
3. Integration adapter interface + stub adapters + seed loader.
4. Margin/metrics engine + Daily Cockpit.
5. Product & Compliance Vault + claims/guardrail data.
6. AI workspace + guardrail engine (Claude).
7. Content & Campaign Engine, Inventory & Fulfillment Health, Vendor Workspace.
8. QA (Stage 4, 10 phases) -> fix -> re-run.
9. Deploy to Railway + Supabase cloud.

---

## 10. Deploy prerequisites (needed at deploy step, not for local build)

- A Supabase cloud project (URL + anon key + service-role key).
- `ANTHROPIC_API_KEY` for the AI workspace.
- Railway access.

Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`.

---

## 11. Success criteria for iteration 1

- All six modules render and accept manual data, scoped per organization via RLS.
- Seeded premium hot honey brand demonstrates every module with realistic data.
- Margin engine computes contribution margin per order/channel/campaign from real data.
- AI workspace answers grounded questions and **demonstrably blocks an unsupported claim**
  and **cites a source record** for a supported one.
- Stub adapters load seeded data through the same interface a real adapter will implement.
- App deployed to a shareable Railway URL with Supabase connected.
