/**
 * Inventory & Fulfillment Health (Module 5).
 *
 * Async server component that:
 *   1. Resolves the active org via requireOrg().
 *   2. Loads the inventory read model (loadInventory).
 *   3. Renders a KPI row and five bento cards:
 *        - Reorder status table
 *        - Shelf-life aging (near-expiry lot highlighted)
 *        - Fulfillment exceptions feed
 *        - Shipping % by region
 *        - 3PL SLA tracker
 *
 * Design rules: one ink anchor + one accent card per visible row.
 * All domain math lives in the loader; this file only formats + lays out.
 * Tokens only — no raw hex colors.
 */

import type { CSSProperties } from "react";

import { requireOrg } from "@/lib/data/org";
import { createClient } from "@/lib/supabase/server";
import { loadInventory } from "@/lib/data/inventory";
import type {
  InventoryData,
  ReorderRow,
  LotAgingRow,
  FulfillmentExceptionRow,
  ShippingRegionRow,
  ThreeplSlaRow,
} from "@/lib/data/inventory";
import { formatNumber, formatPercent, EM_DASH } from "@/lib/format";
import { Card, Eyebrow, Kpi } from "@/components/bento";
import { EmptyState } from "@/components/states";

// =============================================================================
// Grid span helpers
// =============================================================================

const span3: CSSProperties = { gridColumn: "span 3" };
const span4: CSSProperties = { gridColumn: "span 4" };
const span6: CSSProperties = { gridColumn: "span 6" };
const span7: CSSProperties = { gridColumn: "span 7" };
const span5: CSSProperties = { gridColumn: "span 5" };
const span12: CSSProperties = { gridColumn: "span 12" };

// =============================================================================
// Sub-components
// =============================================================================

function ReorderTable({ rows }: { rows: ReorderRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        label="No variants"
        description="No variant data found for this organization."
      />
    );
  }
  return (
    <div className="inv-table-wrap">
      <table className="inv-table">
        <thead>
          <tr>
            <th>SKU</th>
            <th>On-hand</th>
            <th>Velocity / day</th>
            <th>Days of stock</th>
            <th>Lead time</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.variantId}>
              <td style={{ fontWeight: 600, fontFamily: "var(--font-display)" }}>
                {row.sku}
              </td>
              <td>{formatNumber(row.onHandQty)}</td>
              <td>
                {row.velocityPerDay > 0
                  ? formatNumber(row.velocityPerDay, 1)
                  : <span style={{ color: "var(--text-faint)" }}>No recent sales</span>}
              </td>
              <td>
                {row.daysOfStock !== null
                  ? formatNumber(Math.round(row.daysOfStock))
                  : <span style={{ color: "var(--text-faint)" }}>{EM_DASH}</span>}
              </td>
              <td style={{ color: "var(--text-muted)" }}>
                {row.leadTimeDays}d + {row.safetyStockDays}d safety
              </td>
              <td style={{ textAlign: "right" }}>
                <span
                  className={
                    row.status === "critical"
                      ? "inv-status inv-status--critical"
                      : row.status === "reorder"
                      ? "inv-status inv-status--reorder"
                      : "inv-status inv-status--ok"
                  }
                >
                  {row.status === "critical"
                    ? "Critical"
                    : row.status === "reorder"
                    ? "Reorder"
                    : "OK"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LotAgingTable({ rows }: { rows: LotAgingRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        label="No lots"
        description="No inventory lots found for this organization."
      />
    );
  }
  return (
    <div className="inv-table-wrap">
      <table className="inv-table">
        <thead>
          <tr>
            <th>Lot</th>
            <th>SKU</th>
            <th>Location</th>
            <th>Qty</th>
            <th>Expiry date</th>
            <th>Days to expiry</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((lot) => (
            <tr key={lot.lotId} className={lot.isAtRisk ? "inv-lot-row--at-risk" : undefined}>
              <td style={{ fontWeight: 600, fontFamily: "var(--font-display)" }}>
                {lot.lotLabel}
              </td>
              <td style={{ color: "var(--text-muted)" }}>{lot.sku ?? EM_DASH}</td>
              <td style={{ color: "var(--text-muted)" }}>{lot.location ?? EM_DASH}</td>
              <td>{formatNumber(lot.quantity)}</td>
              <td>
                {lot.expiryDate
                  ? lot.expiryDate.slice(0, 10)
                  : <span style={{ color: "var(--text-faint)" }}>{EM_DASH}</span>}
              </td>
              <td style={{ textAlign: "right" }}>
                {lot.daysToExpiry !== null ? (
                  <span
                    className={lot.isAtRisk ? "inv-lot-expiry--at-risk" : undefined}
                  >
                    {lot.daysToExpiry < 0
                      ? `${Math.abs(lot.daysToExpiry)}d overdue`
                      : `${lot.daysToExpiry}d`}
                  </span>
                ) : (
                  <span style={{ color: "var(--text-faint)" }}>{EM_DASH}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExceptionFeed({ rows }: { rows: FulfillmentExceptionRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        label="No exceptions"
        description="All recent shipments are on-time and undamaged."
      />
    );
  }
  return (
    <div className="inv-exception-list">
      {rows.map((exc) => {
        const isDamaged = exc.damaged;
        const badgeClass =
          exc.reason === "damaged"
            ? "inv-exception-badge inv-exception-badge--damaged"
            : "inv-exception-badge inv-exception-badge--delayed";
        return (
          <div key={exc.eventId} className="inv-exception-item">
            <span
              className={
                isDamaged
                  ? "inv-exception-dot inv-exception-dot--damaged"
                  : "inv-exception-dot"
              }
              aria-hidden="true"
            />
            <div className="inv-exception-body">
              <span className="inv-exception-title">
                {exc.reason === "delayed+damaged"
                  ? "Delayed & Damaged Shipment"
                  : exc.reason === "delayed"
                  ? "Delayed Shipment"
                  : "Damaged Shipment"}
              </span>
              <div className="inv-exception-meta">
                {exc.carrier && <span>Carrier: {exc.carrier}</span>}
                {exc.threepl && <span>3PL: {exc.threepl}</span>}
                {exc.orderId && (
                  <span>Order: {exc.orderId.slice(0, 8)}&hellip;</span>
                )}
                <span>Created: {exc.createdAt.slice(0, 10)}</span>
              </div>
            </div>
            <span className={badgeClass}>
              {exc.reason === "delayed+damaged"
                ? `+${exc.delayDays}d / Damaged`
                : exc.reason === "delayed"
                ? `+${exc.delayDays}d delay`
                : "Damaged"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ShippingRegionTable({ rows }: { rows: ShippingRegionRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        label="No region data"
        description="Orders have no region labels in the current window."
      />
    );
  }
  const sorted = [...rows].sort(
    (a, b) => (b.shippingPct ?? 0) - (a.shippingPct ?? 0),
  );
  return (
    <div className="inv-table-wrap">
      <table className="inv-table">
        <thead>
          <tr>
            <th>Region</th>
            <th>Revenue</th>
            <th>Shipping cost</th>
            <th>Shipping %</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.region}>
              <td style={{ fontWeight: 600 }}>{row.region}</td>
              <td style={{ color: "var(--text-muted)" }}>
                {formatNumber(row.revenue, 0)}
              </td>
              <td style={{ color: "var(--text-muted)" }}>
                {formatNumber(row.shippingCost, 0)}
              </td>
              <td style={{ textAlign: "right" }}>
                {row.shippingPct !== null ? (
                  <span
                    style={
                      row.isHigh
                        ? { color: "var(--accent-strong)", fontWeight: 700 }
                        : undefined
                    }
                  >
                    {formatPercent(row.shippingPct, 1)}
                    {row.isHigh && " ↑"}
                  </span>
                ) : (
                  <span style={{ color: "var(--text-faint)" }}>{EM_DASH}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ThreeplSlaTracker({ rows }: { rows: ThreeplSlaRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        label="No 3PL data"
        description="No fulfillment events with 3PL attribution found."
      />
    );
  }
  return (
    <div className="inv-sla-list">
      {rows.map((row) => {
        const onTimePct = row.onTimeRate !== null ? row.onTimeRate * 100 : 0;
        return (
          <div key={row.threepl} className="inv-sla-item">
            <div className="inv-sla-header">
              <span className="inv-sla-name">{row.threepl}</span>
              <span className="inv-sla-rate">
                {row.onTimeRate !== null
                  ? formatPercent(row.onTimeRate, 1)
                  : EM_DASH}{" "}
                on-time
              </span>
            </div>
            <div
              className="inv-sla-bar-track"
              role="progressbar"
              aria-valuenow={Math.round(onTimePct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${row.threepl} on-time rate`}
            >
              <div
                className="inv-sla-bar-fill"
                style={{ width: `${Math.min(100, onTimePct).toFixed(1)}%` }}
              />
            </div>
            <div className="inv-sla-meta">
              <span>{formatNumber(row.totalEvents)} total events</span>
              <span>{formatNumber(row.onTimeCount)} on-time</span>
              <span>
                {formatNumber(row.damagedCount)} damaged
                {row.damageRate !== null &&
                  row.damagedCount > 0 &&
                  ` (${formatPercent(row.damageRate, 1)})`}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// Page
// =============================================================================

export default async function InventoryPage() {
  const { org } = await requireOrg();
  const supabase = await createClient();
  const data: InventoryData = await loadInventory(supabase, org.id);

  const {
    reorderRows,
    lotAgingRows,
    exceptionRows,
    shippingByRegion,
    threeplSla,
    lotsAtRiskCount,
    minDaysOfStock,
    minDaysOfStockSku,
    fulfillmentExceptionCount,
    avgShippingPct,
  } = data;

  // Empty state: no variants and no lots.
  if (reorderRows.length === 0 && lotAgingRows.length === 0) {
    return (
      <div>
        <section className="inv-section">
          <Eyebrow>Inventory &amp; Fulfillment</Eyebrow>
          <h1 className="inv-title">Inventory &amp; Fulfillment Health</h1>
          <p className="inv-lede">
            Real-time shelf-life aging, reorder urgency, fulfillment exceptions,
            and 3PL SLA tracking — all in one view.
          </p>
        </section>
        <section className="inv-section">
          <EmptyState
            label="No inventory data yet"
            description="Once Ember Goods has inventory lots and variants, this module will show reorder status, shelf-life aging, and fulfillment health."
          />
        </section>
      </div>
    );
  }

  // Accent KPI = lots-at-risk card (if >0), otherwise avg shipping %.
  // Ink anchor = fulfillment exceptions.
  const accentKpi: "lotsAtRisk" | "minDos" | "exceptions" | "shipping" =
    lotsAtRiskCount > 0 ? "lotsAtRisk" : "minDos";

  return (
    <div>
      {/* ── Header ── */}
      <section className="inv-section">
        <div className="inv-head">
          <Eyebrow>Inventory &amp; Fulfillment</Eyebrow>
          <h1 className="inv-title">Inventory &amp; Fulfillment Health</h1>
          <p className="inv-lede">
            Monitor shelf-life aging, reorder urgency, fulfillment exceptions,
            and 3PL SLA performance across all channels. All data is computed
            from your live inventory lots and order history.
          </p>
        </div>
      </section>

      {/* ── KPI row ── */}
      <section className="inv-section">
        <div className="bento-grid">
          {/* Lots at risk — accent when >0 (the "next action" alert) */}
          <div style={span3}>
            <Kpi
              variant={accentKpi === "lotsAtRisk" ? "accent" : "default"}
              label="Lots at risk"
              value={formatNumber(lotsAtRiskCount)}
              caption={
                lotsAtRiskCount > 0
                  ? "Expiring within 30 days — promote or move"
                  : "No lots expiring within 30 days"
              }
            />
          </div>

          {/* Min days of stock — default or accent when no lots-at-risk */}
          <div style={span3}>
            <Kpi
              variant={accentKpi === "minDos" && lotsAtRiskCount === 0 ? "accent" : "default"}
              label="Min days of stock"
              value={
                minDaysOfStock !== null
                  ? `${Math.round(minDaysOfStock)}d`
                  : EM_DASH
              }
              caption={
                minDaysOfStockSku
                  ? `Most urgent: ${minDaysOfStockSku}`
                  : "No variants with recent sales"
              }
            />
          </div>

          {/* Fulfillment exceptions — ink anchor */}
          <div style={span3}>
            <Kpi
              variant="ink"
              label="Fulfillment exceptions"
              value={formatNumber(fulfillmentExceptionCount)}
              caption="Delayed (&gt;3d) or damaged shipments"
            />
          </div>

          {/* Avg shipping % — default */}
          <div style={span3}>
            <Kpi
              variant="default"
              label="Avg shipping % of rev"
              value={
                avgShippingPct !== null
                  ? formatPercent(avgShippingPct, 1)
                  : EM_DASH
              }
              caption={
                avgShippingPct !== null && avgShippingPct > 0.15
                  ? "Above 15% threshold"
                  : "Within healthy range"
              }
            />
          </div>
        </div>
      </section>

      {/* ── Reorder table + Shelf-life aging ── */}
      <section className="inv-section">
        <div className="bento-grid">
          {/* Reorder status — default (wider) */}
          <div style={span7}>
            <Card>
              <h2 className="inv-subhead">Reorder status</h2>
              <ReorderTable rows={reorderRows} />
            </Card>
          </div>

          {/* Shelf-life aging — accent treatment on the card if lots at risk */}
          <div style={span5}>
            <Card variant={lotsAtRiskCount > 0 ? "accent" : "default"}>
              <h2 className="inv-subhead">Shelf-life aging</h2>
              <LotAgingTable rows={lotAgingRows} />
            </Card>
          </div>
        </div>
      </section>

      {/* ── Exceptions feed + Shipping by region ── */}
      <section className="inv-section">
        <div className="bento-grid">
          {/* Fulfillment exceptions feed */}
          <div style={span6}>
            <Card>
              <h2 className="inv-subhead">Fulfillment exceptions</h2>
              <ExceptionFeed rows={exceptionRows} />
            </Card>
          </div>

          {/* Shipping % by region — ink anchor for this row */}
          <div style={span6}>
            <Card variant="ink">
              <h2
                className="inv-subhead"
                style={{ color: "rgba(244,242,236,0.9)" }}
              >
                Shipping cost % by region
              </h2>
              <ShippingRegionTable rows={shippingByRegion} />
            </Card>
          </div>
        </div>
      </section>

      {/* ── 3PL SLA tracker (full-width) ── */}
      <section className="inv-section">
        <div className="bento-grid">
          <div style={span12}>
            <Card variant="soft">
              <h2 className="inv-subhead">3PL SLA tracker</h2>
              <p
                style={{
                  fontSize: "var(--text-sm)",
                  color: "var(--text-muted)",
                  marginBottom: "var(--space-6)",
                  lineHeight: 1.6,
                }}
              >
                On-time delivery rate and damage rate per fulfillment partner.
                On-time = delay ≤ 3 days.
              </p>
              <ThreeplSlaTracker rows={threeplSla} />
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
