"use client";

import { useEffect, useState } from "react";
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

const PIN_KEY = "samorah_activity_pins";

const PAGE = 8;

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const [active, setActive] = useState("all");
  const [pins, setPins] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);

  // Pinned events (review point 10) — persisted per-browser so important items stay on top.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PIN_KEY);
      if (raw) setPins(new Set(JSON.parse(raw) as string[]));
    } catch { /* ignore */ }
  }, []);
  const togglePin = (id: string) =>
    setPins((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(PIN_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });

  const sel = FILTERS.find((f) => f.key === active) ?? FILTERS[0];
  const filtered = sel.cats ? items.filter((i) => sel.cats!.includes(i.category)) : items;
  // Pinned first (in original order), then the rest.
  const ordered = [...filtered].sort((a, b) => Number(pins.has(b.id)) - Number(pins.has(a.id)));
  const shown = ordered.slice(0, limit); // paginate (review point 12)
  const setFilter = (key: string) => { setActive(key); setLimit(PAGE); };

  return (
    <div className="ash-feed">
      <div className="ash-feed__filters" role="tablist" aria-label="Filter activity">
        {FILTERS.map((f) => (
          <button key={f.key} role="tab" aria-selected={active === f.key} className="ash-feed__chip" data-on={active === f.key ? "1" : undefined} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>
      <ol className="ash-feed__list">
        {shown.map((i) => {
          const pinned = pins.has(i.id);
          return (
            <li key={i.id} className="ash-feed__item" data-pinned={pinned ? "1" : undefined}>
              <span className="ash-feed__icon" aria-hidden>{ICON[i.category]}</span>
              <Link href={i.href} className="ash-feed__body">
                <span className="ash-feed__label">{i.label}{i.orderNumber ? <span className="ash-feed__mono"> · {i.orderNumber}</span> : null}</span>
                {i.detail ? <span className="ash-feed__detail">{i.detail}</span> : null}
              </Link>
              <button type="button" className="ash-feed__pin" data-on={pinned ? "1" : undefined} onClick={() => togglePin(i.id)} title={pinned ? "Unpin" : "Pin"} aria-label={pinned ? "Unpin" : "Pin"}>📌</button>
              <span className="ash-feed__time">{i.timeAgo}</span>
            </li>
          );
        })}
        {shown.length === 0 ? <li className="admin__muted" style={{ padding: "12px 0" }}>Nothing in this view.</li> : null}
      </ol>
      {ordered.length > limit ? (
        <button type="button" className="ash-feed__more" onClick={() => setLimit((n) => n + PAGE)}>
          Show more ({ordered.length - limit})
        </button>
      ) : null}
    </div>
  );
}
