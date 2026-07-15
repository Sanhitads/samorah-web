"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { OperationalAlerts } from "./OperationalAlerts";
import { NotificationEvents } from "./NotificationEvents";
import type { AdminAlert, AlertPriority, EventNotification } from "@/services/notificationCenterService";

interface ResolvedItem { id: string; label: string; orderNumber: string | null; at: string }

type FilterKind = "all" | "prio" | "type" | "class" | "time" | "state";
interface Filter { key: string; label: string; kind: FilterKind; prio?: AlertPriority; match?: (a: AdminAlert) => boolean; days?: number }

const FILTERS: Filter[] = [
  { key: "all", label: "All", kind: "all" },
  { key: "critical", label: "🔴 Critical", kind: "prio", prio: "critical" },
  { key: "high", label: "🟠 High", kind: "prio", prio: "high" },
  { key: "medium", label: "🟡 Medium", kind: "prio", prio: "medium" },
  { key: "operational", label: "Operational", kind: "class" },
  { key: "events", label: "Events", kind: "class" },
  { key: "refunds", label: "Refunds", kind: "type", match: (a) => a.key.includes("refund") },
  { key: "payments", label: "Payments", kind: "type", match: (a) => a.key.includes("payment") },
  { key: "shipments", label: "Shipments", kind: "type", match: (a) => a.key.includes("shipment") },
  { key: "inventory", label: "Inventory", kind: "type", match: (a) => a.key === "low_stock" },
  { key: "mine", label: "Assigned to me", kind: "state" },
  { key: "unassigned", label: "Unassigned", kind: "state" },
  { key: "acknowledged", label: "Acknowledged", kind: "state" },
  { key: "snoozed", label: "Snoozed", kind: "state" },
  { key: "today", label: "Today", kind: "time", days: 1 },
  { key: "week", label: "This week", kind: "time", days: 7 },
];

const resolvedAgo = (iso: string) => { const h = (Date.now() - new Date(iso).getTime()) / 3.6e6; return h < 1 ? "just now" : `${Math.floor(h)}h ago`; };

/**
 * Notification center shell (review points 5, 12, 13, 17, 18). Filter tabs (priority / type /
 * class / time) + search over the enriched operational alerts and events, an Open/History split,
 * and LIVE updates (Supabase realtime channel + 30s poll fallback).
 */
export function NotificationCenter({ operational, events, resolved, staffName }: { operational: AdminAlert[]; events: EventNotification[]; resolved: ResolvedItem[]; staffName?: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<"open" | "history">("open");
  const [filterKey, setFilterKey] = useState("all");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Live updates (review point 3): the 30s poll runs INDEPENDENTLY of the realtime channel, so
  // if realtime drops, refreshes continue. We also watch the channel status and poll FASTER
  // (10s) while it's disconnected, then relax once it reconnects — so a dropped socket degrades
  // gracefully instead of going stale.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("admin-notifications");
    for (const table of ["admin_notifications", "refunds", "payment_attempts", "shipments", "notification_state"]) {
      channel.on("postgres_changes" as never, { event: "*", schema: "public", table } as never, () => router.refresh());
    }
    let live = false;
    let poll = setInterval(() => router.refresh(), 30_000);
    const setPoll = (ms: number) => { clearInterval(poll); poll = setInterval(() => router.refresh(), ms); };
    channel.subscribe((status) => {
      const connected = status === "SUBSCRIBED";
      if (connected !== live) { live = connected; setPoll(connected ? 30_000 : 10_000); }
    });
    return () => { void supabase.removeChannel(channel); clearInterval(poll); };
  }, [router]);

  // "/" focuses search (review point 8.2) — unless already typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      e.preventDefault(); searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filter = FILTERS.find((f) => f.key === filterKey) ?? FILTERS[0];
  const q = query.trim().toLowerCase();
  const matchText = (...parts: (string | undefined | null)[]) => !q || parts.some((v) => (v ?? "").toLowerCase().includes(q));
  const withinDays = (iso: string | null, days?: number) => !days || (iso ? Date.now() - new Date(iso).getTime() <= days * 86400000 : false);

  const showOps = tab === "open" && filter.kind !== "class" || filter.key === "operational";
  const showEvents = filter.kind === "all" || filter.key === "events";

  const filteredOps = useMemo(() => {
    if (!showOps) return [];
    return operational
      .filter((a) => (filter.kind === "prio" ? a.priority === filter.prio : true))
      .filter((a) => (filter.kind === "type" && filter.match ? filter.match(a) : true))
      .map((a) => {
        // Snooze visibility: hide snoozed items unless the "Snoozed" filter is active.
        let items = filter.key === "snoozed" ? a.items.filter((i) => i.isSnoozed) : a.items.filter((i) => !i.isSnoozed);
        if (filter.kind === "state") {
          if (filter.key === "mine") items = items.filter((i) => i.assigneeName && i.assigneeName === staffName);
          else if (filter.key === "unassigned") items = items.filter((i) => !i.assigneeName);
          else if (filter.key === "acknowledged") items = items.filter((i) => i.state === "acknowledged");
        }
        if (q) items = items.filter((it) => matchText(it.primary, it.secondary, it.meta, it.subsystem, it.notId));
        if (filter.kind === "time") items = items.filter((it) => withinDays(it.at, filter.days));
        return { ...a, items };
      })
      .filter((a) => (q || filter.kind === "time" || filter.kind === "state" ? a.items.length > 0 : true));
  }, [operational, filter, q, showOps, staffName]); // eslint-disable-line react-hooks/exhaustive-deps

  const unreadEvents = useMemo(() => events.filter((e) => !e.readAt && matchText(e.title, e.body) && (filter.kind !== "time" || withinDays(e.createdAt, filter.days))), [events, q, filter]); // eslint-disable-line react-hooks/exhaustive-deps
  const readEvents = useMemo(() => events.filter((e) => e.readAt && matchText(e.title, e.body)), [events, q]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="nc-bar">
        <div className="nc-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "open"} className="nc-tab" data-on={tab === "open" ? "1" : undefined} onClick={() => setTab("open")}>Open</button>
          <button type="button" role="tab" aria-selected={tab === "history"} className="nc-tab" data-on={tab === "history" ? "1" : undefined} onClick={() => setTab("history")}>History</button>
        </div>
        <input ref={searchRef} className="nc-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search order, customer, SKU, subsystem (razorpay…), NOT-id…  ( / )" aria-label="Search notifications" />
      </div>

      {tab === "open" ? (
        <>
          <div className="nc-filters">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" className="nc-chip" data-on={filterKey === f.key ? "1" : undefined} onClick={() => setFilterKey(f.key)}>{f.label}</button>
            ))}
          </div>

          {showOps ? (
            <section className="ash-metrics">
              <div className="ash-activity__head"><h2 className="ash-jump__title">Open operational alerts</h2><span className="admin__muted">live · clears when resolved</span></div>
              <OperationalAlerts alerts={filteredOps} />
            </section>
          ) : null}

          {showEvents ? (
            <section className="ash-metrics">
              <div className="ash-activity__head"><h2 className="ash-jump__title">Recent events</h2><span className="admin__muted">{unreadEvents.length} unread</span></div>
              <NotificationEvents events={unreadEvents} />
            </section>
          ) : null}
        </>
      ) : (
        <>
          {resolved.length ? (
            <section className="ash-metrics">
              <div className="ash-activity__head"><h2 className="ash-jump__title">Resolved today</h2><span className="admin__muted">{resolved.length}</span></div>
              <ul className="op-resolved">
                {resolved.filter((r) => matchText(r.label, r.orderNumber)).map((r) => (
                  <li key={r.id} className="op-resolved__item">
                    <span className="op-resolved__check">✓</span>
                    <span>{r.label}{r.orderNumber ? <> · <Link href={`/admin/orders/${r.orderNumber}`} className="admin__mono">{r.orderNumber}</Link></> : null}</span>
                    <span className="admin__muted">{resolvedAgo(r.at)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : <p className="admin__muted" style={{ marginTop: 12 }}>No resolutions recorded today.</p>}

          <section className="ash-metrics">
            <div className="ash-activity__head"><h2 className="ash-jump__title">Past events</h2><span className="admin__muted">read</span></div>
            {readEvents.length ? <NotificationEvents events={readEvents} /> : <p className="admin__muted">No past events.</p>}
          </section>
        </>
      )}
    </div>
  );
}
