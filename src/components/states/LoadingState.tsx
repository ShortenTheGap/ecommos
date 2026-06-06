/**
 * Generic loading-state, reused by every module. Renders a small set of
 * shimmer skeleton bars in the Paper & Ink style, with an accessible label.
 * Token styling only.
 */

interface LoadingStateProps {
  /** Accessible label / fallback text. Defaults to "Loading…". */
  label?: string;
  /** Number of skeleton rows to render. Defaults to 3. */
  rows?: number;
}

export function LoadingState({ label = "Loading…", rows = 3 }: LoadingStateProps) {
  const count = Math.max(1, rows);

  return (
    <div className="state-block" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="state-skeleton" aria-hidden="true">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="state-skeleton__bar"
            style={{ width: `${100 - i * 12}%` }}
          />
        ))}
      </div>
    </div>
  );
}
