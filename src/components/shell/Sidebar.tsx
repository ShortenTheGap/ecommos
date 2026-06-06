"use client";

/**
 * Left navigation sidebar for the authenticated app shell.
 *
 * Client component so it can read the active route via usePathname and apply
 * the accent "pill" treatment to the current section. On narrow viewports the
 * same list collapses to a horizontal scrollable strip (driven by CSS in the
 * layout), so this component stays purely about links + active state.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_ITEMS } from "./nav";

function isActive(pathname: string, href: string): boolean {
  // Exact match, or a nested route under the section (e.g. /products/123).
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="shell-nav">
      <ul className="shell-nav__list">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`shell-nav__link${active ? " shell-nav__link--active" : ""}`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
