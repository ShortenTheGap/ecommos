/**
 * Generic error-state, reused by every module. Shows a message and an optional
 * retry affordance. Keep copy reassuring and actionable. Token styling only.
 */

import type { ReactNode } from "react";

interface ErrorStateProps {
  /** Headline. Defaults to "Something went wrong". */
  title?: string;
  /** User-facing explanation of what failed. */
  message: string;
  /** Optional retry node (button, link). */
  action?: ReactNode;
  /** Short hint shown when no action node is provided. */
  retryHint?: string;
}

export function ErrorState({
  title = "Something went wrong",
  message,
  action,
  retryHint = "Try refreshing the page.",
}: ErrorStateProps) {
  return (
    <div className="state-block state-block--error" role="alert">
      <div className="state-block__icon state-block__icon--error" aria-hidden="true">
        !
      </div>
      <p className="state-block__label">{title}</p>
      <p className="state-block__desc">{message}</p>
      {action ? (
        <div className="state-block__action">{action}</div>
      ) : (
        <p className="state-block__hint">{retryHint}</p>
      )}
    </div>
  );
}
