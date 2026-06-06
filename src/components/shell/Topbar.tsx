/**
 * Sticky translucent paper top bar for the app shell — DEMO MODE.
 *
 * Server component. Renders the org name (underlined with a 2px solid yellow
 * border-bottom per the design system "company name" persona-bar rule) and a
 * small muted "Demo" chip. There is no user/email or sign-out control — the app
 * runs as a no-auth public demo.
 */

interface TopbarProps {
  orgName: string;
}

export function Topbar({ orgName }: TopbarProps) {
  return (
    <header className="shell-topbar">
      <div className="shell-topbar__inner bento">
        <span className="shell-topbar__org">{orgName}</span>

        <div className="shell-topbar__right">
          <span className="shell-topbar__email" title="Public demo — no sign-in">
            Demo
          </span>
        </div>
      </div>
    </header>
  );
}
