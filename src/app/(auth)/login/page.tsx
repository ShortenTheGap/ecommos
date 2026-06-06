/**
 * /login — DEMO MODE.
 *
 * The app runs as a no-auth public demo, so there is no sign-in screen. Any
 * stale link to /login simply redirects into the cockpit.
 */

import { redirect } from "next/navigation";

export default function Login() {
  redirect("/cockpit");
}
