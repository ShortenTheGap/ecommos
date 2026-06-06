"use client";

/**
 * Sign-out control. Client component: clears the Supabase session in the
 * browser, then hard-navigates to /login (router.refresh ensures server
 * components re-render without the stale session).
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSignOut() {
    startTransition(async () => {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace("/login");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={isPending}
      className="btn-ghost shell-signout"
    >
      {isPending ? "Signing out…" : "Sign out"}
    </button>
  );
}
