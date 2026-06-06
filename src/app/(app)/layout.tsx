/**
 * App shell — DEMO MODE (no auth).
 *
 * Every module (Cockpit, Products, Margin, Content, Inventory, Vendors, AI)
 * renders inside this layout. It is an async server component that resolves the
 * seeded demo organization via requireOrg() (service-role, no session) and
 * renders the sticky top bar (org identity + Demo chip) and the left nav.
 *
 * There is no login: requireOrg() always returns the demo org, so there is no
 * redirect path here.
 */

import { requireOrg } from "@/lib/data/org";
import { Topbar } from "@/components/shell/Topbar";
import { Sidebar } from "@/components/shell/Sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { org } = await requireOrg();

  return (
    <div className="shell">
      <Topbar orgName={org.name} />

      <div className="shell-body">
        <Sidebar />
        <main className="shell-main bento" style={{ padding: 0 }}>
          {children}
        </main>
      </div>
    </div>
  );
}
