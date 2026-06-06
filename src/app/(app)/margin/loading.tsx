/**
 * Margin module loading UI — shown while `loadMargin` resolves on the server.
 */

import { LoadingState } from "@/components/states";

export default function MarginLoading() {
  return (
    <section style={{ marginTop: "var(--space-8)" }}>
      <LoadingState label="Loading margin intelligence…" rows={5} />
    </section>
  );
}
