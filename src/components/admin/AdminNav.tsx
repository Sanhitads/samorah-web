"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GlobalSearchBox } from "./GlobalSearchBox";
import { NotificationBadge } from "./NotificationBadge";

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
      { label: "Notifications", href: "/admin/notifications", icon: "🔔" },
      { label: "Incidents", href: "/admin/incidents", icon: "🚨" },
      { label: "Notif. Log", href: "/admin/notifications-log", icon: "📡" },
      { label: "Notif. Analytics", href: "/admin/notification-analytics", icon: "📊" },
      { label: "Orders", href: "/admin/orders", icon: "▤" },
      { label: "Fulfillment", href: "/admin/fulfillment", icon: "▦" },
      { label: "Returns", href: "/admin/returns", icon: "↩" },
      { label: "Shipments", href: "/admin/shipments", icon: "➜" },
      { label: "Customers", href: "/admin/customers", icon: "☺" },
    ],
  },
  {
    title: "Catalog",
    items: [
      { label: "Products", href: "/admin/products", icon: "❧" },
      { label: "Collections", href: "/admin/collections", icon: "❋" },
      { label: "Categories", href: "/admin/categories", icon: "❈" },
      { label: "Coupons", href: "/admin/coupons", icon: "%" },
      { label: "Content", href: "/admin/content", icon: "❡" },
      { label: "Privacy Policy", href: "/admin/content/privacy", icon: "⚖" },
      { label: "Terms & Conditions", href: "/admin/content/terms", icon: "❢" },
      { label: "Returns & Refund Policy", href: "/admin/content/returns-policy", icon: "↩" },
      { label: "Shipping Policy", href: "/admin/content/shipping", icon: "➜" },
      { label: "FAQ", href: "/admin/content/faq", icon: "❓" },
      { label: "Media", href: "/admin/media", icon: "▨" },
      { label: "Navigation", href: "/admin/navigation", icon: "❰" },
      { label: "Homepage", href: "/admin/homepage", icon: "⌗" },
      { label: "Bundle Page", href: "/admin/bundles", icon: "❊" },
      { label: "About", href: "/admin/about", icon: "❦" },
      { label: "Journal", href: "/admin/journal", icon: "✎" },
      { label: "Emails", href: "/admin/emails", icon: "✉" },
      { label: "SEO & Redirects", href: "/admin/seo", icon: "⇥" },
      { label: "Inventory", href: "/admin/inventory", icon: "▣" },
    ],
  },
  {
    title: "Configuration",
    items: [
      { label: "Warehouses", href: "/admin/warehouses", icon: "⌂" },
      { label: "Packaging", href: "/admin/packaging", icon: "▧" },
      { label: "Rules", href: "/admin/rules", icon: "≡" },
      { label: "Settings", href: "/admin/settings", icon: "⚙" },
    ],
  },
  {
    title: "Insights",
    items: [
      { label: "Analytics", href: "/admin/analytics", icon: "▲" },
      { label: "Reports", href: "/admin/reports", icon: "▦" },
      { label: "Activity", href: "/admin/audit", icon: "≋" },
      { label: "Health", href: "/admin/health", icon: "♥" },
    ],
  },
];

export function AdminNav({ role, alertCount = 0 }: { role: string | null; alertCount?: number }) {
  const pathname = usePathname();
  // Match on SEGMENT boundaries, not a raw prefix — otherwise sibling routes that share a prefix
  // (e.g. /admin/notifications-log vs /admin/notifications) would both highlight.
  const isActive = (href?: string) =>
    href ? (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`)) : false;

  return (
    <nav className="ash-nav" aria-label="Admin">
      <Link href="/admin" className="ash-brand">
        <span className="ash-brand__mark">SAMORAH</span>
        <span className="ash-brand__sub">Operations</span>
      </Link>

      <GlobalSearchBox />

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
                    {item.href === "/admin/notifications" && alertCount > 0 ? <span className="ash-alert">{alertCount}</span> : null}
                    {item.href === "/admin/notifications-log" ? <NotificationBadge /> : null}
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
