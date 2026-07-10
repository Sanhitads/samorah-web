"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { EventNotification } from "@/services/notificationCenterService";

const DOT: Record<string, string> = { critical: "🔴", warn: "🟡", info: "🔵" };

/** Event-notification inbox (class 2) — recorded one-time events with mark-read. */
export function NotificationEvents({ events }: { events: EventNotification[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    try { await fetch("/api/admin/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
    finally { setBusy(false); startTransition(() => router.refresh()); }
  };
  const unread = events.filter((e) => !e.readAt).length;

  if (!events.length) return <p className="admin__muted">No event notifications yet. Wholesale enquiries, customer replies, media and import events will appear here as those features come online.</p>;

  return (
    <div>
      <div className="cfg-actions" style={{ marginBottom: 8 }}>
        <span className="admin__muted">{unread} unread</span>
        {unread ? <button type="button" className="ff-btn" disabled={busy} onClick={() => post({ action: "read-all" })}>Mark all read</button> : null}
        {pending ? <span className="ff-refreshing">updating…</span> : null}
      </div>
      <ul className="health-list">
        {events.map((e) => (
          <li key={e.id} className="health-item" data-s={e.severity === "critical" ? "down" : e.severity === "warn" ? "warn" : "ok"} style={{ opacity: e.readAt ? 0.55 : 1 }}>
            <span className="health-item__dot">{DOT[e.severity]}</span>
            <span className="health-item__name">{e.title}{e.body ? <span className="admin__muted"> · {e.body}</span> : null}</span>
            <span className="health-item__detail admin__muted">{new Date(e.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            {e.href ? <Link href={e.href} className="text-link">Open →</Link> : null}
            {!e.readAt ? <button type="button" className="ff-btn" disabled={busy} onClick={() => post({ action: "read", id: e.id })}>Mark read</button> : <span className="admin__muted">read</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
