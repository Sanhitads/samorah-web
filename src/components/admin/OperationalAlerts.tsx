"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AdminAlert, AlertPriority } from "@/services/notificationCenterService";

const PRIO: Record<AlertPriority, { icon: string; label: string }> = {
  critical: { icon: "🔴", label: "Critical" },
  high: { icon: "🟠", label: "High" },
  medium: { icon: "🟡", label: "Medium" },
  info: { icon: "🔵", label: "Info" },
};

function relative(ms: number): string {
  const s = Math.max(0, ms / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/**
 * Operational alerts (review points 2, 3, 6, 7, 9, 11) — each alert expands to the concrete
 * items behind it (order · customer · amount · reason · time), with a deep-link Review that
 * opens the exact order + section and an inline Retry for failed refunds. Urgent groups
 * (critical/high) auto-expand so the context is visible without a click.
 */
export function OperationalAlerts({ alerts }: { alerts: AdminAlert[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<Set<string>>(new Set(alerts.filter((a) => a.priority === "critical" || a.priority === "high").map((a) => a.key)));
  const [now, setNow] = useState<number | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});
  useEffect(() => setNow(Date.now()), []);

  const ago = (iso: string | null) => (!iso || now == null ? "" : relative(now - new Date(iso).getTime()));
  const toggle = (k: string) => setOpen((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const retry = async (id: string, orderNumber: string) => {
    setRetrying(id);
    setMsg((m) => ({ ...m, [id]: "" }));
    try {
      const res = await fetch("/api/admin/orders/refund", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderNumber }) });
      const d = (await res.json()) as { error?: string };
      if (res.ok) { setMsg((m) => ({ ...m, [id]: "Retry sent — refreshing…" })); router.refresh(); }
      else setMsg((m) => ({ ...m, [id]: d.error ?? "Retry failed" }));
    } catch {
      setMsg((m) => ({ ...m, [id]: "Retry failed" }));
    } finally {
      setRetrying(null);
    }
  };

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
    <ul className="op-alerts">
      {alerts.map((a) => {
        const expanded = open.has(a.key);
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
              <ul className="op-items">
                {a.items.map((it) => (
                  <li key={it.id} className="op-item">
                    <div className="op-item__body">
                      <span className="op-item__primary">{it.primary}{it.secondary ? <span className="op-item__secondary"> · {it.secondary}</span> : null}</span>
                      {it.meta ? <span className="op-item__meta">{it.meta}</span> : null}
                    </div>
                    <span className="op-item__time">{ago(it.at)}</span>
                    <div className="op-item__actions">
                      <Link href={it.href} className="op-item__btn">Review</Link>
                      {it.retryOrderNumber ? (
                        <button type="button" className="op-item__btn op-item__btn--retry" disabled={retrying === it.id} onClick={() => retry(it.id, it.retryOrderNumber as string)}>
                          {retrying === it.id ? "Retrying…" : "Retry"}
                        </button>
                      ) : null}
                    </div>
                    {msg[it.id] ? <span className="op-item__msg">{msg[it.id]}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
