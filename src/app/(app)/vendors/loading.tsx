/**
 * Vendor Workspace loading UI — shown while `loadVendors` resolves on the
 * server. Reuses the shared LoadingState skeleton (Paper & Ink, token only).
 */

import { LoadingState } from "@/components/states";

export default function VendorsLoading() {
  return (
    <section style={{ marginTop: "var(--space-8)" }}>
      <LoadingState label="Loading vendor workspace…" rows={4} />
    </section>
  );
}
