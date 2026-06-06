"use client";

/**
 * Production Run Planner — lists existing runs and an "Add production run"
 * form wrapping the `createProductionRun` Server Action.
 *
 * Displays:
 *   - batch, lot, quantity, cost, production/expiry dates, unit cost
 *   - MOQ coverage bar (qty vs vendor.moq)
 *   - COGS impact: unit cost vs variant cogs (passed in from the server)
 *
 * Uses useTransition for pending/disabled/error state.
 */

import { useState, useTransition } from "react";

import { Card, Eyebrow, Button } from "@/components/bento";
import { formatCurrency, formatNumber, EM_DASH } from "@/lib/format";
import type { ProductionRunDetail } from "@/lib/data/vendors";
import type { Product } from "@/lib/types";
import { createProductionRun } from "../../actions";

// ─── MOQ coverage bar ────────────────────────────────────────────────────────

function MoqCoverage({
  quantity,
  moq,
}: {
  quantity: number | null;
  moq: number | null;
}) {
  if (quantity == null || moq == null || moq === 0) return null;
  const pct = Math.min((quantity / moq) * 100, 100);
  const covered = quantity >= moq;
  return (
    <div className="run-moq-wrap">
      <div className="run-moq-label">
        <span>MOQ coverage</span>
        <span style={{ color: covered ? "var(--text)" : "var(--text-muted)" }}>
          {formatNumber(quantity)} / {formatNumber(moq)} units
          {covered ? " ✓" : ""}
        </span>
      </div>
      <div className="run-moq-track">
        <div
          className={`run-moq-fill${covered ? "" : " run-moq-fill--under"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── COGS impact ─────────────────────────────────────────────────────────────

function CogsImpact({
  unitCost,
  variantCogs,
}: {
  unitCost: number | null;
  variantCogs: number | null;
}) {
  if (unitCost == null || variantCogs == null) return null;
  const delta = unitCost - variantCogs;
  const isOver = delta > 0;
  return (
    <span
      className={`run-cogs-tag ${isOver ? "run-cogs-tag--over" : "run-cogs-tag--ok"}`}
    >
      Unit cost {formatCurrency(unitCost, "USD", 2)} vs COGS{" "}
      {formatCurrency(variantCogs, "USD", 2)}
      {" — "}
      {isOver
        ? `+${formatCurrency(delta, "USD", 2)} over`
        : `${formatCurrency(Math.abs(delta), "USD", 2)} under`}
    </span>
  );
}

// ─── Run row ─────────────────────────────────────────────────────────────────

function RunRow({
  item,
  variantCogs,
  moq,
}: {
  item: ProductionRunDetail;
  variantCogs: number | null;
  moq: number | null;
}) {
  const { run, productName, unitCost } = item;
  return (
    <div className="run-row">
      <div className="run-row__head">
        <span className="run-row__batch">{run.batch ?? EM_DASH}</span>
        <span className="run-row__lot">Lot {run.lot ?? EM_DASH}</span>
        {productName && (
          <span className="run-row__product">{productName}</span>
        )}
      </div>

      <div className="run-row__meta">
        <span>{formatNumber(run.quantity)} units</span>
        <span className="vendor-card__dot" aria-hidden="true">·</span>
        <span>{run.cost != null ? formatCurrency(run.cost) : EM_DASH} total</span>
        <span className="vendor-card__dot" aria-hidden="true">·</span>
        <span>
          {unitCost != null
            ? `${formatCurrency(unitCost, "USD", 2)}/unit`
            : "Unit cost " + EM_DASH}
        </span>
        {run.production_date && (
          <>
            <span className="vendor-card__dot" aria-hidden="true">·</span>
            <span>Prod {run.production_date.slice(0, 10)}</span>
          </>
        )}
        {run.expiry_date && (
          <>
            <span className="vendor-card__dot" aria-hidden="true">·</span>
            <span>Exp {run.expiry_date.slice(0, 10)}</span>
          </>
        )}
      </div>

      <MoqCoverage quantity={run.quantity} moq={moq} />
      <CogsImpact unitCost={unitCost} variantCogs={variantCogs} />

      {item.lots.length > 0 && (
        <div className="run-lots">
          {item.lots.map((lot) => (
            <span key={lot.id} className="run-lot-chip">
              {lot.sku ?? "?"} — {formatNumber(lot.quantity)} {lot.status ?? ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Add run form ─────────────────────────────────────────────────────────────

function AddRunForm({
  vendorId,
  products,
}: {
  vendorId: string;
  products: Pick<Product, "id" | "name">[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await createProductionRun(formData);
      if (result.ok) {
        setSaved(true);
        setOpen(false);
      } else {
        setError(result.error);
      }
    });
  }

  if (!open) {
    return (
      <div className="vendor-add-bar" style={{ marginTop: "var(--space-4)" }}>
        {saved && (
          <span className="vault-msg vault-msg--ok" role="status">
            Production run added.
          </span>
        )}
        <Button variant="ghost" type="button" onClick={() => setOpen(true)}>
          + Add production run
        </Button>
      </div>
    );
  }

  return (
    <form
      action={handleSubmit}
      className="vault-form"
      style={{ marginTop: "var(--space-4)", paddingTop: "var(--space-4)", borderTop: "1px solid var(--border)" }}
    >
      <input type="hidden" name="vendorId" value={vendorId} />

      <div className="vault-field">
        <label className="vault-label" htmlFor="ar-product">
          Product
        </label>
        <select id="ar-product" name="productId" className="vault-input">
          <option value="">None / not linked</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name ?? "Untitled product"}
            </option>
          ))}
        </select>
      </div>

      <div className="vault-field-row">
        <div className="vault-field">
          <label className="vault-label" htmlFor="ar-batch">
            Batch ID
          </label>
          <input
            id="ar-batch"
            name="batch"
            type="text"
            className="vault-input"
            placeholder="B-2026-05"
          />
        </div>
        <div className="vault-field">
          <label className="vault-label" htmlFor="ar-lot">
            Lot number
          </label>
          <input
            id="ar-lot"
            name="lot"
            type="text"
            className="vault-input"
            placeholder="L250"
          />
        </div>
      </div>

      <div className="vault-field-row">
        <div className="vault-field">
          <label className="vault-label" htmlFor="ar-qty">
            Quantity (units)
          </label>
          <input
            id="ar-qty"
            name="quantity"
            type="number"
            min="1"
            step="1"
            className="vault-input"
            placeholder="2000"
          />
        </div>
        <div className="vault-field">
          <label className="vault-label" htmlFor="ar-cost">
            Total cost ($)
          </label>
          <input
            id="ar-cost"
            name="cost"
            type="number"
            min="0.01"
            step="0.01"
            className="vault-input"
            placeholder="8400.00"
          />
        </div>
      </div>

      <div className="vault-field-row">
        <div className="vault-field">
          <label className="vault-label" htmlFor="ar-prod-date">
            Production date
          </label>
          <input
            id="ar-prod-date"
            name="productionDate"
            type="date"
            className="vault-input"
          />
        </div>
        <div className="vault-field">
          <label className="vault-label" htmlFor="ar-exp-date">
            Expiry date
          </label>
          <input
            id="ar-exp-date"
            name="expiryDate"
            type="date"
            className="vault-input"
          />
        </div>
      </div>

      <div className="vault-form-footer">
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add run"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
        {error && (
          <span className="vault-msg vault-msg--error" role="alert">
            {error}
          </span>
        )}
      </div>
    </form>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function ProductionRunPlanner({
  vendorId,
  runs,
  moq,
  variantCogs,
  products,
}: {
  vendorId: string;
  runs: ProductionRunDetail[];
  moq: number | null;
  /** COGS from the first variant, for COGS impact comparison. */
  variantCogs: number | null;
  products: Pick<Product, "id" | "name">[];
}) {
  return (
    <Card>
      <Eyebrow>Production Runs</Eyebrow>

      {runs.length === 0 ? (
        <p className="vault-empty-note" style={{ marginTop: "var(--space-4)" }}>
          No production runs yet. Add the first one below.
        </p>
      ) : (
        <div className="runs-stack" style={{ marginTop: "var(--space-4)" }}>
          {runs.map((item) => (
            <RunRow
              key={item.run.id}
              item={item}
              variantCogs={variantCogs}
              moq={moq}
            />
          ))}
        </div>
      )}

      <AddRunForm vendorId={vendorId} products={products} />
    </Card>
  );
}
