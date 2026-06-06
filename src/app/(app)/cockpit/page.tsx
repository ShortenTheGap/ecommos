/**
 * Cockpit — placeholder.
 *
 * This is the default post-login landing route. Real cockpit content (KPIs,
 * recommendations, alerts) is built in Task 3.2. For now it renders the shell
 * header so the navigation is exercisable end-to-end.
 */

import { Eyebrow } from "@/components/bento";

export default function CockpitPage() {
  return (
    <section>
      <Eyebrow>Overview</Eyebrow>
      <h1
        style={{
          fontSize: "var(--text-2xl)",
          marginTop: "var(--space-4)",
        }}
      >
        Cockpit
      </h1>
      <p
        style={{
          color: "var(--text-muted)",
          fontSize: "var(--text-base)",
          marginTop: "var(--space-3)",
          maxWidth: "60ch",
        }}
      >
        Your daily operating view. Metrics, recommendations, and alerts land
        here.
      </p>
    </section>
  );
}
