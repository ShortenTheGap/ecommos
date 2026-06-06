import { HTMLAttributes } from "react";

interface GridProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Optional column span for children laid out inside the grid.
   * Applied as a style override on the grid wrapper itself — use
   * `colSpan` on individual Card elements via className (e.g. `[grid-column:span_8]`)
   * or pass a CSS `style` override.  This prop is a convenience for
   * the common case where the whole grid runs a non-12 column track.
   * Example: cols={3} → grid-template-columns: repeat(3, 1fr)
   */
  cols?: number;
  className?: string;
  children: React.ReactNode;
}

export function Grid({ cols, className = "", children, style, ...rest }: GridProps) {
  const colStyle = cols ? { gridTemplateColumns: `repeat(${cols}, 1fr)` } : undefined;
  return (
    <div
      className={`bento-grid${className ? ` ${className}` : ""}`}
      style={colStyle ? { ...colStyle, ...style } : style}
      {...rest}
    >
      {children}
    </div>
  );
}
