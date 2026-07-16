"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
// Import from the CLIENT-SAFE module, never from opsEngine — the engine is server-only
// (node:crypto + the service-role Supabase client) and must not reach the browser bundle.
import { buildTimeline, type FeedItem, type FeedChannel } from "@/lib/notifications/feedTypes";
import { CHANNEL_ICON, type OpsChannelKey } from "@/config/notifications";

/** Operations Center client pieces — filters/search, the feed, the detail drawer (retry + ack),
 *  and the realistic test presets. Server page supplies the data. */
const post = (body: unknown) => fetch("/api/admin/notifications/log", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const CATEGORIES = [
  { v: "", l: "All" }, { v: "orders", l: "Orders" }, { v: "payments", l: "Payments" },
  { v: "inventory", l: "Inventory" }, { v: "warehouse", l: "Warehouse" }, { v: "marketing", l: "Marketing" },
  { v: "customers", l: "Customers" }, { v: "system", l: "System" },
];
const ST_LABEL: Record<string, string> = { queued: "Queued", sending: "Sending", delivered: "Delivered", failed: "Failed", retrying: "Retrying", skipped: "Skipped", dead: "Dead letter" };
const SEV: Record<string, string> = { info: "🟢", warning: "🟡", critical: "🔴" };
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
const dt = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });

// ── Filters + search ────────────────────────────────────────────────────────────
export function OpsFilters({ shown, dlq }: { shown: number; dlq: boolean }) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  const val = (k: string) => sp.get(k) ?? "";
  // Any filter change restarts the keyset scan — a cursor from the old filter set is meaningless.
  const set = (k: string, v: string) => { const p = new URLSearchParams(sp.toString()); if (v) p.set(k, v); else p.delete(k); p.delete("cursor"); router.push(`${pathname}?${p.toString()}`); };
  return (
    <div className="nlog-filters">
      <div className="nlog-chips">
        {CATEGORIES.map((c) => (
          <button key={c.v || "all"} type="button" className={`nlog-chip${val("category") === c.v ? " is-active" : ""}`} onClick={() => set("category", c.v)}>{c.l}</button>
        ))}
        <button type="button" className={`nlog-chip nlog-chip--crit${val("severity") === "critical" ? " is-active" : ""}`} onClick={() => set("severity", val("severity") === "critical" ? "" : "critical")}>🔴 Critical</button>
        <button type="button" className={`nlog-chip${val("unread") === "1" ? " is-active" : ""}`} onClick={() => set("unread", val("unread") === "1" ? "" : "1")}>Unread</button>
        <button type="button" className={`nlog-chip${val("status") === "failed" ? " is-active" : ""}`} onClick={() => set("status", val("status") === "failed" ? "" : "failed")}>Failed</button>
        <button type="button" className={`nlog-chip nlog-chip--dlq${dlq ? " is-active" : ""}`} onClick={() => set("dlq", dlq ? "" : "1")}>☠ Dead letters</button>
      </div>
      <div className="nlog-searchrow">
        <input className="nc-search" type="search" defaultValue={val("q")} placeholder="Search order ID, customer, event, type…" onKeyDown={(e) => { if (e.key === "Enter") set("q", (e.target as HTMLInputElement).value); }} />
        <span className="admin__muted" style={{ fontSize: 12 }}>Showing {shown}</span>
      </div>
    </div>
  );
}

export function MarkAllRead({ unread }: { unread: number }) {
  const router = useRouter(); const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); try { const r = await post({ action: "read_all" }); if (r.ok) router.refresh(); } finally { setBusy(false); } };
  return <button type="button" className="op-item__btn" disabled={busy || !unread} onClick={run}>{busy ? "…" : `Mark all read${unread ? ` (${unread})` : ""}`}</button>;
}

// ── Feed + detail drawer ────────────────────────────────────────────────────────
export function OpsFeed({ items }: { items: FeedItem[] }) {
  const router = useRouter();
  // Track the OPEN ITEM BY ID and derive it from the live `items` — never hold a snapshot object,
  // or the drawer would keep rendering the row as it looked when it was clicked.
  const [openId, setOpenId] = useState<string | null>(null);
  // …but keep the last-known copy as a fallback so the drawer never blinks out if the row leaves the
  // filtered page (e.g. it drops off the "Unread" filter the moment we mark it read).
  const [fallback, setFallback] = useState<FeedItem | null>(null);
  const [pendingRefresh, setPendingRefresh] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // The drawer's own copy is authoritative: it's fetched fresh on open and after every action, and
  // is filter-independent (a replayed row leaves the DLQ view but must still render its new state).
  // The list entry is only the instant-render seed until that fetch lands.
  const open = openId ? (fallback ?? items.find((i) => i.groupId === openId) ?? null) : null;

  const close = () => {
    setOpenId(null); setFallback(null); setNote(null);
    // Refresh only AFTER closing, so we never re-render the page underneath an open drawer.
    if (pendingRefresh) { setPendingRefresh(false); router.refresh(); }
  };
  const openItem = async (it: FeedItem) => {
    setOpenId(it.groupId); setFallback(it); setNote(null);   // seed = instant render
    if (!it.read) { await post({ action: "read", groupId: it.groupId }); setPendingRefresh(true); }
    await refreshOpen(it.groupId);                            // then the authoritative copy
  };
  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  /** Pull this ONE item fresh, independent of the current filters. Essential after a replay: the row
   *  stops being `dead` and leaves the DLQ view, so the list can only offer a stale snapshot. */
  const refreshOpen = async (groupId: string) => {
    try {
      const r = await fetch(`/api/admin/notifications/log?groupId=${encodeURIComponent(groupId)}`);
      if (!r.ok) return;
      const d = await r.json().catch(() => ({}));
      if (d.item) setFallback(d.item as FeedItem);
    } catch { /* keep whatever we have */ }
  };

  const retry = async (c: FeedChannel, replay = false) => {
    setBusy(true); setNote(null);
    try {
      const r = await post({ action: replay ? "replay" : "retry", id: c.id });
      const d = await r.json().catch(() => ({}));
      setNote(r.ok ? `${replay ? "Replay" : "Retry"} succeeded — ${c.channel} delivered.` : `${replay ? "Replay" : "Retry"} failed: ${d.error ?? "unknown"}${d.status === "dead" ? " — returned to the Dead Letter Queue." : ""}`);
      if (openId) await refreshOpen(openId);   // show the real outcome even if it left this filter
      router.refresh();
    } finally { setBusy(false); }
  };
  const ack = async (it: FeedItem) => {
    setBusy(true);
    try { const r = await post({ action: "acknowledge", groupId: it.groupId }); if (r.ok) { setNote("Acknowledged."); await refreshOpen(it.groupId); router.refresh(); } }
    finally { setBusy(false); }
  };

  if (!items.length) {
    return <div className="no-alerts"><span className="no-alerts__check">✓</span><p className="no-alerts__title">No notifications match</p><p className="no-alerts__sub">Operational events (orders, low stock, payment failures, incident escalations, digests) appear here as they fire.</p></div>;
  }

  return (
    <>
      <ul className="nlog-feed">
        {items.map((it) => (
          <li key={it.groupId} className={`nlog-item nlog-item--${it.severity}${it.read ? "" : " is-unread"}`}>
            <button type="button" className="nlog-item__btn" onClick={() => openItem(it)}>
              <span className="nlog-item__time">{time(it.createdAt)}</span>
              <span className="nlog-item__main">
                <span className="nlog-item__title">
                  {SEV[it.severity]} {it.title ?? it.event}
                  {it.entityRef ? <span className="admin__mono nlog-item__ref"> {it.entityRef}</span> : null}
                  {it.correlatedCount > 1 ? <span className="nlog-corr" title={`${it.correlatedCount} correlated events from one root cause`}>×{it.correlatedCount} affected</span> : null}
                </span>
                <span className="nlog-item__meta"><span className="nlog-cat">{it.category}</span> <span className="admin__mono" style={{ fontSize: 11 }}>{it.event}</span></span>
              </span>
              <span className="nlog-item__chans">
                {it.channels.map((c) => (
                  <span key={c.id} className={`nlog-chan nlog-chan--${c.status}`} title={`${c.channel}: ${ST_LABEL[c.status]}${c.error ? ` — ${c.error}` : ""}`}>
                    <span aria-hidden>{CHANNEL_ICON[c.channel as OpsChannelKey] ?? "•"}</span><span className="nlog-chan__l">{c.channel}</span>
                  </span>
                ))}
              </span>
              <span className={`nlog-status nlog-status--${it.status}`}>{ST_LABEL[it.status]}</span>
              {it.severity === "critical" && !it.acknowledgedAt ? <span className="nlog-ackflag">needs ack</span> : null}
            </button>
          </li>
        ))}
      </ul>

      {open ? (
        <div className="nlog-drawer" role="dialog" aria-modal="true" aria-label="Notification detail">
          <button type="button" className="nlog-drawer__scrim" aria-label="Close" onClick={close} />
          <div className="nlog-drawer__panel">
            <div className="nlog-drawer__head">
              <div>
                <p className="nlog-drawer__title">{SEV[open.severity]} {open.title ?? open.event}</p>
                <p className="admin__muted" style={{ fontSize: 12 }}><span className="admin__mono">{open.event}</span> · {open.category} · {dt(open.createdAt)}</p>
              </div>
              <button type="button" className="op-item__btn" onClick={close}>Close</button>
            </div>
            {note ? <p className="nlog-note">{note}</p> : null}

            <div className="od-detail">
              <div><dt>Severity</dt><dd>{open.severity}</dd></div>
              <div><dt>Status</dt><dd>{ST_LABEL[open.status]}</dd></div>
              <div><dt>Entity</dt><dd>{open.entityType ? `${open.entityType} · ${open.entityRef ?? "—"}` : (open.entityRef ?? "—")}</dd></div>
              <div><dt>Acknowledged</dt><dd>{open.acknowledgedAt ? `${dt(open.acknowledgedAt)}${open.acknowledgedBy ? ` · ${open.acknowledgedBy}` : ""}` : "—"}</dd></div>
            </div>

            {open.payload?.message ? <p className="nlog-drawer__msg">{open.payload.message}</p> : null}
            {open.payload?.fields?.length ? (
              <>
                <h3 className="od-card__title" style={{ fontSize: "0.95rem", marginTop: 12 }}>Payload</h3>
                <div className="od-detail">{open.payload.fields.map((f: { label: string; value: string }, i: number) => <div key={i}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</div>
              </>
            ) : null}

            {/* Correlation drill-down — the affected events behind a collapsed item */}
            {open.correlatedCount > 1 ? (
              <>
                <h3 className="od-card__title" style={{ fontSize: "0.95rem", marginTop: 14 }}>Affected events ({open.correlatedCount})</h3>
                <p className="admin__muted" style={{ fontSize: 11, marginBottom: 6 }}>Correlated to one root cause — collapsed in the feed to cut noise; every event is listed here.</p>
                <ul className="nlog-affected">
                  {open.correlatedRefs.map((r) => (
                    <li key={r.groupId}><span className="admin__mono">{r.ref ?? r.groupId.slice(0, 8)}</span><span className={`nlog-status nlog-status--${r.status}`}>{ST_LABEL[r.status]}</span><span className="admin__muted">{dt(r.at)}</span></li>
                  ))}
                </ul>
              </>
            ) : null}

            {/* Event timeline */}
            <h3 className="od-card__title" style={{ fontSize: "0.95rem", marginTop: 14 }}>Timeline</h3>
            <ul className="nlog-timeline">
              {buildTimeline(open).map((t, i) => (
                <li key={i} className={`nlog-tl nlog-tl--${t.kind}`}>
                  <span className="nlog-tl__time">{time(t.at)}</span>
                  <span className="nlog-tl__dot" aria-hidden />
                  <span className="nlog-tl__body"><b>{t.label}</b>{t.detail ? <span className="admin__muted"> — {t.detail}</span> : null}</span>
                </li>
              ))}
            </ul>

            <h3 className="od-card__title" style={{ fontSize: "0.95rem", marginTop: 14 }}>Channels attempted</h3>
            <ul className="nlog-chanlist">
              {open.channels.map((c) => (
                <li key={c.id} className="nlog-chanrow">
                  <div>
                    <b>{CHANNEL_ICON[c.channel as OpsChannelKey] ?? ""} {c.channel}</b> <span className={`nlog-status nlog-status--${c.status}`}>{ST_LABEL[c.status]}</span>
                    <div className="admin__muted" style={{ fontSize: 11 }}>
                      {c.target ? `→ ${c.target} · ` : ""}{c.attempts} attempt{c.attempts === 1 ? "" : "s"}
                      {c.deliveryMs != null ? ` · ${c.deliveryMs} ms` : ""}{c.lastAttemptAt ? ` · ${dt(c.lastAttemptAt)}` : ""}
                      {c.nextRetryAt && c.status === "failed" ? ` · next retry ${dt(c.nextRetryAt)}` : ""}
                    </div>
                    {c.error ? <div className="nlog-err">{c.error}</div> : null}
                    {c.status === "dead" ? <div className="nlog-dead">☠ Dead letter — {c.deadReason ?? "retry policy exhausted"}{c.replayedAt ? ` · last replay ${dt(c.replayedAt)} by ${c.replayedBy ?? "—"}` : ""}</div> : null}
                    {c.retryHistory.length ? (
                      <ul className="nlog-retries">
                        {c.retryHistory.map((h, i) => <li key={i}>↻ {dt(h.at)} — {h.status}{h.error ? `: ${h.error}` : ""} <span className="admin__muted">by {h.by}</span></li>)}
                      </ul>
                    ) : null}
                  </div>
                  {c.status === "dead" ? <button type="button" className="op-item__btn op-item__btn--primary" disabled={busy} onClick={() => retry(c, true)}>Replay</button>
                    : c.status === "failed" || c.status === "sending" ? <button type="button" className="op-item__btn op-item__btn--primary" disabled={busy} onClick={() => retry(c)}>Retry</button> : null}
                </li>
              ))}
            </ul>

            {open.severity === "critical" && !open.acknowledgedAt ? (
              <button type="button" className="op-item__btn op-item__btn--primary" style={{ marginTop: 14 }} disabled={busy} onClick={() => ack(open)}>Acknowledge critical alert</button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

// ── Test presets ────────────────────────────────────────────────────────────────
export function OpsTester({ presets }: { presets: { id: string; label: string; event: string; severity: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<{ channel: string; status: string; target?: string; error?: string }[] | null>(null);
  const fire = async (id: string) => {
    setBusy(id); setResults(null);
    try {
      const r = await fetch("/api/admin/notifications/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preset: id }) });
      const d = await r.json().catch(() => ({}));
      setResults(d.results ?? []); router.refresh();
    } finally { setBusy(null); }
  };
  return (
    <div className="nt">
      <div className="nt__presets">
        {presets.map((p) => (
          <button key={p.id} type="button" className="op-item__btn" disabled={!!busy} onClick={() => fire(p.id)}>{busy === p.id ? "Sending…" : p.label}</button>
        ))}
      </div>
      {results ? (
        <ul className="nt__results">
          {results.map((r, i) => <li key={i} className={`nt__result nt__result--${r.status === "sent" ? "delivered" : r.status}`}><b>{r.channel}</b> · {r.status === "sent" ? "delivered" : r.status}{r.target ? ` → ${r.target}` : ""}{r.error ? ` · ${r.error}` : ""}</li>)}
        </ul>
      ) : null}
      <p className="admin__muted" style={{ fontSize: 11 }}>Presets fire each event&apos;s real payload through its real route, so formatting and routing are genuinely exercised. Tagged as tests — purged after 30 days.</p>
    </div>
  );
}
