/**
 * Content & Campaign Engine (Module 4).
 *
 * Async server component:
 *   1. Resolves the active org via requireOrg().
 *   2. Loads the content read model (loadContent).
 *   3. Renders:
 *      - KPI row: active campaigns · total ad spend · blended ROAS · asset count.
 *      - Campaign calendar card: honest attribution — shows spend but surfaces
 *        "attribution pending (connect ad platform)" instead of implying ROAS 0.
 *      - Creative test tracker card: table of assets by hook/angle, type,
 *        channel, CTR, ROAS. Best performer flagged with accent treatment.
 *      - Generate content card: ContentStudio client component.
 *
 * Design: Paper & Ink Bento. One ink + one accent per row max. Tokens only.
 */

import type { CSSProperties } from "react";

import { requireOrg } from "@/lib/data/org";
import { createServiceClient } from "@/lib/supabase/server";
import { loadContent, type CampaignCalendarRow, type AssetRow } from "@/lib/data/content";
import { formatCurrency, formatNumber, formatPercent, EM_DASH } from "@/lib/format";
import { Card, Eyebrow, Kpi } from "@/components/bento";
import { EmptyState } from "@/components/states";
import { ContentStudio } from "./_components/ContentStudio";

// =============================================================================
// Presentation helpers
// =============================================================================

function fmtDate(iso: string | null): string {
  if (!iso) return EM_DASH;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function channelLabel(ch: string | null): string {
  if (!ch) return EM_DASH;
  const map: Record<string, string> = {
    meta: "Meta Ads",
    google: "Google Ads",
    email: "Email",
    tiktok: "TikTok",
    sms: "SMS",
    organic: "Organic",
  };
  return map[ch.toLowerCase()] ?? ch;
}

function typeLabel(t: string | null): string {
  if (!t) return EM_DASH;
  const map: Record<string, string> = {
    ad: "Ad",
    email: "Email",
    ugc: "UGC",
    organic: "Organic",
  };
  return map[t.toLowerCase()] ?? t;
}

// =============================================================================
// Sub-components
// =============================================================================

function CampaignRow({ row }: { row: CampaignCalendarRow }) {
  return (
    <tr>
      <td className="content-table-cell">
        <span
          className="content-channel-badge"
          data-channel={row.channel ?? "other"}
        >
          {channelLabel(row.channel)}
        </span>
      </td>
      <td className="content-table-cell content-table-muted">
        {row.objective ?? EM_DASH}
      </td>
      <td className="content-table-cell">
        {fmtDate(row.startDate)} – {fmtDate(row.endDate)}
      </td>
      <td className="content-table-cell">
        {row.targetProductName ?? EM_DASH}
      </td>
      <td className="content-table-cell content-table-right">
        {row.spend != null ? formatCurrency(row.spend) : EM_DASH}
      </td>
      <td className="content-table-cell content-table-right">
        {row.spend != null && row.spend > 0 ? (
          <span className="content-attribution-pending">
            Attribution pending
          </span>
        ) : (
          <span style={{ color: "var(--text-faint)" }}>—</span>
        )}
      </td>
    </tr>
  );
}

function AssetTableRow({ row }: { row: AssetRow }) {
  const { performance } = row;
  return (
    <tr className={row.isBestPerformer ? "content-best-row" : undefined}>
      <td className="content-table-cell">
        {row.isBestPerformer && (
          <span
            aria-label="Best performer"
            style={{
              display: "inline-block",
              width: 6,
              height: 6,
              borderRadius: "var(--radius-full)",
              background: "var(--accent)",
              marginRight: "var(--space-2)",
              verticalAlign: "middle",
            }}
          />
        )}
        {row.angle ?? EM_DASH}
      </td>
      <td className="content-table-cell content-table-muted">
        {typeLabel(row.assetType)}
      </td>
      <td className="content-table-cell content-table-muted">
        {channelLabel(row.channel)}
      </td>
      <td className="content-table-cell content-table-right">
        {performance.spend != null ? formatCurrency(performance.spend) : EM_DASH}
      </td>
      <td className="content-table-cell content-table-right">
        {performance.ctr != null
          ? formatPercent(performance.ctr, 1)
          : EM_DASH}
      </td>
      <td className="content-table-cell content-table-right">
        {performance.attributionPending ? (
          <span className="content-attribution-pending">Pending</span>
        ) : performance.roas != null ? (
          <span style={{ color: performance.roas >= 1 ? "var(--text)" : "var(--text-muted)" }}>
            {formatNumber(performance.roas, 1)}×
          </span>
        ) : (
          <span style={{ color: "var(--text-faint)" }}>{EM_DASH}</span>
        )}
      </td>
    </tr>
  );
}

// =============================================================================
// Page
// =============================================================================

export default async function ContentPage() {
  const { org } = await requireOrg();
  const supabase = createServiceClient();
  const data = await loadContent(supabase, org.id);

  const { calendarRows, assetRows, kpis } = data;

  // Grid span helpers
  const span3: CSSProperties = { gridColumn: "span 3" };
  const span6: CSSProperties = { gridColumn: "span 6" };
  const span12: CSSProperties = { gridColumn: "span 12" };

  // Accent goes to ROAS when present, otherwise to spend.
  const hasRoas = kpis.blendedRoas !== null;

  return (
    <div>
      {/* ── Header ── */}
      <section className="cockpit-section cockpit-head">
        <Eyebrow>Content &amp; Campaigns</Eyebrow>
        <h1 className="cockpit-title">Content &amp; Campaign Engine</h1>
        <p className="cockpit-lede">
          Your campaign calendar, creative test results, and AI content studio
          — all in one view. Spend and attribution are shown honestly: ROAS is
          only computed when ad-platform revenue data is connected.
        </p>
      </section>

      {/* ── KPI row ── */}
      <section className="cockpit-section">
        <div className="bento-grid">
          {/* ink anchor: active campaigns */}
          <div style={span3}>
            <Kpi
              variant="ink"
              label="Active campaigns"
              value={formatNumber(kpis.activeCampaignCount)}
              caption={`${calendarRows.length} total campaign${calendarRows.length === 1 ? "" : "s"}`}
            />
          </div>

          <div style={span3}>
            <Kpi
              label="Total ad spend"
              value={formatCurrency(kpis.totalAdSpend)}
              caption="Across all campaigns"
            />
          </div>

          {/* accent: ROAS when available, otherwise neutral */}
          <div style={span3}>
            <Kpi
              variant={hasRoas ? "accent" : "default"}
              label="Blended ROAS"
              value={
                kpis.blendedRoas != null
                  ? `${formatNumber(kpis.blendedRoas, 1)}×`
                  : EM_DASH
              }
              caption={
                kpis.blendedRoas != null
                  ? "Revenue ÷ ad spend (attributed assets only)"
                  : "Connect ad platform to unlock ROAS"
              }
            />
          </div>

          <div style={span3}>
            <Kpi
              label="Content assets"
              value={formatNumber(kpis.assetCount)}
              caption="Ads, emails, and UGC in library"
            />
          </div>
        </div>
      </section>

      {/* ── Campaign calendar ── */}
      <section className="cockpit-section">
        <div className="cockpit-head">
          <Eyebrow>Campaign Calendar</Eyebrow>
          <h2 className="cockpit-subhead" style={{ marginTop: "var(--space-3)" }}>
            Spend timeline &amp; attribution status
          </h2>
          <p className="cockpit-subhead-note">
            ROAS is only shown when an ad platform is connected and revenue is
            attributable. Until then, spend is displayed truthfully.
          </p>
        </div>

        <div className="bento-grid" style={{ marginTop: "var(--space-6)" }}>
          <div style={span12}>
            {calendarRows.length === 0 ? (
              <EmptyState
                label="No campaigns yet"
                description="Add campaigns to track spend, channel performance, and creative attribution."
              />
            ) : (
              <Card>
                <div style={{ overflowX: "auto" }}>
                  <table className="content-table">
                    <thead>
                      <tr>
                        <th className="content-table-head">Channel</th>
                        <th className="content-table-head">Objective</th>
                        <th className="content-table-head">Dates</th>
                        <th className="content-table-head">Product</th>
                        <th className="content-table-head content-table-right">Spend</th>
                        <th className="content-table-head content-table-right">ROAS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calendarRows.map((row) => (
                        <CampaignRow key={row.id} row={row} />
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="vault-help" style={{ marginTop: "var(--space-4)" }}>
                  &ldquo;Attribution pending&rdquo; = spend recorded but no ad-platform
                  revenue data yet. Connect Meta Ads, Google Ads, or your attribution
                  tool to unlock ROAS.
                </p>
              </Card>
            )}
          </div>
        </div>
      </section>

      {/* ── Creative test tracker ── */}
      <section className="cockpit-section">
        <div className="cockpit-head">
          <Eyebrow>Creative Test Tracker</Eyebrow>
          <h2 className="cockpit-subhead" style={{ marginTop: "var(--space-3)" }}>
            Asset performance by angle
          </h2>
          <p className="cockpit-subhead-note">
            The highlighted row is your best performer by ROAS. CTR and ROAS
            are only computed when performance data is present.
          </p>
        </div>

        <div className="bento-grid" style={{ marginTop: "var(--space-6)" }}>
          <div style={span12}>
            {assetRows.length === 0 ? (
              <EmptyState
                label="No assets yet"
                description="Upload content assets to start tracking creative performance."
              />
            ) : (
              <Card>
                <div style={{ overflowX: "auto" }}>
                  <table className="content-table">
                    <thead>
                      <tr>
                        <th className="content-table-head">Hook / Angle</th>
                        <th className="content-table-head">Type</th>
                        <th className="content-table-head">Channel</th>
                        <th className="content-table-head content-table-right">Spend</th>
                        <th className="content-table-head content-table-right">CTR</th>
                        <th className="content-table-head content-table-right">ROAS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assetRows.map((row) => (
                        <AssetTableRow key={row.id} row={row} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        </div>
      </section>

      {/* ── Generate content ── */}
      <section className="cockpit-section">
        <div className="cockpit-head">
          <Eyebrow>Content Studio</Eyebrow>
          <h2 className="cockpit-subhead" style={{ marginTop: "var(--space-3)" }}>
            Draft with AI
          </h2>
          <p className="cockpit-subhead-note">
            AI drafts reference only approved claims. Set ANTHROPIC_API_KEY in
            your environment to enable live generation.
          </p>
        </div>

        <div className="bento-grid" style={{ marginTop: "var(--space-6)" }}>
          <div style={span6}>
            <ContentStudio />
          </div>

          {/* Approved claims sidebar */}
          <div style={span6}>
            <Card variant="soft">
              <Eyebrow>Approved Claims</Eyebrow>
              <p className="vault-empty-note" style={{ marginTop: "var(--space-3)" }}>
                Only these claims are citable in AI-generated content.
              </p>
              {data.approvedClaims.length === 0 ? (
                <p
                  className="vault-help"
                  style={{ marginTop: "var(--space-4)" }}
                >
                  No approved claims yet. Approve claims in the Claims module to
                  unlock citation.
                </p>
              ) : (
                <ul
                  style={{
                    listStyle: "none",
                    padding: 0,
                    margin: "var(--space-4) 0 0",
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-3)",
                  }}
                >
                  {data.approvedClaims.map((claim) => (
                    <li key={claim.id} style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-start" }}>
                      <span
                        aria-hidden="true"
                        style={{
                          marginTop: "0.4em",
                          display: "inline-block",
                          width: 5,
                          height: 5,
                          borderRadius: "var(--radius-full)",
                          background: "var(--accent)",
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontSize: "var(--text-sm)", color: "var(--text)" }}>
                        {claim.claimText}
                        {claim.claimType && (
                          <span
                            className="vendor-type-badge"
                            style={{ marginLeft: "var(--space-2)" }}
                          >
                            {claim.claimType}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
