"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AdminAlert, AlertItem, AlertPriority } from "@/services/notificationCenterService";

const PRIO: Record<AlertPriority, { icon: string; label: string }> = {
  critical: { icon: "🔴", label: "Critical" },
  high: { icon: "🟠", label: "High" },
  medium: { icon: "🟡", label: "Medium" },
  info: { icon: "🔵", label: "Info" },
};
const DISPLAY_CAP = 5; // show the latest 5 per group; the rest via "View all" (review point 1)

function relative(ms: number): string {
  const s = Math.max(0, ms / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function tomorrow9amMinutes(): number {
  const t = new Date(); t.setDate(t.getDate() + 1); t.setHours(9, 0, 0, 0);
  return Math.max(60, Math.round((t.getTime() - Date.now()) / 60000));
}

/**
 * Operational alerts (review points 1-3, 6, 7, 9, 11). Each alert expands to its deduped items
 * (order · customer · amount · reason · occurrences · time) with deep-link Review, inline Retry,
 * Assign/Ack, and Snooze. Groups cap the list at 5 with a "View all" link, and offer bulk
 * "Assign all" / "Retry all". Urgent groups auto-expand.
 */
export function OperationalAlerts({ alerts }: { alerts: AdminAlert[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<Set<string>>(new Set(alerts.filter((a) => a.priority === "critical" || a.priority === "high").map((a) => a.key)));
  const [now, setNow] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [snoozeFor, setSnoozeFor] = useState<string | null>(null);
  useEffect(() => setNow(Date.now()), []);

  const ago = (iso: string | null) => (!iso || now == null ? "" : relative(now - new Date(iso).getTime()));
  const toggle = (k: string) => setOpen((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const retry = async (id: string, orderNumber: string) => {
    setBusy(id); setMsg((m) => ({ ...m, [id]: "" }));
    try { const res = await post("/api/admin/orders/refund", { orderNumber }); const d = (await res.json()) as { error?: string }; if (res.ok) { setMsg((m) => ({ ...m, [id]: "Retry sent — refreshing…" })); router.refresh(); } else setMsg((m) => ({ ...m, [id]: d.error ?? "Retry failed" })); }
    catch { setMsg((m) => ({ ...m, [id]: "Retry failed" })); } finally { setBusy(null); }
  };
  const setState = async (alertKeys: string[], state: string, snoozeMinutes?: number) => {
    try { const res = await post("/api/admin/notifications/state", { alertKeys, state, snoozeMinutes }); if (res.ok) router.refresh(); } catch { /* best-effort */ }
    setSnoozeFor(null);
  };
  const retryAll = async (key: string, orders: string[]) => {
    setBusy(`all:${key}`);
    try { for (const o of orders) await post("/api/admin/orders/refund", { orderNumber: o }); router.refresh(); }
    finally { setBusy(null); }
  };

  // Export a group's items to CSV (review option 2).
  const exportCsv = (a: AdminAlert) => {
    const rows = [["notification_id", "reference", "detail", "context", "at"], ...a.items.map((i) => [i.notId ?? "", i.primary, i.secondary ?? "", i.meta ?? "", i.at ?? ""])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a"); link.href = url; link.download = `${a.key}-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  // Details drawer (review option 3) — a focused right-side panel for one item.
  const [drawer, setDrawer] = useState<{ item: AlertItem; prio: AlertPriority; title: string } | null>(null);

  if (!alerts.length) {
    return (
      <div className="no-alerts">
        <span className="no-alerts__check">✓</span>
        <p className="no-alerts__title">Everything is running normally</p>
        <p className="no-alerts__sub">No operational alerts. Event notifications appear below when activity occurs.</p>
      </div>
    );
  }

  return (
    <>
    <ul className="op-alerts">
      {alerts.map((a) => {
        const expanded = open.has(a.key);
        const shown = a.items.slice(0, DISPLAY_CAP);
        const hidden = a.items.length - shown.length;
        const canRetryAll = a.key === "refund_failed" && a.items.some((i) => i.retryOrderNumber);
        return (
          <li key={a.key} className="op-alert" data-prio={a.priority}>
            <button type="button" className="op-alert__head" onClick={() => toggle(a.key)} aria-expanded={expanded}>
              <span className="op-alert__icon" aria-hidden>{PRIO[a.priority].icon}</span>
              <span className="op-alert__title">{a.title}</span>
              <span className="op-alert__count">{a.count}</span>
              {a.items.length ? <span className="op-alert__caret" data-open={expanded ? "1" : undefined}>▾</span> : null}
              <Link href={a.href} className="op-alert__all" onClick={(e) => e.stopPropagation()}>Review all →</Link>
            </button>

            {expanded && a.items.length ? (
              <>
                {a.items.length > 1 ? (
                  <div className="op-bulk">
                    <span className="op-bulk__label">Bulk:</span>
                    <button type="button" className="op-bulk__btn" onClick={() => setState(a.items.map((i) => i.alertKey), "acknowledged")}>Assign all to me</button>
                    {canRetryAll ? <button type="button" className="op-bulk__btn" disabled={busy === `all:${a.key}`} onClick={() => retryAll(a.key, a.items.map((i) => i.retryOrderNumber).filter(Boolean) as string[])}>{busy === `all:${a.key}` ? "Retrying…" : "Retry all"}</button> : null}
                    {a.priority !== "critical" && a.priority !== "high" ? <button type="button" className="op-bulk__btn" onClick={() => setState(a.items.map((i) => i.alertKey), "open", 60)}>Snooze all 1h</button> : null}
                    <button type="button" className="op-bulk__btn" onClick={() => setState(a.items.map((i) => i.alertKey), "resolved")}>Resolve all</button>
                    <button type="button" className="op-bulk__btn" onClick={() => exportCsv(a)}>Export CSV</button>
                  </div>
                ) : null}
                <ul className="op-items">
                  {shown.map((it) => (
                    <li key={it.id} className="op-item">
                      <div className="op-item__body">
                        <span className="op-item__primary">{it.primary}{it.secondary ? <span className="op-item__secondary"> · {it.secondary}</span> : null}</span>
                        {it.meta ? <span className="op-item__meta">{it.meta}</span> : null}
                        <span className="op-item__tags">
                          {it.notId ? <span className="op-item__id" title="Support reference">{it.notId}</span> : null}
                          {it.incidentNumber ? <Link href={`/admin/incidents/${it.incidentNumber}`} className="op-item__inc" title="Part of an incident">🚨 {it.incidentNumber}</Link> : null}
                        </span>
                      </div>
                      <span className="op-item__time">{ago(it.at)}</span>
                      <div className="op-item__actions">
                        {it.assigneeName ? <span className="op-item__owner" title={`Assigned to ${it.assigneeName}`}>👤 {it.assigneeName}</span> : null}
                        <button type="button" className="op-item__btn" onClick={() => setDrawer({ item: it, prio: a.priority, title: a.title })}>Details</button>
                        <Link href={it.href} className="op-item__btn">Review</Link>
                        {it.retryOrderNumber ? <button type="button" className="op-item__btn op-item__btn--retry" disabled={busy === it.id} onClick={() => retry(it.id, it.retryOrderNumber as string)}>{busy === it.id ? "Retrying…" : "Retry"}</button> : null}
                        {!it.assigneeName ? <button type="button" className="op-item__btn" onClick={() => setState([it.alertKey], "acknowledged")}>Assign to me</button> : <button type="button" className="op-item__btn" onClick={() => setState([it.alertKey], "open")}>Release</button>}
                        {a.priority !== "critical" && a.priority !== "high" ? (
                          <span className="op-snooze">
                            <button type="button" className="op-item__btn" onClick={() => setSnoozeFor(snoozeFor === it.alertKey ? null : it.alertKey)}>Snooze ▾</button>
                            {snoozeFor === it.alertKey ? (
                              <span className="op-snooze__menu">
                                <button type="button" onClick={() => setState([it.alertKey], "open", 30)}>30 min</button>
                                <button type="button" onClick={() => setState([it.alertKey], "open", 60)}>1 hour</button>
                                <button type="button" onClick={() => setState([it.alertKey], "open", tomorrow9amMinutes())}>Tomorrow</button>
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                      </div>
                      {msg[it.id] ? <span className="op-item__msg">{msg[it.id]}</span> : null}
                    </li>
                  ))}
                  {hidden > 0 ? <li className="op-items__more"><Link href={a.href}>Showing latest {DISPLAY_CAP} · View all {a.count} →</Link></li> : null}
                </ul>
              </>
            ) : null}
          </li>
        );
      })}
    </ul>

    {drawer ? (
      <div className="nc-drawer" role="dialog" aria-modal="true" aria-label="Notification details">
        <div className="nc-drawer__scrim" onClick={() => setDrawer(null)} />
        <aside className="nc-drawer__panel">
          <header className="nc-drawer__head">
            <span className="nc-drawer__eyebrow">{PRIO[drawer.prio].icon} {drawer.title} · {drawer.item.notId}</span>
            <button type="button" className="nc-drawer__close" onClick={() => setDrawer(null)} aria-label="Close">✕</button>
          </header>
          <dl className="nc-drawer__grid">
            <div><dt>Reference</dt><dd>{drawer.item.primary}</dd></div>
            {drawer.item.secondary ? <div><dt>Customer</dt><dd>{drawer.item.secondary}</dd></div> : null}
            {drawer.item.meta ? <div><dt>Detail</dt><dd>{drawer.item.meta}</dd></div> : null}
            <div><dt>Occurred</dt><dd>{ago(drawer.item.at) || "—"}</dd></div>
            {drawer.item.subsystem ? <div><dt>Subsystem</dt><dd>{drawer.item.subsystem}</dd></div> : null}
            {drawer.item.assigneeName ? <div><dt>Assigned</dt><dd>👤 {drawer.item.assigneeName}</dd></div> : null}
            {drawer.item.incidentNumber ? <div><dt>Incident</dt><dd><Link href={`/admin/incidents/${drawer.item.incidentNumber}`} className="admin__mono">{drawer.item.incidentNumber}</Link></dd></div> : null}
          </dl>
          <div className="nc-drawer__actions">
            <Link href={drawer.item.href} className="op-item__btn">Open →</Link>
            {drawer.item.retryOrderNumber ? <button type="button" className="op-item__btn op-item__btn--retry" onClick={() => retry(drawer.item.id, drawer.item.retryOrderNumber as string)}>Retry</button> : null}
            {!drawer.item.assigneeName ? <button type="button" className="op-item__btn" onClick={() => { setState([drawer.item.alertKey], "acknowledged"); setDrawer(null); }}>Assign to me</button> : null}
            <Link href={`/admin/audit?search=${encodeURIComponent(drawer.item.primary)}`} className="op-item__btn">Logs</Link>
          </div>
        </aside>
      </div>
    ) : null}
    </>
  );
}
