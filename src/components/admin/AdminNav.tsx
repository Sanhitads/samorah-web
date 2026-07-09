"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Admin navigation (SLP principle 21) — the persistent module map. Live modules
 * link; not-yet-built ones render muted with a "soon" chip so the shell reflects
 * the full intended surface without dead links. Active item derives from the path.
 */
type NavItem = { label: string; href?: string; icon: string };
type NavGroup = { title: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    title: "Operations",
    items: [
      { label: "Dashboard", href: "/admin", icon: "◆" },
      { label: "Orders", href: "/admin/orders", icon: "▤" },
      { label: "Fulfillment", href: "/admin/fulfillment", icon: "▦" },
      { label: "Returns", href: "/admin/returns", icon: "↩" },
      { label: "Shipments", href: "/admin/shipments", icon: "➜" },
    ],
  },
  {
    title: "Catalog",
    items: [
      { label: "Products", icon: "❧" },
      { label: "Inventory", icon: "▣" },
    ],
  },
  {
    title: "Configuration",
    items: [
      { label: "Warehouses", icon: "⌂" },
      { label: "Packaging", icon: "▧" },
      { label: "Rules", href: "/admin/rules", icon: "≡" },
      { label: "Settings", href: "/admin/settings", icon: "⚙" },
    ],
  },
  {
    title: "Insights",
    items: [{ label: "Analytics", icon: "▲" }],
  },
];

export function AdminNav({ role }: { role: string | null }) {
  const pathname = usePathname();
  const isActive = (href?: string) =>
    href ? (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href)) : false;

  return (
    <nav className="ash-nav" aria-label="Admin">
      <Link href="/admin" className="ash-brand">
        <span className="ash-brand__mark">SAMORAH</span>
        <span className="ash-brand__sub">Operations</span>
      </Link>

      {NAV.map((group) => (
        <div key={group.title} className="ash-group">
          <p className="ash-group__title">{group.title}</p>
          <ul className="ash-list">
            {group.items.map((item) =>
              item.href ? (
                <li key={item.label}>
                  <Link href={item.href} className="ash-item" data-active={isActive(item.href) ? "1" : "0"}>
                    <span className="ash-item__icon" aria-hidden>{item.icon}</span>
                    {item.label}
                  </Link>
                </li>
              ) : (
                <li key={item.label}>
                  <span className="ash-item ash-item--soon" aria-disabled>
                    <span className="ash-item__icon" aria-hidden>{item.icon}</span>
                    {item.label}
                    <span className="ash-soon">soon</span>
                  </span>
                </li>
              ),
            )}
          </ul>
        </div>
      ))}

      {role ? <p className="ash-role">Signed in · {role}</p> : null}
    </nav>
  );
}
