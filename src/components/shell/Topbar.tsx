/**
 * Sticky translucent paper top bar for the authenticated app shell.
 *
 * Server component — it only renders static identity (org name + user email)
 * and the sign-out control (which is its own client island). Per the design
 * system the org name is underlined with a 2px solid yellow border-bottom
 * (the "company name" persona-bar rule).
 */

import { SignOutButton } from "./SignOutButton";

interface TopbarProps {
  orgName: string;
  userEmail: string;
}

export function Topbar({ orgName, userEmail }: TopbarProps) {
  return (
    <header className="shell-topbar">
      <div className="shell-topbar__inner bento">
        <span className="shell-topbar__org">{orgName}</span>

        <div className="shell-topbar__right">
          <span className="shell-topbar__email" title={userEmail}>
            {userEmail}
          </span>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
