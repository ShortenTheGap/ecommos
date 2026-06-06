interface EyebrowProps {
  children: React.ReactNode;
  className?: string;
  /** Show the 6px yellow dot before the chip. Defaults to true. */
  dot?: boolean;
}

export function Eyebrow({ children, className = "", dot = true }: EyebrowProps) {
  return (
    <div
      style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}
      className={className}
    >
      {dot && <span className="eyebrow-dot" aria-hidden="true" />}
      <span className="eyebrow-chip">{children}</span>
    </div>
  );
}
