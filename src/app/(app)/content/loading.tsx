/**
 * Content & Campaign Engine loading UI — shown while loadContent resolves.
 */

import { LoadingState } from "@/components/states";

export default function ContentLoading() {
  return (
    <section style={{ marginTop: "var(--space-8)" }}>
      <LoadingState label="Loading content &amp; campaigns…" rows={6} />
    </section>
  );
}
