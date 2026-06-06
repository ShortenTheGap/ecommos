/**
 * AI Workspace loading UI — shown while the server component resolves.
 * Reuses the shared LoadingState skeleton (Paper & Ink, token styling only).
 */

import { LoadingState } from "@/components/states";

export default function AiLoading() {
  return (
    <section style={{ marginTop: "var(--space-8)" }}>
      <LoadingState label="Loading AI workspace…" rows={4} />
    </section>
  );
}
