/**
 * Authenticated app shell.
 *
 * Every module (Cockpit, Products, Margin, Content, Inventory, Vendors, AI)
 * renders inside this layout. It is an async server component that:
 *   1. Resolves the current user + active organization (RLS-respecting).
 *   2. Redirects to /login when there is no session/membership.
 *   3. Renders the sticky top bar (org + email + sign-out) and the left nav.
 *
 * The proxy already gates these routes, but we resolve the org here so child
 * pages can rely on a guaranteed-present session and we can show org identity.
 */

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndOrg } from "@/lib/data/org";
import { Topbar } from "@/components/shell/Topbar";
import { Sidebar } from "@/components/shell/Sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const result = await getCurrentUserAndOrg(supabase);

  if (!result) {
    redirect("/login");
  }

  // We still need the email for the top bar; getUser already ran inside
  // getCurrentUserAndOrg, but the email is cheap to re-read from the session.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userEmail = user?.email ?? "";

  return (
    <div className="shell">
      <Topbar orgName={result.org.name} userEmail={userEmail} />

      <div className="shell-body">
        <Sidebar />
        <main className="shell-main bento" style={{ padding: 0 }}>
          {children}
        </main>
      </div>
    </div>
  );
}
