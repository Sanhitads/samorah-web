"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Phase 9 — Recall Admin Console (overview + case detail + authorised operations). All work posts to
 * /api/admin/recalls (single manufacturing.recall gate; actor server-derived). Customer contact data is
 * only loaded on demand for the recall role. NO external notification is ever sent — the console only
 * prepares/reviews a contact list; external dispatch is disabled.
 */
interface RecallRow { id: string; recall_number: string; kind: string; severity: string; status: string; reason: string; containment_status: string; created_at: string }

async function call(action: string, body: Record<string, unknown> = {}): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const res = await fetch("/api/admin/recalls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body }) });
  const d = await res.json();
  if (!res.ok || d.ok === false) throw new Error(d.error ?? "Request failed");
  return d.result;
}

const NEXT: Record<string, string[]> = {
  draft: ["initiated", "cancelled"], initiated: ["contained", "investigating", "cancelled"],
  contained: ["investigating", "action_required", "closed", "cancelled"],
  investigating: ["action_required", "contained", "closed", "cancelled"],
  action_required: ["contained", "investigating", "closed", "cancelled"], closed: [], cancelled: [],
};

export function RecallConsole({ initialRecalls }: { initialRecalls?: RecallRow[] }) {
  const [recalls, setRecalls] = useState<RecallRow[] | null>(initialRecalls ?? null);
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRecalls(await call("list")); } catch (e) { setErr(e instanceof Error ? e.message : "load failed"); }
  }, []);
  useEffect(() => { if (!initialRecalls) void load(); }, [initialRecalls, load]);

  const openDetail = useCallback(async (id: string) => {
    setSel(id); setErr(""); setDetail(null);
    try {
      const [notifications] = await Promise.all([call("list_notifications", { recallId: id })]);
      setDetail({ notifications });
    } catch (e) { setErr(e instanceof Error ? e.message : "detail failed"); }
  }, []);

  const op = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr("");
    try { await fn(); await load(); if (sel) await openDetail(sel); } catch (e) { setErr(e instanceof Error ? e.message : "action failed"); }
    setBusy(false);
  };

  const rows = (recalls ?? []).filter((r) => !q || `${r.recall_number} ${r.reason} ${r.status}`.toLowerCase().includes(q.toLowerCase()));
  const current = (recalls ?? []).find((r) => r.id === sel) ?? null;

  return (
    <section className="admin__card" aria-label="Recall console">
      <h2 className="admin__section">Recalls &amp; holds</h2>
      <p className="admin__note">Formal recalls and manufacturing holds. Applying containment blocks release, allocation, picking, substitution and dispatch for the affected batches. <b>External customer notifications are disabled</b> — this console only prepares a reviewable contact list.</p>

      <div className="admin__filters">
        <input className="admin__input" placeholder="Search number / reason / status" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search recalls" />
        <button type="button" className="ff-btn" disabled={busy} onClick={() => op(() => call("create", { kind: "recall", reason: window.prompt("Recall reason?") || "unspecified", severity: "high" }))}>New recall</button>
      </div>

      {err ? <p className="ff-err" role="alert">{err}</p> : null}
      {recalls === null ? <p className="admin__muted">Loading…</p> : null}

      <table className="admin__table">
        <thead><tr><th>Case</th><th>Kind</th><th>Severity</th><th>Status</th><th>Reason</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} data-selected={r.id === sel ? "1" : undefined}>
              <td>{r.recall_number}</td><td>{r.kind}</td><td>{r.severity}</td>
              <td><span className={`prov-chip${r.status === "closed" || r.status === "cancelled" ? "" : " prov-chip--sub"}`}>{r.status}</span></td>
              <td>{r.reason}</td>
              <td><button type="button" className="ff-btn" onClick={() => openDetail(r.id)}>Open</button></td>
            </tr>
          ))}
          {rows.length === 0 && recalls !== null ? <tr><td colSpan={6} className="admin__muted">No recall cases.</td></tr> : null}
        </tbody>
      </table>

      {current ? (
        <div className="admin__card" aria-label={`Recall ${current.recall_number}`}>
          <h3 className="admin__section">{current.recall_number} · {current.kind} · {current.severity}</h3>
          <p className="admin__note">Status: <b>{current.status}</b> · containment: {current.containment_status}</p>
          <div className="admin__filters">
            {(NEXT[current.status] ?? []).map((to) => (
              <button key={to} type="button" className="ff-btn" disabled={busy}
                onClick={() => op(() => call("transition", { recallId: current.id, toState: to, closureDecision: to === "closed" ? (window.prompt("Closure decision (required)?") || "") : undefined }))}>
                {to === "closed" ? "Request closure" : to}
              </button>
            ))}
            <button type="button" className="ff-btn" disabled={busy} onClick={() => op(() => call("apply_containment", { recallId: current.id }))}>Apply containment</button>
            <button type="button" className="ff-btn" disabled={busy} onClick={() => op(() => call("expand", { recallId: current.id }))}>Expand from lots</button>
            <button type="button" className="ff-btn" disabled={busy} onClick={() => op(() => call("prepare_notifications", { recallId: current.id }))}>Prepare contact list</button>
          </div>
          {detail?.notifications ? (
            <div className="admin__section">
              <h4>Affected-customer contact list <span className="admin__muted">(dispatch disabled)</span></h4>
              <ul className="prov-ship">
                {detail.notifications.map((nti: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                  <li key={nti.id}>{nti.provenance} · {nti.necessity} · {nti.approval_status} · attempts {nti.attempts}</li>
                ))}
                {detail.notifications.length === 0 ? <li className="admin__muted">None prepared.</li> : null}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
