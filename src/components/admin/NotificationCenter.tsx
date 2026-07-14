"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { OperationalAlerts } from "./OperationalAlerts";
import { NotificationEvents } from "./NotificationEvents";
import type { AdminAlert, AlertPriority, EventNotification } from "@/services/notificationCenterService";

interface ResolvedItem { id: string; label: string; orderNumber: string | null; at: string }

const PRIO_FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "critical", label: "🔴 Critical" },
  { key: "high", label: "🟠 High" },
  { key: "medium", label: "🟡 Medium" },
  { key: "info", label: "🔵 Info" },
];

const resolvedAgo = (iso: string) => { const h = (Date.now() - new Date(iso).getTime()) / 3.6e6; return h < 1 ? "just now" : `${Math.floor(h)}h ago`; };

/**
 * Notification center shell (review points 12, 13, 17, 18). Adds filter tabs + search over
 * the enriched operational alerts and events, an Open/History split, and LIVE updates:
 * a Supabase realtime channel on the source tables plus a 30s poll fallback, so a new failure
 * appears — and a resolved one disappears — without a manual refresh.
 */
export function NotificationCenter({ operational, events, resolved }: { operational: AdminAlert[]; events: EventNotification[]; resolved: ResolvedItem[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<"open" | "history">("open");
  const [prio, setPrio] = useState("all");
  const [query, setQuery] = useState("");

  // Live updates — realtime channel (best-effort) + poll fallback (review point 18).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("admin-notifications");
    for (const table of ["admin_notifications", "refunds", "payment_attempts", "shipments", "notification_state"]) {
      channel.on("postgres_changes" as never, { event: "*", schema: "public", table } as never, () => router.refresh());
    }
    channel.subscribe();
    const poll = setInterval(() => router.refresh(), 30_000);
    return () => { void supabase.removeChannel(channel); clearInterval(poll); };
  }, [router]);

  const q = query.trim().toLowerCase();
  const matchItem = (t: { primary: string; secondary?: string; meta?: string }) =>
    !q || [t.primary, t.secondary, t.meta].some((v) => (v ?? "").toLowerCase().includes(q));

  const filteredOps = useMemo(() => {
    return operational
      .filter((a) => prio === "all" || a.priority === (prio as AlertPriority))
      .map((a) => (q ? { ...a, items: a.items.filter(matchItem) } : a))
      .filter((a) => !q || a.title.toLowerCase().includes(q) || a.items.length > 0);
  }, [operational, prio, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const unreadEvents = useMemo(() => events.filter((e) => !e.readAt && (!q || `${e.title} ${e.body ?? ""}`.toLowerCase().includes(q))), [events, q]);
  const readEvents = useMemo(() => events.filter((e) => e.readAt && (!q || `${e.title} ${e.body ?? ""}`.toLowerCase().includes(q))), [events, q]);
  const showOps = prio !== "events" && (tab === "open");

  return (
    <div>
      {/* Tabs + search */}
      <div className="nc-bar">
        <div className="nc-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "open"} className="nc-tab" data-on={tab === "open" ? "1" : undefined} onClick={() => setTab("open")}>Open</button>
          <button type="button" role="tab" aria-selected={tab === "history"} className="nc-tab" data-on={tab === "history" ? "1" : undefined} onClick={() => setTab("history")}>History</button>
        </div>
        <input className="nc-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search order, customer, reason…" aria-label="Search notifications" />
      </div>

      {tab === "open" ? (
        <>
          <div className="nc-filters">
            {PRIO_FILTERS.map((f) => (
              <button key={f.key} type="button" className="nc-chip" data-on={prio === f.key ? "1" : undefined} onClick={() => setPrio(f.key)}>{f.label}</button>
            ))}
          </div>

          <section className="ash-metrics">
            <div className="ash-activity__head"><h2 className="ash-jump__title">Open operational alerts</h2><span className="admin__muted">live · clears when resolved</span></div>
            {showOps ? <OperationalAlerts alerts={filteredOps} /> : null}
          </section>

          <section className="ash-metrics">
            <div className="ash-activity__head"><h2 className="ash-jump__title">Recent events</h2><span className="admin__muted">{unreadEvents.length} unread</span></div>
            <NotificationEvents events={unreadEvents} />
          </section>
        </>
      ) : (
        <>
          {resolved.length ? (
            <section className="ash-metrics">
              <div className="ash-activity__head"><h2 className="ash-jump__title">Resolved today</h2><span className="admin__muted">{resolved.length}</span></div>
              <ul className="op-resolved">
                {resolved.filter((r) => !q || `${r.label} ${r.orderNumber ?? ""}`.toLowerCase().includes(q)).map((r) => (
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
