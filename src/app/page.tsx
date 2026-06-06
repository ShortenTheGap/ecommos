/**
 * Root route — DEMO MODE.
 *
 * The app opens straight into the operating cockpit. There is no marketing /
 * showcase landing page and no login gate.
 */

import { redirect } from "next/navigation";

export default function Home() {
  redirect("/cockpit");
}
