/**
 * Products list loading UI — shown while `loadProducts` resolves on the server.
 * Reuses the shared LoadingState skeleton (Paper & Ink, token styling only).
 */

import { LoadingState } from "@/components/states";

export default function ProductsLoading() {
  return (
    <section style={{ marginTop: "var(--space-8)" }}>
      <LoadingState label="Loading your product vault…" rows={4} />
    </section>
  );
}
