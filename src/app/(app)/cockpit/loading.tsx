/**
 * Cockpit loading UI — shown while `loadCockpit` resolves on the server.
 * Reuses the shared LoadingState skeleton (Paper & Ink, token styling only).
 */

import { LoadingState } from "@/components/states";

export default function CockpitLoading() {
  return (
    <section style={{ marginTop: "var(--space-8)" }}>
      <LoadingState label="Loading your cockpit…" rows={4} />
    </section>
  );
}
