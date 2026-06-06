/**
 * Margin-aware Growth Intelligence (Module 3).
 *
 * Async server component that:
 *   1. Resolves the active org (RLS-respecting via requireOrg()).
 *   2. Loads the margin read model (`loadMargin`).
 *   3. Renders headline KPIs, channel breakdown, campaign profitability,
 *      and a client-side scenario planner.
 *
 * Design rules: one ink anchor + one accent card per visible row.
 * All domain math lives in the pure engine; this file only formats + lays out.
 * Tokens only — no raw hex colors.
 */

import type { CSSProperties } from "react";

import { requireOrg } from "@/lib/data/org";
import { createClient } from "@/lib/supabase/server";
import { loadMargin, type MarginData } from "@/lib/data/margin";
import type { ChannelMarginRowWithAov } from "@/lib/data/margin";
import type { CampaignMarginRow } from "@/lib/domain/margin";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  EM_DASH,
} from "@/lib/format";
import { Card, Eyebrow, Kpi } from "@/components/bento";
import { EmptyState } from "@/components/states";
import ScenarioPlanner from "./_components/ScenarioPlanner";

// =============================================================================
// Sub-components
// =============================================================================

function ChannelTable({ rows }: { rows: ChannelMarginRowWithAov[] }) {
  return (
    <div className="margin-table-wrap">
      <table className="margin-table">
        <thead>
          <tr>
            <th>Channel</th>
            <th>Revenue</th>
            <th>COGS</th>
            <th>Cont. margin</th>
            <th>CM %</th>
            <th>Orders</th>
            <th>AOV</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.channel}>
              <td>
                <span className="margin-table__channel">{row.channel}</span>
              </td>
              <td>{formatCurrency(row.revenue)}</td>
              <td>{formatCurrency(row.cogs)}</td>
              <td>{formatCurrency(row.contributionMargin)}</td>
              <td>
                <span
                  className={
                    row.cmPct < 0.2
                      ? "margin-table__pct-low"
                      : undefined
                  }
                >
                  {formatPercent(row.cmPct, 1)}
                </span>
              </td>
              <td>{formatNumber(row.orders)}</td>
              <td>{formatCurrency(row.aov)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CampaignTable({ rows }: { rows: CampaignMarginRow[] }) {
  return (
    <div className="margin-table-wrap">
      <table className="margin-table">
        <thead>
          <tr>
            <th>Channel</th>
            <th>Spend</th>
            <th>Attributed revenue</th>
            <th>Contribution margin</th>
            <th>ROAS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const roasLow = row.spend > 0 && row.roas < 1;
            return (
              <tr key={row.campaignId}>
                <td>
                  <span className="margin-table__channel">{row.channel}</span>
                </td>
                <td>{formatCurrency(row.spend)}</td>
                <td>{formatCurrency(row.attributedRevenue)}</td>
                <td>{formatCurrency(row.contributionMargin)}</td>
                <td>
                  <span
                    className={
                      roasLow
                        ? "margin-table__roas-low"
                        : "margin-table__roas-ok"
                    }
                    title={roasLow ? "ROAS below 1 — spend exceeds attributed revenue" : undefined}
                  >
                    {row.spend === 0
                      ? EM_DASH
                      : formatNumber(row.roas, 2) + "×"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// =============================================================================
// Page
// =============================================================================

/** Blended CM % is "healthy" when ≥ 30%. Below this threshold the accent card fires. */
const HEALTHY_CM_PCT_THRESHOLD = 0.3;

export default async function MarginPage() {
  const { org } = await requireOrg();
  const supabase = await createClient();
  const data: MarginData = await loadMargin(supabase, org.id);

  const {
    totalRevenue,
    totalContributionMargin,
    blendedCmPct,
    byChannel,
    byCampaign,
    orders,
    linesByOrderId,
  } = data;

  if (orders.length === 0) {
    return (
      <div>
        <section className="margin-section">
          <Eyebrow>Margin</Eyebrow>
          <h1 className="margin-title">Growth Intelligence</h1>
          <p className="margin-lede">
            Contribution margin by channel and campaign, with a live scenario
            planner for discount, free-shipping, and ad-spend what-ifs.
          </p>
        </section>
        <section className="margin-section">
          <EmptyState
            label="No orders yet"
            description="Once Ember Goods has orders, this module will show contribution margin by channel, campaign profitability, and scenario analysis."
          />
        </section>
      </div>
    );
  }

  // One ink anchor (Total CM) + one accent (Blended CM% if below healthy threshold).
  const cmPctIsLow =
    blendedCmPct !== null && blendedCmPct < HEALTHY_CM_PCT_THRESHOLD;

  // Grid span helpers.
  const span4: CSSProperties = { gridColumn: "span 4" };
  const span6: CSSProperties = { gridColumn: "span 6" };
  const span12: CSSProperties = { gridColumn: "span 12" };

  return (
    <div>
      {/* ── Header ── */}
      <section className="margin-section">
        <div className="margin-head">
          <Eyebrow>Margin</Eyebrow>
          <h1 className="margin-title">Growth Intelligence</h1>
          <p className="margin-lede">
            Contribution margin by channel and campaign, with a live scenario
            planner for discount, free-shipping, and ad-spend what-ifs. All
            math is derived from your actual order and cost data — no
            estimates.
          </p>
        </div>
      </section>

      {/* ── KPI row ── */}
      <section className="margin-section">
        <div className="bento-grid">
          {/* Total Revenue — default */}
          <div style={span4}>
            <Kpi
              label="Total revenue"
              value={formatCurrency(totalRevenue)}
              caption={`Across ${formatNumber(orders.length)} orders`}
            />
          </div>

          {/* Total Contribution Margin — ink anchor */}
          <div style={span4}>
            <Kpi
              variant="ink"
              label="Total contribution margin"
              value={formatCurrency(totalContributionMargin)}
              caption="Revenue minus COGS, discount, and fulfillment costs"
            />
          </div>

          {/* Blended CM % — accent if below threshold, else default */}
          <div style={span4}>
            <Kpi
              variant={cmPctIsLow ? "accent" : "default"}
              label="Blended CM %"
              value={
                blendedCmPct !== null
                  ? formatPercent(blendedCmPct, 1)
                  : EM_DASH
              }
              caption={
                blendedCmPct === null
                  ? "No revenue to compute a percentage"
                  : cmPctIsLow
                  ? `Below the ${formatPercent(HEALTHY_CM_PCT_THRESHOLD, 0)} healthy threshold`
                  : `Above the ${formatPercent(HEALTHY_CM_PCT_THRESHOLD, 0)} healthy threshold`
              }
            />
          </div>
        </div>
      </section>

      {/* ── Channel breakdown + Campaign profitability ── */}
      <section className="margin-section">
        <div className="bento-grid">
          {/* Channel breakdown */}
          <div style={span6}>
            <Card>
              <h2 className="margin-subhead">Contribution margin by channel</h2>
              {byChannel.length === 0 ? (
                <EmptyState
                  label="No channel data"
                  description="Orders have no channel labels assigned."
                />
              ) : (
                <ChannelTable rows={byChannel} />
              )}
            </Card>
          </div>

          {/* Campaign profitability */}
          <div style={span6}>
            <Card>
              <h2 className="margin-subhead">Campaign profitability</h2>
              {byCampaign.length === 0 ? (
                <EmptyState
                  label="No campaigns"
                  description="No campaigns found for this organization."
                />
              ) : (
                <CampaignTable rows={byCampaign} />
              )}
            </Card>
          </div>
        </div>
      </section>

      {/* ── Scenario planner ── */}
      <section className="margin-section">
        <div className="bento-grid">
          <div style={span12}>
            <Card variant="soft">
              <h2 className="margin-subhead">Scenario planner</h2>
              <p
                style={{
                  fontSize: "var(--text-sm)",
                  color: "var(--text-muted)",
                  marginBottom: "var(--space-6)",
                  lineHeight: 1.6,
                }}
              >
                Explore how discount levels, free-shipping thresholds, and
                additional ad spend affect your total contribution margin. All
                calculations run client-side on your actual orders — no
                estimates.
              </p>
              <ScenarioPlanner
                orders={orders}
                linesByOrderId={linesByOrderId}
                baselineRevenue={totalRevenue}
                baselineCm={totalContributionMargin}
              />
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
