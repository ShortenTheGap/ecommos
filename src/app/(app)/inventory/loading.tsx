/**
 * Inventory & Fulfillment Health module loading UI — shown while
 * `loadInventory` resolves on the server.
 */

import { LoadingState } from "@/components/states";

export default function InventoryLoading() {
  return (
    <section style={{ marginTop: "var(--space-8)" }}>
      <LoadingState label="Loading inventory & fulfillment data…" rows={6} />
    </section>
  );
}
