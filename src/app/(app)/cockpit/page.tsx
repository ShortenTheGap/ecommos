/**
 * Daily Operating Cockpit (Module 1).
 *
 * The default post-login landing route. An async server component that:
 *   1. Resolves the active org (RLS-respecting via requireOrg()).
 *   2. Loads the cockpit read model (`loadCockpit`).
 *   3. Renders headline KPIs, a next-best-action feed, and a weekly review.
 *
 * Every KPI follows "what changed / why it matters": value + delta + one-line
 * caption. Exactly one accent card and at most one ink card per visible row.
 * All domain math lives in the pure engines; this file only formats + lays out.
 */

import type { CSSProperties } from "react";

import { requireOrg } from "@/lib/data/org";
import { createClient } from "@/lib/supabase/server";
import { loadCockpit, type CockpitData, type KpiMetric } from "@/lib/data/cockpit";
import type { Recommendation, Severity } from "@/lib/domain/recommendations";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  EM_DASH,
} from "@/lib/format";
import { Card, Eyebrow, Kpi } from "@/components/bento";
import { EmptyState } from "@/components/states";

// =============================================================================
// Formatting helpers (presentation only)
// =============================================================================

/** Render a KPI's delta vs the prior period as a signed percent, or em-dash. */
function deltaLabel(metric: KpiMetric): string | undefined {
  if (metric.deltaPct === null) return undefined;
  return formatPercent(metric.deltaPct, 1, true);
}

/** One-line "why it matters" caption referencing the prior period. */
function vsPriorCaption(metric: KpiMetric, formatted: (v: number | null) => string): string {
  if (metric.priorValue === null) return "No prior-period baseline yet.";
  return `${formatted(metric.priorValue)} in the prior 30 days`;
}

const SEVERITY_DOT_CLASS: Record<Severity, string> = {
  critical: "rec-dot rec-dot--critical",
  warning: "rec-dot rec-dot--warning",
  info: "rec-dot rec-dot--info",
};

// =============================================================================
// Sub-components
// =============================================================================

function RecommendationCard({
  rec,
  highlight,
}: {
  rec: Recommendation;
  highlight: boolean;
}) {
  return (
    <Card variant={highlight ? "accent" : "default"}>
      <div className="rec-card">
        <div className="rec-top">
          <span
            className={SEVERITY_DOT_CLASS[rec.severity]}
            aria-label={`Severity: ${rec.severity}`}
          />
          <span className="rec-title">{rec.title}</span>
          <span className="rec-module">{rec.module}</span>
        </div>
        <p className="rec-message">{rec.message}</p>
        <p className="rec-action">{rec.suggestedAction}</p>
      </div>
    </Card>
  );
}

/** Assemble the plain-template weekly review narrative from KPIs + recs. */
function buildNarrative(data: CockpitData): string {
  const { kpis, recommendations, summary } = data;
  const revenue = formatCurrency(kpis.revenue.value);
  const revDelta =
    kpis.revenue.deltaPct === null
      ? "no prior-period baseline"
      : `${formatPercent(kpis.revenue.deltaPct, 1, true)} vs the prior 30 days`;

  const cm = formatCurrency(kpis.contributionMargin.value);
  const cmPct =
    kpis.revenue.value > 0
      ? ` (${formatPercent(kpis.contributionMargin.value / kpis.revenue.value)} of revenue)`
      : "";

  const actionCount = recommendations.length;
  const topTitles = recommendations
    .slice(0, 3)
    .map((r) => r.title)
    .join("; ");

  const actionSentence =
    actionCount === 0
      ? "No actions need attention right now — operations are clear."
      : `${actionCount} action${actionCount === 1 ? "" : "s"} need attention: ${topTitles}.`;

  const riskBits: string[] = [];
  if (summary.inventoryAtRisk > 0) {
    riskBits.push(`${summary.inventoryAtRisk} lot(s) approaching expiry`);
  }
  if (summary.fulfillmentExceptions > 0) {
    riskBits.push(`${summary.fulfillmentExceptions} fulfillment exception(s)`);
  }
  if (summary.totalSubscriptions > 0 && summary.churnRate > 0.1) {
    riskBits.push(`subscription churn at ${formatPercent(summary.churnRate, 0)}`);
  }
  const riskSentence =
    riskBits.length > 0 ? ` Watch items: ${riskBits.join(", ")}.` : "";

  return `Revenue over the last 30 days is ${revenue} (${revDelta}). Contribution margin is ${cm}${cmPct}. ${actionSentence}${riskSentence}`;
}

// =============================================================================
// Page
// =============================================================================

export default async function CockpitPage() {
  const { org } = await requireOrg();
  const supabase = await createClient();
  const data = await loadCockpit(supabase, org.id);

  const { kpis, recommendations, summary } = data;

  // Urgency: the inventory-risk card becomes the single accent KPI when any
  // lot is at risk; otherwise the churn card carries it (or none if all clear).
  const inventoryIsUrgent = summary.inventoryAtRisk > 0;
  const churnIsUrgent = summary.totalSubscriptions > 0 && summary.churnRate > 0.1;

  // Spans on the 12-col bento grid (sum per row ≤ 12).
  const span4: CSSProperties = { gridColumn: "span 4" };

  const formatMoney = (v: number | null) =>
    v === null ? EM_DASH : formatCurrency(v);
  const formatCount = (v: number | null) =>
    v === null ? EM_DASH : formatNumber(v);

  return (
    <div>
      {/* ── Header ── */}
      <section className="cockpit-section cockpit-head">
        <Eyebrow>Daily Cockpit</Eyebrow>
        <h1 className="cockpit-title">Good day at {org.name}</h1>
        <p className="cockpit-lede">
          Your single operating view: what changed in the last 30 days, what it
          means for margin and retention, and the next actions worth your time.
        </p>
      </section>

      {/* ── KPIs ── */}
      <section className="cockpit-section">
        <div className="bento-grid" style={{ marginTop: "var(--space-6)" }}>
          {/* Row 1: Revenue (ink anchor) · Margin · AOV */}
          <div style={span4}>
            <Kpi
              variant="ink"
              label="Revenue · 30d"
              value={formatCurrency(kpis.revenue.value)}
              delta={deltaLabel(kpis.revenue)}
              caption={vsPriorCaption(kpis.revenue, formatMoney)}
            />
          </div>
          <div style={span4}>
            <Kpi
              label="Contribution margin · 30d"
              value={formatCurrency(kpis.contributionMargin.value)}
              delta={deltaLabel(kpis.contributionMargin)}
              caption={vsPriorCaption(kpis.contributionMargin, formatMoney)}
            />
          </div>
          <div style={span4}>
            <Kpi
              label="Avg order value · 30d"
              value={formatCurrency(kpis.aov.value)}
              delta={deltaLabel(kpis.aov)}
              caption={vsPriorCaption(kpis.aov, formatMoney)}
            />
          </div>

          {/* Row 2: Inventory risk (accent if urgent) · Fulfillment · Churn */}
          <div style={span4}>
            <Kpi
              variant={inventoryIsUrgent ? "accent" : "default"}
              label="Inventory at risk"
              value={formatNumber(summary.inventoryAtRisk)}
              caption={
                inventoryIsUrgent
                  ? "Lots expiring within 30 days — act to recover value"
                  : "No lots expiring within 30 days"
              }
            />
          </div>
          <div style={span4}>
            <Kpi
              label="Fulfillment exceptions"
              value={formatNumber(summary.fulfillmentExceptions)}
              caption={
                summary.fulfillmentExceptions > 0
                  ? "Shipments delayed >3d or damaged"
                  : "All shipments on track"
              }
            />
          </div>
          <div style={span4}>
            <Kpi
              variant={!inventoryIsUrgent && churnIsUrgent ? "accent" : "default"}
              label="Churn risk"
              value={
                summary.totalSubscriptions > 0
                  ? formatPercent(summary.churnRate, 0)
                  : EM_DASH
              }
              caption={
                summary.totalSubscriptions > 0
                  ? `${summary.totalSubscriptions} active subscriptions tracked`
                  : "No subscriptions tracked"
              }
            />
          </div>

          {/* Row 3: Order count */}
          <div style={span4}>
            <Kpi
              label="Orders · 30d"
              value={formatNumber(kpis.orders.value)}
              delta={deltaLabel(kpis.orders)}
              caption={vsPriorCaption(kpis.orders, formatCount)}
            />
          </div>
        </div>
      </section>

      {/* ── Next actions ── */}
      <section className="cockpit-section">
        <div className="cockpit-head">
          <Eyebrow>Next actions</Eyebrow>
          <h2 className="cockpit-subhead" style={{ marginTop: "var(--space-3)" }}>
            What needs your attention
          </h2>
          <p className="cockpit-subhead-note">
            Sorted by urgency. The highlighted card is the single highest-priority
            move right now.
          </p>
        </div>

        {recommendations.length === 0 ? (
          <div style={{ marginTop: "var(--space-6)" }}>
            <EmptyState
              label="All clear"
              description="No expiring inventory, fulfillment issues, margin leaks, or retention risks detected. Keep shipping."
            />
          </div>
        ) : (
          <div className="bento-grid" style={{ marginTop: "var(--space-6)" }}>
            {recommendations.map((rec, index) => (
              <div key={rec.id} style={span4}>
                <RecommendationCard rec={rec} highlight={index === 0} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Weekly operating review ── */}
      <section className="cockpit-section">
        <div className="cockpit-head">
          <Eyebrow>Weekly operating review</Eyebrow>
          <h2 className="cockpit-subhead" style={{ marginTop: "var(--space-3)" }}>
            The week in one paragraph
          </h2>
        </div>
        <div style={{ marginTop: "var(--space-6)" }}>
          <Card variant="soft">
            <p className="cockpit-narrative">{buildNarrative(data)}</p>
          </Card>
        </div>
      </section>
    </div>
  );
}
