"use client";

/**
 * Scenario Planner — client component.
 *
 * Receives the raw orders + linesByOrderId from the server component and lets
 * the operator explore three levers:
 *   - Discount %   (0–50%)
 *   - Free-ship threshold ($)
 *   - Added ad spend ($)
 *
 * All math is computed client-side by the pure `scenarioMargin` function
 * (safe to import here — no IO, no env). No server round-trips.
 */

import { useState, useMemo } from "react";

import {
  scenarioMargin,
} from "@/lib/domain/margin";
import type { Order, OrderLine } from "@/lib/types";
import { formatCurrency, formatPercent, EM_DASH } from "@/lib/format";

// =============================================================================
// Props
// =============================================================================

interface ScenarioPlannerProps {
  orders: Order[];
  linesByOrderId: Record<string, OrderLine[]>;
  /** Baseline total revenue (computed server-side, avoids re-deriving). */
  baselineRevenue: number;
  /** Baseline contribution margin (computed server-side). */
  baselineCm: number;
}

// =============================================================================
// Helpers
// =============================================================================

function DeltaBadge({ delta }: { delta: number }) {
  if (!Number.isFinite(delta)) return <span className="sp-delta sp-delta--neutral">{EM_DASH}</span>;
  const positive = delta >= 0;
  return (
    <span className={`sp-delta ${positive ? "sp-delta--positive" : "sp-delta--negative"}`}>
      {positive ? "+" : ""}
      {formatCurrency(delta)}
    </span>
  );
}

// =============================================================================
// Component
// =============================================================================

export default function ScenarioPlanner({
  orders,
  linesByOrderId,
  baselineRevenue,
  baselineCm,
}: ScenarioPlannerProps) {
  const [discountPct, setDiscountPct] = useState(0);
  const [freeShipThreshold, setFreeShipThreshold] = useState(0);
  const [addedAdSpend, setAddedAdSpend] = useState(0);

  const scenario = useMemo(
    () =>
      scenarioMargin(orders, linesByOrderId, {
        discountPct: discountPct / 100,
        freeShipThreshold: freeShipThreshold > 0 ? freeShipThreshold : undefined,
        addedAdSpend,
      }),
    [orders, linesByOrderId, discountPct, freeShipThreshold, addedAdSpend],
  );

  const cmDelta = scenario.totalContributionMargin - baselineCm;
  const revDelta = scenario.totalRevenue - baselineRevenue;
  const blendedCmPct =
    scenario.totalRevenue > 0
      ? scenario.totalContributionMargin / scenario.totalRevenue
      : null;

  return (
    <div className="sp-root">
      {/* ── Controls ── */}
      <div className="sp-controls">
        {/* Discount % */}
        <div className="sp-field">
          <label className="sp-label" htmlFor="sp-discount">
            Discount
            <span className="sp-label-value">{discountPct}%</span>
          </label>
          <div className="sp-slider-row">
            <input
              id="sp-discount"
              type="range"
              min={0}
              max={50}
              step={1}
              value={discountPct}
              onChange={(e) => setDiscountPct(Number(e.target.value))}
              className="sp-slider"
              aria-label="Discount percentage"
            />
            <input
              type="number"
              min={0}
              max={50}
              step={1}
              value={discountPct}
              onChange={(e) =>
                setDiscountPct(Math.min(50, Math.max(0, Number(e.target.value))))
              }
              className="sp-number"
              aria-label="Discount percentage input"
            />
          </div>
        </div>

        {/* Free-ship threshold */}
        <div className="sp-field">
          <label className="sp-label" htmlFor="sp-freeship">
            Free-ship threshold
            <span className="sp-label-hint">(brand absorbs cost above $)</span>
          </label>
          <div className="sp-input-row">
            <span className="sp-prefix">$</span>
            <input
              id="sp-freeship"
              type="number"
              min={0}
              step={5}
              value={freeShipThreshold}
              onChange={(e) => setFreeShipThreshold(Math.max(0, Number(e.target.value)))}
              className="sp-text-input"
              aria-label="Free shipping threshold in dollars"
            />
          </div>
        </div>

        {/* Added ad spend */}
        <div className="sp-field">
          <label className="sp-label" htmlFor="sp-adspend">
            Added ad spend
          </label>
          <div className="sp-input-row">
            <span className="sp-prefix">$</span>
            <input
              id="sp-adspend"
              type="number"
              min={0}
              step={100}
              value={addedAdSpend}
              onChange={(e) => setAddedAdSpend(Math.max(0, Number(e.target.value)))}
              className="sp-text-input"
              aria-label="Additional ad spend in dollars"
            />
          </div>
        </div>
      </div>

      {/* ── Results ── */}
      <div className="sp-results">
        <div className="sp-result-item">
          <span className="sp-result-label">Scenario revenue</span>
          <div className="sp-result-value-row">
            <span className="sp-result-value">{formatCurrency(scenario.totalRevenue)}</span>
            <DeltaBadge delta={revDelta} />
          </div>
        </div>

        <div className="sp-result-item sp-result-item--highlight">
          <span className="sp-result-label">Scenario contribution margin</span>
          <div className="sp-result-value-row">
            <span className="sp-result-value">
              {formatCurrency(scenario.totalContributionMargin)}
            </span>
            <DeltaBadge delta={cmDelta} />
          </div>
          {blendedCmPct !== null && (
            <span className="sp-result-pct">
              {formatPercent(blendedCmPct, 1)} of revenue
            </span>
          )}
        </div>

        <div className="sp-result-item">
          <span className="sp-result-label">Baseline contribution margin</span>
          <span className="sp-result-value">{formatCurrency(baselineCm)}</span>
        </div>
      </div>
    </div>
  );
}
