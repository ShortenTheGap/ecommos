/**
 * Canonical navigation route list for the authenticated app shell.
 * Shared between the desktop sidebar and the mobile top-strip so the two
 * never drift. Order here is the order shown to the user.
 */

export interface NavItem {
  href: string;
  label: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/cockpit", label: "Cockpit" },
  { href: "/products", label: "Products" },
  { href: "/margin", label: "Margin" },
  { href: "/content", label: "Content" },
  { href: "/inventory", label: "Inventory" },
  { href: "/vendors", label: "Vendors" },
  { href: "/ai", label: "AI Workspace" },
] as const;
