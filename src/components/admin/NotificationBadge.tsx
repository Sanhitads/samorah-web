"use client";

import { useEffect, useState } from "react";

/**
 * Bell badge for the Notification Ops nav item — unread count, and a red pulse when a critical
 * alert is still unacknowledged. Polls every 60s (cheap: two indexed counts) and refreshes when the
 * tab regains focus, so staff see new alerts without a reload.
 */
export function NotificationBadge() {
  const [c, setC] = useState<{ unread: number; criticalUnacked: number } | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try { const r = await fetch("/api/admin/notifications/log"); if (!r.ok) return; const d = await r.json(); if (alive) setC({ unread: d.unread ?? 0, criticalUnacked: d.criticalUnacked ?? 0 }); } catch { /* ignore */ }
    };
    load();
    const t = setInterval(load, 60_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { alive = false; clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, []);
  if (!c || (!c.unread && !c.criticalUnacked)) return null;
  return (
    <span className={`ash-alert${c.criticalUnacked ? " ash-alert--crit" : ""}`} title={c.criticalUnacked ? `${c.criticalUnacked} critical alert(s) awaiting acknowledgement` : `${c.unread} unread`}>
      {c.criticalUnacked ? c.criticalUnacked : c.unread}
    </span>
  );
}
