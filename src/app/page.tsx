/**
 * TEMPORARY SHOWCASE PAGE — replaced by the app shell in a later module.
 * Purpose: eyeball-verify that the Paper & Ink Bento design tokens,
 * fonts (Sora + Manrope), and primitive components render correctly.
 */

import { Card, Grid, Eyebrow, Kpi, Button } from "@/components/bento";

export default function ShowcasePage() {
  return (
    <main className="bento" style={{ paddingTop: "var(--space-12)", paddingBottom: "var(--space-12)" }}>
      {/* Page header */}
      <div style={{ marginBottom: "var(--space-10)" }}>
        <Eyebrow>Design System Preview</Eyebrow>
        <h1 style={{ fontSize: "var(--text-2xl)", marginTop: "var(--space-4)" }}>
          NourishOS — Paper &amp; Ink Bento
        </h1>
        <p style={{ color: "var(--text-muted)", marginTop: "var(--space-3)", maxWidth: "60ch" }}>
          This temporary page validates the full token set, font loading, and bento
          primitives before the real app shell replaces it.
        </p>
      </div>

      {/* Hero row: 8-col text + 4-col stack (one ink + one accent) */}
      <Grid>
        {/* Text card — default paper, spans 8 cols */}
        <Card style={{ gridColumn: "span 8" }}>
          <Eyebrow dot={false}>Bento Card — Default</Eyebrow>
          <h2 style={{ fontSize: "var(--text-xl)", marginTop: "var(--space-4)" }}>
            The warm paper surface
          </h2>
          <p style={{ color: "var(--text-muted)", marginTop: "var(--space-3)" }}>
            This is a default <code>.bento-card</code> on the <code>--surface-2</code> fill.
            Body copy uses Manrope at 1.65 line-height. The heading above uses Sora 700
            at -0.02em letter-spacing.
          </p>
          <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-6)" }}>
            <Button variant="primary">Primary CTA</Button>
            <Button variant="ghost">Ghost Button</Button>
          </div>
        </Card>

        {/* Right column stack — spans 4 cols */}
        <div style={{ gridColumn: "span 4", display: "flex", flexDirection: "column", gap: "clamp(14px, 1.6vw, 22px)" }}>
          {/* Ink anchor — ONE per hero row */}
          <Card variant="ink">
            <Eyebrow dot={false}>Ink Anchor</Eyebrow>
            <h3 style={{ fontSize: "var(--text-lg)", marginTop: "var(--space-3)", color: "#f4f2ec" }}>
              Dark card
            </h3>
            <p style={{ color: "rgba(244,242,236,0.65)", fontSize: "var(--text-sm)", marginTop: "var(--space-2)" }}>
              One per row max. Yellow bottom border ties to the accent system.
            </p>
          </Card>

          {/* Accent card — ONE per row */}
          <Card variant="accent">
            <Eyebrow>Accent card</Eyebrow>
            <p style={{ color: "var(--text)", fontSize: "var(--text-sm)", marginTop: "var(--space-2)" }}>
              Soft yellow wash. Draws the eye to the next action.
            </p>
          </Card>
        </div>
      </Grid>

      {/* KPI row */}
      <section style={{ marginTop: "clamp(48px, 8vw, 96px)" }}>
        <Eyebrow>KPI Components</Eyebrow>
        <h2 style={{ fontSize: "var(--text-xl)", marginTop: "var(--space-4)", marginBottom: "var(--space-6)" }}>
          Stat cards
        </h2>
        <Grid cols={4}>
          <Kpi
            label="Calories today"
            value="1,840"
            delta="+120 kcal"
            caption="vs. 1,720 goal"
          />
          <Kpi
            label="Protein"
            value="94g"
            delta="-6g"
            caption="Goal: 100g"
          />
          <Kpi
            label="Streak"
            value="12"
            delta="+1"
            caption="days logged"
            variant="soft"
          />
          <Kpi
            label="Hydration"
            value="2.1L"
            delta="+0.3L"
            caption="Goal: 2.5L"
          />
        </Grid>
      </section>

      {/* Soft card row */}
      <section style={{ marginTop: "clamp(48px, 8vw, 96px)" }}>
        <Eyebrow>Card Variants</Eyebrow>
        <h2 style={{ fontSize: "var(--text-xl)", marginTop: "var(--space-4)", marginBottom: "var(--space-6)" }}>
          All four variants
        </h2>
        <Grid cols={4}>
          <Card>
            <p style={{ fontWeight: 600, marginBottom: "var(--space-2)" }}>Default</p>
            <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
              White surface-2 fill.
            </p>
          </Card>
          <Card variant="soft">
            <p style={{ fontWeight: 600, marginBottom: "var(--space-2)" }}>Soft</p>
            <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
              Warm surface fill.
            </p>
          </Card>
          <Card variant="ink">
            <p style={{ fontWeight: 600, marginBottom: "var(--space-2)", color: "#f4f2ec" }}>Ink</p>
            <p style={{ color: "rgba(244,242,236,0.65)", fontSize: "var(--text-sm)" }}>
              Dark anchor card.
            </p>
          </Card>
          <Card variant="accent">
            <p style={{ fontWeight: 600, marginBottom: "var(--space-2)" }}>Accent</p>
            <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
              Yellow-wash highlight.
            </p>
          </Card>
        </Grid>
      </section>

      {/* Typography specimen */}
      <section style={{ marginTop: "clamp(48px, 8vw, 96px)" }}>
        <Eyebrow>Typography</Eyebrow>
        <Card style={{ marginTop: "var(--space-6)" }}>
          <h1 style={{ fontSize: "var(--text-3xl)" }}>Heading 1 — Sora 700</h1>
          <h2 style={{ fontSize: "var(--text-2xl)", marginTop: "var(--space-4)" }}>Heading 2 — Sora 700</h2>
          <h3 style={{ fontSize: "var(--text-xl)", marginTop: "var(--space-4)" }}>Heading 3 — Sora 700</h3>
          <p style={{ fontSize: "var(--text-base)", marginTop: "var(--space-4)", color: "var(--text-muted)", maxWidth: "72ch" }}>
            Body copy — Manrope 400. The quick brown fox jumps over the lazy dog.
            Line-height 1.65, max-width 72ch for comfortable reading.
          </p>
          <p style={{ fontSize: "var(--text-sm)", marginTop: "var(--space-3)", color: "var(--text-faint)" }}>
            Small / faint — used for captions, timestamps, helper text.
          </p>
        </Card>
      </section>
    </main>
  );
}
