import { Card, CardVariant } from "./Card";

interface KpiProps {
  label: string;
  value: string | number;
  /** e.g. "+12%" or "-3 kcal". Positive values (starting with +) use accent color. */
  delta?: string;
  caption?: string;
  variant?: CardVariant;
  className?: string;
}

function isDeltaPositive(delta: string): boolean {
  return delta.trimStart().startsWith("+");
}

export function Kpi({ label, value, delta, caption, variant = "default", className }: KpiProps) {
  const deltaClass = delta
    ? isDeltaPositive(delta)
      ? "kpi-delta--positive"
      : "kpi-delta--negative"
    : undefined;

  return (
    <Card variant={variant} className={className}>
      <p className="kpi-label">{label}</p>
      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-3)", marginTop: "var(--space-2)" }}>
        <span className="kpi-value">{value}</span>
        {delta && (
          <span className={deltaClass} aria-label={`Change: ${delta}`}>
            {delta}
          </span>
        )}
      </div>
      {caption && <p className="kpi-caption">{caption}</p>}
    </Card>
  );
}
