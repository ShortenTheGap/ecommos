/**
 * Generic empty-state, reused by every module. On-brand (Paper & Ink), token
 * styling only. Renders an optional icon/glyph, a label, a description, and an
 * optional action node (e.g. a Button or Link).
 */

import type { ReactNode } from "react";

interface EmptyStateProps {
  /** Optional leading glyph or icon node (defaults to a subtle accent dot). */
  icon?: ReactNode;
  /** Short, bold headline. */
  label: string;
  /** One- or two-line explanation of why this is empty / what to do. */
  description?: string;
  /** Optional CTA node (button, link). */
  action?: ReactNode;
}

export function EmptyState({ icon, label, description, action }: EmptyStateProps) {
  return (
    <div className="state-block" role="status">
      <div className="state-block__icon" aria-hidden="true">
        {icon ?? <span className="eyebrow-dot" style={{ margin: 0 }} />}
      </div>
      <p className="state-block__label">{label}</p>
      {description && <p className="state-block__desc">{description}</p>}
      {action && <div className="state-block__action">{action}</div>}
    </div>
  );
}
