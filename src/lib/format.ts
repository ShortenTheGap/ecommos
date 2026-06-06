/**
 * Display formatting helpers — pure, locale-aware, null-safe.
 *
 * Reused across every module (Cockpit, Margin, Inventory, …) so number/currency/
 * percent rendering stays consistent. All helpers tolerate null/undefined/NaN and
 * fall back to an em-dash ("—") so the UI never prints "NaN" or "$null".
 *
 * Money convention matches the domain engines: decimal currency units (e.g. USD),
 * NOT cents.
 */

/** The canonical "no value" / "not computable" glyph used across the UI. */
export const EM_DASH = "—";

/** True when a numeric input is usable (not null/undefined/NaN/Infinity). */
function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Format a decimal currency amount, e.g. 1234.5 → "$1,234.50".
 * Returns EM_DASH for null/undefined/NaN.
 *
 * @param value   amount in decimal currency units
 * @param currency ISO 4217 code (default "USD")
 * @param maximumFractionDigits decimals to show (default 0 — whole dollars)
 */
export function formatCurrency(
  value: number | null | undefined,
  currency = "USD",
  maximumFractionDigits = 0,
): string {
  if (!isFiniteNumber(value)) return EM_DASH;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(value);
}

/**
 * Format a fraction (0–1) as a percent, e.g. 0.1234 → "12.3%".
 * Returns EM_DASH for null/undefined/NaN.
 *
 * @param fraction value in the 0–1 range (0.5 = 50%)
 * @param fractionDigits decimals to show (default 1)
 * @param withSign prefix "+" on positive values (useful for deltas)
 */
export function formatPercent(
  fraction: number | null | undefined,
  fractionDigits = 1,
  withSign = false,
): string {
  if (!isFiniteNumber(fraction)) return EM_DASH;
  const formatted = new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(fraction);
  if (withSign && fraction > 0) return `+${formatted}`;
  return formatted;
}

/**
 * Format a plain number with grouping, e.g. 1234 → "1,234".
 * Returns EM_DASH for null/undefined/NaN.
 *
 * @param value the number
 * @param maximumFractionDigits decimals to show (default 0)
 */
export function formatNumber(
  value: number | null | undefined,
  maximumFractionDigits = 0,
): string {
  if (!isFiniteNumber(value)) return EM_DASH;
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(value);
}
