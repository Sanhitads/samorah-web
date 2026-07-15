"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

const post = (body: unknown) => fetch("/api/admin/incidents/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// ── List: run correlation ──────────────────────────────────────────────────────
export function RunCorrelation() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const run = async () => {
    setBusy(true); setMsg("");
    try {
      const res = await post({ action: "correlate" });
      const d = (await res.json()) as { result?: { created: number; merged: number; attached: number; resolved: number } };
      if (res.ok && d.result) setMsg(`+${d.result.created} new · ${d.result.attached} attached · ${d.result.resolved} resolved`);
      router.refresh();
    } catch { setMsg("Failed"); } finally { setBusy(false); }
  };
  return <span className="inc-run"><button type="button" className="cc-qa__btn" onClick={run} disabled={busy}>{busy ? "Correlating…" : "Run correlation"}</button>{msg ? <span className="admin__muted" style={{ fontSize: 12 }}>{msg}</span> : null}</span>;
}

const STATUSES = ["open", "investigating", "mitigated", "resolved", "closed"];
const SEVERITIES = ["critical", "high", "medium", "low", "info"];
const TEAMS: { v: string; l: string }[] = [{ v: "finance", l: "Finance" }, { v: "warehouse", l: "Warehouse" }, { v: "support", l: "Customer Support" }, { v: "marketing", l: "Marketing" }, { v: "admin", l: "Admin" }];

// ── Detail: toolbar (assign / transfer / watch / team / status / severity / snooze) ──
export function IncidentToolbar({ number, status, severity, team, assigneeName, staffUsers }: { number: string; status: string; severity: string; team: string | null; assigneeName: string | null; staffUsers: { id: string; name: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const act = async (body: Record<string, unknown>) => { setBusy(true); try { const r = await post({ number, ...body }); if (r.ok) router.refresh(); } finally { setBusy(false); } };
  const snooze = (v: string) => {
    if (!v) return;
    if (v === "custom") { const m = Number(prompt("Snooze how many minutes?", "120")); if (m > 0) act({ action: "snooze", minutes: m }); return; }
    if (v === "tomorrow") { const t = new Date(); t.setDate(t.getDate() + 1); t.setHours(9, 0, 0, 0); act({ action: "snooze", minutes: Math.max(60, Math.round((t.getTime() - Date.now()) / 60000)) }); return; }
    act({ action: "snooze", minutes: Number(v) });
  };
  return (
    <div className="inc-toolbar">
      {assigneeName ? <span className="op-item__owner">👤 {assigneeName}</span> : <span className="admin__muted" style={{ fontSize: 12 }}>Unassigned</span>}
      <button type="button" className="op-item__btn" disabled={busy} onClick={() => act({ action: "assign" })}>Assign to me</button>
      <label className="inc-actions__status">Transfer
        <select disabled={busy} defaultValue="" onChange={(e) => { const u = staffUsers.find((s) => s.id === e.target.value); if (u) act({ action: "assign", targetId: u.id, targetName: u.name }); }}>
          <option value="">—</option>{staffUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </label>
      {assigneeName ? <button type="button" className="op-item__btn" disabled={busy} onClick={() => act({ action: "unassign" })}>Remove</button> : null}
      <button type="button" className="op-item__btn" disabled={busy} onClick={() => act({ action: "watch", role: "watcher" })}>Watch</button>
      <label className="inc-actions__status">Team
        <select value={team ?? ""} disabled={busy} onChange={(e) => act({ action: "team", team: e.target.value })}><option value="">—</option>{TEAMS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</select>
      </label>
      <label className="inc-actions__status">Status
        <select value={status} disabled={busy} onChange={(e) => act({ action: "status", status: e.target.value })}>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
      </label>
      <label className="inc-actions__status">Severity
        <select value={severity} disabled={busy} onChange={(e) => act({ action: "severity", severity: e.target.value })}>{SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
      </label>
      <label className="inc-actions__status">Snooze
        <select value="" disabled={busy} onChange={(e) => snooze(e.target.value)}><option value="">—</option><option value="30">30 min</option><option value="60">1 hour</option><option value="tomorrow">Tomorrow</option><option value="custom">Custom…</option></select>
      </label>
    </div>
  );
}

export function IncidentChecklist({ items }: { items: { id: string; label: string; done: boolean; doneBy: string | null }[] }) {
  const router = useRouter();
  const toggle = async (id: string, done: boolean) => { const r = await post({ action: "checklist", itemId: id, done }); if (r.ok) router.refresh(); };
  if (!items.length) return <p className="admin__muted">No checklist for this incident type.</p>;
  return (
    <ul className="inc-checklist">
      {items.map((it) => (
        <li key={it.id}>
          <label><input type="checkbox" checked={it.done} onChange={(e) => toggle(it.id, e.target.checked)} /> <span data-done={it.done ? "1" : undefined}>{it.label}</span>{it.done && it.doneBy ? <span className="admin__muted"> · {it.doneBy}</span> : null}</label>
        </li>
      ))}
    </ul>
  );
}

export function IncidentNoteForm({ number }: { number: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const add = async () => { if (!note.trim()) return; setBusy(true); try { const r = await post({ number, action: "note", note }); if (r.ok) { setNote(""); router.refresh(); } } finally { setBusy(false); } };
  return (
    <div className="inc-noteform">
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note… (e.g. Waiting for Razorpay)" onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
      <button type="button" className="op-item__btn" disabled={busy || !note.trim()} onClick={add}>Add note</button>
    </div>
  );
}

// ── Detail: knowledge-base resolve (root cause + resolution + prevention required) ──
export function IncidentResolve({ number, defaultRootCause }: { number: string; defaultRootCause?: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rootCause, setRootCause] = useState(defaultRootCause ?? "");
  const [resolution, setResolution] = useState("");
  const [prevention, setPrevention] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async () => {
    setErr("");
    if (!rootCause.trim() || !resolution.trim() || !prevention.trim()) { setErr("All three fields are required to resolve."); return; }
    setBusy(true);
    try {
      const r = await post({ number, action: "resolve", rootCause, resolution, prevention });
      if (r.ok) { setOpen(false); router.refresh(); }
      else { const d = await r.json().catch(() => ({})); setErr(d.error ?? "Failed to resolve."); }
    } finally { setBusy(false); }
  };
  if (!open) return <button type="button" className="op-item__btn op-item__btn--primary" onClick={() => setOpen(true)}>✓ Resolve with knowledge base</button>;
  return (
    <div className="inc-resolve">
      <p className="inc-resolve__title">Resolve — capture the knowledge base</p>
      <label className="inc-resolve__field">Root cause<textarea value={rootCause} onChange={(e) => setRootCause(e.target.value)} placeholder="What actually caused this? (e.g. Razorpay gateway timeout during a provider outage)" rows={2} /></label>
      <label className="inc-resolve__field">Resolution<textarea value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="What fixed it? (e.g. Retried refunds after Razorpay recovered; confirmed settlements)" rows={2} /></label>
      <label className="inc-resolve__field">Prevention<textarea value={prevention} onChange={(e) => setPrevention(e.target.value)} placeholder="How do we prevent recurrence? (e.g. Add gateway-status precheck before bulk refunds)" rows={2} /></label>
      {err ? <p className="inc-resolve__err">{err}</p> : null}
      <div className="inc-resolve__actions">
        <button type="button" className="op-item__btn op-item__btn--primary" disabled={busy} onClick={submit}>{busy ? "Resolving…" : "Resolve incident"}</button>
        <button type="button" className="op-item__btn" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

// ── List: filters + search + export ─────────────────────────────────────────────
export function IncidentFilterBar({ total, page, pageSize }: { total: number; page: number; pageSize: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const set = (k: string, v: string) => { const p = new URLSearchParams(sp.toString()); if (v) p.set(k, v); else p.delete(k); p.delete("page"); router.push(`${pathname}?${p.toString()}`); };
  const val = (k: string) => sp.get(k) ?? "";
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const goPage = (n: number) => { const p = new URLSearchParams(sp.toString()); p.set("page", String(n)); router.push(`${pathname}?${p.toString()}`); };
  const exportUrl = (fmt: string) => { const p = new URLSearchParams(sp.toString()); p.set("format", fmt); return `/api/admin/incidents/export?${p.toString()}`; };

  return (
    <>
      <div className="inc-filters">
        <input className="nc-search" type="search" defaultValue={val("q")} placeholder="Search ID, order, customer, gateway, reason…" onKeyDown={(e) => { if (e.key === "Enter") set("q", (e.target as HTMLInputElement).value); }} />
        <select value={val("status") || "active"} onChange={(e) => set("status", e.target.value === "active" ? "" : e.target.value)}><option value="active">Open</option><option value="all">All statuses</option><option value="investigating">Investigating</option><option value="mitigated">Mitigated</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select>
        <select value={val("severity")} onChange={(e) => set("severity", e.target.value)}><option value="">Any severity</option>{SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <select value={val("category")} onChange={(e) => set("category", e.target.value)}><option value="">Any category</option><option value="refund">Refund</option><option value="payment_gateway">Payment Gateway</option><option value="shipment">Shipment</option><option value="inventory">Inventory</option><option value="email">Email</option></select>
        <select value={val("team")} onChange={(e) => set("team", e.target.value)}><option value="">Any team</option>{TEAMS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</select>
        <select value={val("assigned")} onChange={(e) => set("assigned", e.target.value)}><option value="">Anyone</option><option value="mine">Assigned to me</option><option value="unassigned">Unassigned</option></select>
        <select value={val("created")} onChange={(e) => set("created", e.target.value)}><option value="">Any time</option><option value="1">Created today</option><option value="7">This week</option></select>
        <select value={val("resolved")} onChange={(e) => set("resolved", e.target.value)}><option value="">—</option><option value="today">Resolved today</option></select>
      </div>
      <div className="inc-listbar">
        <span className="admin__muted">{total} incident{total === 1 ? "" : "s"} · page {page}/{pages}</span>
        <span className="inc-listbar__right">
          <a className="op-item__btn" href={exportUrl("csv")}>CSV</a>
          <a className="op-item__btn" href={exportUrl("xls")}>Excel</a>
          <button type="button" className="op-item__btn" onClick={() => window.print()}>Print / PDF</button>
          {page > 1 ? <button type="button" className="op-item__btn" onClick={() => goPage(page - 1)}>← Prev</button> : null}
          {page < pages ? <button type="button" className="op-item__btn" onClick={() => goPage(page + 1)}>Next →</button> : null}
        </span>
      </div>
    </>
  );
}
