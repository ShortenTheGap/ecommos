# NourishOS MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a demoable single SaaS web app with all six NourishOS modules on a shared Supabase data model, seeded with a premium hot honey brand, a live Claude-powered AI workspace with claim-to-evidence guardrails, and deploy it to Railway.

**Architecture:** Next.js 15 App Router over Supabase (Postgres + Auth + RLS + Storage). A thin domain-service layer (margin/metrics engine, guardrail engine, workflow engine) sits between route handlers and the DB. Integrations are accessed only through an `IntegrationAdapter` interface with stub implementations for iteration 1. The AI workspace calls Claude (`claude-sonnet-4-6`) with DB-backed tools and a post-generation claim validation pass.

**Tech Stack:** Next.js 15, TypeScript, React, Supabase (`@supabase/supabase-js`, `@supabase/ssr`), Tailwind v4 + Paper & Ink Bento tokens, `@anthropic-ai/sdk`, Zod, Vitest for unit tests, Playwright (smoke) optional.

**Spec:** `docs/superpowers/specs/2026-06-06-nourishos-mvp-design.md`

---

## File Structure (decomposition locked here)

```
nourishos/
  src/
    app/
      (auth)/login/page.tsx
      (app)/layout.tsx                 # shell: sidebar nav + org context
      (app)/cockpit/page.tsx           # Module 1
      (app)/products/page.tsx          # Module 2 list
      (app)/products/[id]/page.tsx     # Module 2 truth-record editor
      (app)/margin/page.tsx            # Module 3
      (app)/content/page.tsx           # Module 4
      (app)/inventory/page.tsx         # Module 5
      (app)/vendors/page.tsx           # Module 6 list
      (app)/vendors/[id]/page.tsx      # Module 6 detail
      (app)/ai/page.tsx                # AI workspace
      api/ai/route.ts                  # AI workspace endpoint
      api/seed/route.ts                # dev-only re-seed trigger
      layout.tsx, globals.css
    components/bento/                   # Bento primitives (Card, Grid, Eyebrow, Kpi, Button)
    components/modules/                 # per-module client components
    lib/
      supabase/server.ts, client.ts, middleware.ts
      domain/margin.ts                 # margin/metrics engine (pure functions)
      domain/guardrails.ts             # claim-to-evidence validation (pure)
      domain/recommendations.ts        # next-best-action rules (pure)
      integrations/adapter.ts          # IntegrationAdapter interface
      integrations/stub-shopify.ts, stub-ads.ts, stub-fulfillment.ts
      ai/agents.ts                     # agent profile prompts
      ai/tools.ts                      # Claude tool defs + DB handlers
      ai/run.ts                        # orchestrator: Claude + tools + guardrail pass
      types.ts                         # shared TS types (mirror DB)
      validation.ts                    # Zod schemas
  supabase/
    migrations/0001_init.sql           # tables + indexes
    migrations/0002_rls.sql            # RLS policies
    seed/seed.ts                       # premium hot honey demo brand
  tests/
    domain/margin.test.ts
    domain/guardrails.test.ts
    domain/recommendations.test.ts
    integrations/stub.test.ts
  docs/superpowers/...
  .env.local.example, package.json, next.config.ts, tailwind, tsconfig
```

**Principle:** domain logic (`lib/domain/*`) is pure and unit-tested. UI and DB are thin. The guardrail and margin engines are the most-tested units because they are the highest-risk.

---

## PHASE 0 — Scaffold & design system

### Task 0.1: Initialize Next.js app
**Files:** Create project files via scaffolder, then prune.

- [ ] **Step 1:** In `/Users/primeai/code/nourishos`, run:
```bash
npx create-next-app@latest . --ts --app --tailwind --eslint --src-dir --import-alias "@/*" --no-turbopack --use-npm
```
Accept overwrite into the existing repo (docs/ stays). If it refuses due to non-empty dir, scaffold in `/tmp/nourishos-scaffold` and copy `src/`, config files in.
- [ ] **Step 2:** Install deps:
```bash
npm i @supabase/supabase-js @supabase/ssr @anthropic-ai/sdk zod
npm i -D vitest @vitest/coverage-v8
```
- [ ] **Step 3:** Add `"test": "vitest run"`, `"test:watch": "vitest"` to `package.json` scripts. Create `vitest.config.ts` with `test.environment = 'node'`.
- [ ] **Step 4:** Run `npm run build` to confirm a clean baseline. Expected: build succeeds.
- [ ] **Step 5:** Commit: `chore: scaffold next.js + supabase + anthropic deps`.

### Task 0.2: Paper & Ink Bento tokens + fonts
**Files:** Modify `src/app/globals.css`, `src/app/layout.tsx`.

- [ ] **Step 1:** Replace `globals.css` design tokens with the full `:root` + `[data-theme="dark"]` token blocks from `/Users/primeai/.claude/DESIGN_SYSTEM.md` (colors, type scale, spacing, radius, transitions) and the `.bento`, `.bento-grid`, `.bento-card`, `--ink`, `--accent`, `--soft` primitive classes verbatim.
- [ ] **Step 2:** In `layout.tsx`, add the Sora + Manrope Google Fonts `<link>` tags and set `body { background: var(--bg); color: var(--text); font-family: var(--font-body); line-height: 1.65; }`.
- [ ] **Step 3:** Create `src/components/bento/` primitives: `Card.tsx` (variants: default/soft/ink/accent), `Grid.tsx`, `Eyebrow.tsx`, `Kpi.tsx`, `Button.tsx`. Each uses only `var(--token)` classes — no raw hex.
- [ ] **Step 4:** Add a temporary `/` page rendering one of each primitive; `npm run dev` and eyeball the paper aesthetic.
- [ ] **Step 5:** Commit: `feat: paper & ink bento design tokens + primitives`.

---

## PHASE 1 — Layer 0: data model, auth, adapter interface (FOUNDATION — single owner, no parallelism)

### Task 1.1: Database schema migration
**Files:** Create `supabase/migrations/0001_init.sql`, `src/lib/types.ts`.

- [ ] **Step 1:** Write `0001_init.sql` creating every table from spec §5 with explicit columns, PKs (`uuid default gen_random_uuid()`), FKs, `organization_id uuid not null` on every domain table, `created_at timestamptz default now()`, and a `metrics_daily` aggregate table. Add indexes on `organization_id` and common FKs. (SQL pasted inline for the user to run in Supabase — see spec for entity list.)
- [ ] **Step 2:** Write `src/lib/types.ts` with a TS interface per table, names mirroring columns exactly (snake_case columns -> camelCase TS via a documented mapping or keep snake_case for 1:1 with rows).
- [ ] **Step 3:** No automated test (DDL). Verification: paste SQL into a scratch Supabase project SQL editor; confirm 0 errors and all tables present.
- [ ] **Step 4:** Commit: `feat: initial database schema (0001_init.sql) + TS types`.

### Task 1.2: RLS policies
**Files:** Create `supabase/migrations/0002_rls.sql`.

- [ ] **Step 1:** Enable RLS on all domain tables. Write policies: a row is visible/editable when its `organization_id` is in `(select organization_id from memberships where user_id = auth.uid())`. `memberships` itself scoped to `user_id = auth.uid()`.
- [ ] **Step 2:** Add a SQL helper `current_org_ids()` or inline the subquery in each policy.
- [ ] **Step 3:** Verification: in scratch project, with two test users in different orgs, confirm cross-org reads return zero rows.
- [ ] **Step 4:** Commit: `feat: row-level security policies (0002_rls.sql)`.

### Task 1.3: Supabase clients + auth middleware
**Files:** Create `src/lib/supabase/server.ts`, `client.ts`, `src/middleware.ts`, `src/app/(auth)/login/page.tsx`.

- [ ] **Step 1:** Implement `server.ts` (cookie-based server client via `@supabase/ssr`) and `client.ts` (browser client). Add `.env.local.example` with the 4 env vars from spec §10.
- [ ] **Step 2:** Implement `middleware.ts` redirecting unauthenticated users to `/login` for `(app)` routes.
- [ ] **Step 3:** Build `/login` with Supabase email magic-link / password auth using Bento primitives, including a password show/hide toggle (per Prime convention) if password mode.
- [ ] **Step 4:** Verification: run dev, confirm unauth redirect and successful login round-trip against scratch project.
- [ ] **Step 5:** Commit: `feat: supabase clients + auth + login page`.

### Task 1.4: IntegrationAdapter interface + stubs
**Files:** Create `src/lib/integrations/adapter.ts`, `stub-shopify.ts`, `stub-ads.ts`, `stub-fulfillment.ts`, `tests/integrations/stub.test.ts`.

- [ ] **Step 1 (test first):** Write `stub.test.ts` asserting `StubShopifyAdapter.syncProducts(orgId)` returns a deterministic non-empty array of products with required fields, and is idempotent (same input -> same output).
- [ ] **Step 2:** Run `npm test` — expect FAIL (module not found).
- [ ] **Step 3:** Define `IntegrationAdapter` interface (`syncProducts/syncOrders/syncInventory/syncAdSpend/syncFulfillment`) and implement the three stubs returning the seeded hot-honey dataset deterministically.
- [ ] **Step 4:** Run `npm test` — expect PASS.
- [ ] **Step 5:** Commit: `feat: integration adapter interface + stub adapters`.

### Task 1.5: Seed script — premium hot honey demo brand
**Files:** Create `supabase/seed/seed.ts`, `src/app/api/seed/route.ts` (dev-only).

- [ ] **Step 1:** Write `seed.ts` inserting: 1 org, 1 owner membership, 1 store, 1 product ("Ember — Premium Hot Honey") with 2 variants, a `product_truth_record` (real ingredients/allergens), 4 claims (2 approved-with-evidence, 1 pending, 1 unsupported — needed to demo the guardrail), 2 vendors (co-packer + jar supplier), 1 production_run + inventory_lots (incl. one near-expiry lot), ~120 orders across 60 days with order_lines, ~40 customers, 6 subscriptions (1 churned), 3 campaigns + content_assets, a handful of fulfillment_events (incl. delays/damage), and computed `metrics_daily` rows.
- [ ] **Step 2:** Expose `POST /api/seed` (guarded by `NODE_ENV !== 'production'`) that runs the seed via service-role client.
- [ ] **Step 3:** Verification: run seed against scratch project; confirm row counts and that the near-expiry lot + unsupported claim exist.
- [ ] **Step 4:** Commit: `feat: seed premium hot honey demo brand`.

---

## PHASE 2 — Domain engines (pure, heavily tested)

### Task 2.1: Margin/metrics engine
**Files:** Create `src/lib/domain/margin.ts`, `tests/domain/margin.test.ts`.

- [ ] **Step 1 (test):** Write tests for `contributionMargin(order)` = revenue − cogs − packaging − pickpack − shipping − discount − allocatedAdSpend, and `marginByChannel(orders)` / `marginByCampaign(orders, campaigns)` aggregations, including zero/negative-margin and empty-array cases.
- [ ] **Step 2:** Run `npm test` — expect FAIL.
- [ ] **Step 3:** Implement pure functions in `margin.ts` operating on typed inputs from `types.ts`.
- [ ] **Step 4:** Run `npm test` — expect PASS.
- [ ] **Step 5:** Commit: `feat: contribution-margin engine`.

### Task 2.2: Guardrail engine (claim-to-evidence)
**Files:** Create `src/lib/domain/guardrails.ts`, `tests/domain/guardrails.test.ts`.

- [ ] **Step 1 (test):** Write tests for `validateClaims(draftText, approvedClaims)` returning `{ ok, blocked: Claim[], citations: ClaimRef[] }`: a draft using an approved claim passes with a citation; a draft asserting an unsupported claim (e.g., "clinically proven to boost immunity") is blocked; sensitive allergen/ingredient phrasing not present in approved records is blocked.
- [ ] **Step 2:** Run `npm test` — expect FAIL.
- [ ] **Step 3:** Implement matching logic: normalize text, match against approved claim phrases + a denylist of risky health/nutrition assertions, return structured result.
- [ ] **Step 4:** Run `npm test` — expect PASS.
- [ ] **Step 5:** Commit: `feat: claim-to-evidence guardrail engine`.

### Task 2.3: Recommendations / next-best-action rules
**Files:** Create `src/lib/domain/recommendations.ts`, `tests/domain/recommendations.test.ts`.

- [ ] **Step 1 (test):** Tests for rules producing actions: near-expiry lot -> "promote/bundle"; reorder point crossed -> "reorder"; shipping % of AOV above threshold -> "review shipping"; subscription churn spike -> "winback"; stale integration -> "data freshness" warning. Each action carries `{ severity, module, message, suggestedAction }`.
- [ ] **Step 2:** Run `npm test` — expect FAIL.
- [ ] **Step 3:** Implement pure rule functions consuming typed DB rows + `metrics_daily`.
- [ ] **Step 4:** Run `npm test` — expect PASS.
- [ ] **Step 5:** Commit: `feat: next-best-action recommendation rules`.

---

## PHASE 3 — App shell + Module 1 (Cockpit)

### Task 3.1: App shell & navigation
**Files:** Create `src/app/(app)/layout.tsx`, sidebar nav component, org-context loader.

- [ ] **Step 1:** Build the authenticated shell: sticky translucent paper nav + left sidebar linking all six modules + AI workspace, using Bento primitives. Load current user + org server-side.
- [ ] **Step 2:** Add an empty-state and loading-state convention (shared components) reused by every module.
- [ ] **Step 3:** Verification: navigate between routes; nav active state uses accent pill.
- [ ] **Step 4:** Commit: `feat: authenticated app shell + navigation`.

### Task 3.2: Daily Operating Cockpit
**Files:** Create `src/app/(app)/cockpit/page.tsx`, `src/components/modules/cockpit/*`.

- [ ] **Step 1:** Server-load metrics + run `recommendations.ts` over seeded data. Render KPI cards (revenue, contribution margin, inventory risk, fulfillment exceptions, churn risk), a next-best-action feed (one `.bento-card--accent` for the top action), and a weekly-review summary block.
- [ ] **Step 2:** Each KPI follows "what changed / why / what next" — include delta vs prior period from `metrics_daily`.
- [ ] **Step 3:** Verification: cockpit shows real seeded numbers and at least the near-expiry + reorder actions.
- [ ] **Step 4:** Commit: `feat: daily operating cockpit (module 1)`.

---

## PHASE 4 — Modules 2,3,5,6 (CRUD + analytics; independent, parallelizable)

Each module task: server-load org-scoped data, render with Bento, support manual create/edit via server actions validated by Zod (`lib/validation.ts`), include empty/loading/error states.

### Task 4.1: Product & Compliance Vault (Module 2)
**Files:** `src/app/(app)/products/page.tsx`, `products/[id]/page.tsx`, `components/modules/products/*`.
- [ ] **Step 1:** Products list with status; click into truth-record editor.
- [ ] **Step 2:** Truth-record editor: ingredients, allergens, nutrition file upload (Supabase Storage), serving size, net weight, version + approval_status. Claims tracker sub-panel: claim -> evidence -> approval_status -> channels_used, with add/edit. Label artwork versioned upload. Product-page sync checklist (static checklist driven by completeness of the record).
- [ ] **Step 3:** Every compliance-field edit writes an `audit_log` row.
- [ ] **Step 4:** Verification: edit a claim from pending->approved with evidence; confirm audit row.
- [ ] **Step 5:** Commit: `feat: product & compliance vault (module 2)`.

### Task 4.2: Margin-aware Growth Intelligence (Module 3)
**Files:** `src/app/(app)/margin/page.tsx`, `components/modules/margin/*`.
- [ ] **Step 1:** Contribution-margin dashboard (per channel + per campaign) using `margin.ts` over seeded orders.
- [ ] **Step 2:** Scenario planner: inputs for discount %, free-ship threshold, CAC; recompute margin live client-side using the same pure functions.
- [ ] **Step 3:** Verification: a 20% discount scenario visibly reduces contribution margin.
- [ ] **Step 4:** Commit: `feat: margin-aware growth intelligence (module 3)`.

### Task 4.3: Inventory & Fulfillment Health (Module 5)
**Files:** `src/app/(app)/inventory/page.tsx`, `components/modules/inventory/*`.
- [ ] **Step 1:** Reorder alerts (velocity + lead time + safety stock), shelf-life aging by lot (highlight near-expiry seeded lot), fulfillment exception feed, shipping % of AOV by region, 3PL SLA tracker — all from seeded data + `recommendations.ts`.
- [ ] **Step 2:** Verification: near-expiry lot surfaces an expiry-risk action.
- [ ] **Step 3:** Commit: `feat: inventory & fulfillment health (module 5)`.

### Task 4.4: Vendor Workspace (Module 6)
**Files:** `src/app/(app)/vendors/page.tsx`, `vendors/[id]/page.tsx`, `components/modules/vendors/*`.
- [ ] **Step 1:** Vendor list + profile (certs, MOQ, lead time, contacts, documents via Storage). Production-run planner (MOQ coverage, expected receipt, COGS impact).
- [ ] **Step 2:** RFQ builder UI with an "draft with AI" button wired to the AI endpoint (Phase 5).
- [ ] **Step 3:** Verification: create a vendor + production run; planner shows coverage.
- [ ] **Step 4:** Commit: `feat: vendor workspace (module 6)`.

---

## PHASE 5 — AI workspace + guardrails (the differentiator)

> Before writing AI code, consult the `claude-api` skill for exact SDK usage, model id (`claude-sonnet-4-6`), tool-use schema, and streaming patterns.

### Task 5.1: Claude tools + agent profiles
**Files:** `src/lib/ai/tools.ts`, `src/lib/ai/agents.ts`.
- [ ] **Step 1:** Define Claude tool schemas `lookup_product_truth`, `check_claim`, `get_metrics`, each with a server-side handler that queries org-scoped DB rows (service-role + explicit org filter).
- [ ] **Step 2:** Define agent profile system prompts: launch-readiness, margin analyst, content strategist, fulfillment operator, vendor coordinator, retention strategist. Each prompt forbids inventing ingredients/allergens/nutrition/claims and requires citing source records.
- [ ] **Step 3:** Commit: `feat: claude tools + agent profiles`.

### Task 5.2: AI orchestrator + guardrail pass
**Files:** `src/lib/ai/run.ts`, `src/app/api/ai/route.ts`, `tests/domain/guardrails.test.ts` (extend).
- [ ] **Step 1:** Implement `runAgent({ orgId, profile, messages })`: call Claude with tools, execute tool calls against DB, get final draft, then run `validateClaims` (Task 2.2) over the output. Blocked claims are stripped/refused with an explicit note; citations attached.
- [ ] **Step 2:** `POST /api/ai/route.ts` streams the result; persists `ai_conversations` + `ai_messages` (with `citations`, `blocked_claims`).
- [ ] **Step 3 (test):** Add an integration-style test (mock Claude response asserting a hallucinated immunity claim) confirming the orchestrator blocks it and returns a citation for an approved claim.
- [ ] **Step 4:** Run `npm test` — expect PASS.
- [ ] **Step 5:** Commit: `feat: AI orchestrator with claim-to-evidence guardrail`.

### Task 5.3: AI workspace UI
**Files:** `src/app/(app)/ai/page.tsx`, `components/modules/ai/*`.
- [ ] **Step 1:** Conversation UI with agent-profile picker, streaming responses, visible citations, and a clear "blocked claim" treatment. Wire the Content engine + Vendor RFQ "draft with AI" buttons here.
- [ ] **Step 2:** Verification: ask "Give me 10 Meta ad angles for our hot honey" — output is grounded, cites the truth record, and any risky health claim is blocked.
- [ ] **Step 3:** Commit: `feat: AI workspace UI`.

### Task 5.4: Content & Campaign Engine (Module 4)
**Files:** `src/app/(app)/content/page.tsx`, `components/modules/content/*`.
- [ ] **Step 1:** Content calendar, asset library, creative-test tracker (hook/angle/spend/ROAS/margin) from seeded campaigns/content_assets. "Draft with AI" actions call `/api/ai`.
- [ ] **Step 2:** Verification: generate product copy; confirm it flows through the guardrail.
- [ ] **Step 3:** Commit: `feat: content & campaign engine (module 4)`.

---

## PHASE 6 — QA, polish, deploy

### Task 6.1: Stage 4 QA pass
- [ ] **Step 1:** Run the 10-phase QA Orchestrator over the app. Produce a QA report. Fix all critical + functional + major UX issues; re-run once.
- [ ] **Step 2:** `npm run build`, `npm test`, `tsc --noEmit`, lint — all green.
- [ ] **Step 3:** Manual smoke: log in, click every module, run an AI query, confirm guardrail blocks an unsupported claim.
- [ ] **Step 4:** Commit fixes.

### Task 6.2: Railway + Supabase deploy
- [ ] **Step 1:** Create a Supabase cloud project; run `0001`/`0002` migrations + seed. (User provides project; I guide.)
- [ ] **Step 2:** Create Railway service from the repo; set env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`).
- [ ] **Step 3:** Deploy; verify the live URL loads, login works, AI responds.
- [ ] **Step 4:** Commit any deploy config; tag the shareable URL in the PR/notes.

---

## Self-Review notes
- **Spec coverage:** All six modules (Tasks 3.2, 4.1–4.4, 5.4), data model (1.1), RLS/multi-tenancy (1.2), AI + guardrails (2.2, 5.1–5.3), integration abstraction (1.4), margin engine (2.1), metrics pre-aggregation (1.1 `metrics_daily`, 2.1), seed brand (1.5), deploy (6.2) — covered.
- **Deferred items** (embedded Shopify app, live sync, marketplaces, recall) intentionally absent — matches spec §1.
- **Type consistency:** all module tasks consume `lib/types.ts`; domain engines are the single source of margin/guardrail logic reused by both UI and AI.
- **Risk-weighted testing:** margin + guardrail engines are unit-tested first (Phase 2) before any UI depends on them.
