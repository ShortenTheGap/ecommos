/**
 * Vendor detail loading UI — shown while the vendor detail loads on the server.
 */

import { LoadingState } from "@/components/states";

export default function VendorDetailLoading() {
  return (
    <section style={{ marginTop: "var(--space-8)" }}>
      <LoadingState label="Loading vendor details…" rows={6} />
    </section>
  );
}
