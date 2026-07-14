"use client";

import { useState } from "react";
import Link from "next/link";

/** One pre-rendered activity row (server computes href/label/timeAgo to avoid time hydration drift). */
export interface ActivityItem {
  id: string;
  category: "order" | "cms" | "inventory" | "customer" | "refund" | "other";
  label: string;
  detail: string | null;
  href: string;
  orderNumber: string | null;
  timeAgo: string;
}

const ICON: Record<ActivityItem["category"], string> = {
  order: "🟢", cms: "🔵", inventory: "🟠", customer: "🟣", refund: "🔴", other: "⚪",
};

// Inline filters → which categories they include.
const FILTERS: { key: string; label: string; cats: ActivityItem["category"][] | null }[] = [
  { key: "all", label: "All", cats: null },
  { key: "orders", label: "Orders", cats: ["order"] },
  { key: "cms", label: "CMS", cats: ["cms"] },
  { key: "customers", label: "Customers", cats: ["customer"] },
  { key: "payments", label: "Payments", cats: ["refund"] },
  { key: "inventory", label: "Inventory", cats: ["inventory"] },
];

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const [active, setActive] = useState("all");
  const sel = FILTERS.find((f) => f.key === active) ?? FILTERS[0];
  const shown = sel.cats ? items.filter((i) => sel.cats!.includes(i.category)) : items;

  return (
    <div className="ash-feed">
      <div className="ash-feed__filters" role="tablist" aria-label="Filter activity">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            role="tab"
            aria-selected={active === f.key}
            className="ash-feed__chip"
            data-on={active === f.key ? "1" : undefined}
            onClick={() => setActive(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <ol className="ash-feed__list">
        {shown.map((i) => (
          <li key={i.id} className="ash-feed__item">
            <span className="ash-feed__icon" aria-hidden>{ICON[i.category]}</span>
            <Link href={i.href} className="ash-feed__body">
              <span className="ash-feed__label">
                {i.label}
                {i.orderNumber ? <span className="ash-feed__mono"> · {i.orderNumber}</span> : null}
              </span>
              {i.detail ? <span className="ash-feed__detail">{i.detail}</span> : null}
            </Link>
            <span className="ash-feed__time">{i.timeAgo}</span>
          </li>
        ))}
        {shown.length === 0 ? <li className="admin__muted" style={{ padding: "12px 0" }}>Nothing in this view.</li> : null}
      </ol>
    </div>
  );
}
