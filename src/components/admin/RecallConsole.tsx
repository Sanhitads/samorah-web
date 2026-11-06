"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  const detailRef = useRef<HTMLDivElement | null>(null);

  // Clicking "Open" renders the detail below a (possibly long) table — bring it into view so the action
  // is visibly reflected regardless of how many cases are listed.
  useEffect(() => { if (sel) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [sel]);

  const load = useCallback(async () => {
    try { setRecalls(await call("list")); } catch (e) { setErr(e instanceof Error ? e.message : "load failed"); }
  }, []);
  useEffect(() => { if (!initialRecalls) void load(); }, [initialRecalls, load]);

  const openDetail = useCallback(async (id: string) => {
    setSel(id); setErr(""); setDetail(null);
    try {
      const [notifications, batches] = await Promise.all([call("list_notifications", { recallId: id }), call("case_batches", { recallId: id })]);
      setDetail({ notifications, batches });
    } catch (e) { setErr(e instanceof Error ? e.message : "detail failed"); }
  }, []);

  const addBatches = async (id: string) => {
    const codes = window.prompt("Affected batch code(s) — comma-separated:");
    if (codes === null || !codes.trim()) return;
    setBusy(true); setErr("");
    try {
      const r: any = await call("add_batches_by_code", { recallId: id, codes }); // eslint-disable-line @typescript-eslint/no-explicit-any
      if (r?.notFound?.length) setErr(`Added ${r.added}. Not found: ${r.notFound.join(", ")}`);
      await load(); await openDetail(id);
    } catch (e) { setErr(e instanceof Error ? e.message : "add failed"); } finally { setBusy(false); }
  };

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
        <button type="button" className="ff-btn" disabled={busy} onClick={() => {
          const reason = window.prompt("Recall reason?"); if (reason === null || reason.trim() === "") return;
          const sevIn = (window.prompt("Severity — low / medium / high / critical:", "high") || "high").trim().toLowerCase();
          const severity = ["low", "medium", "high", "critical"].includes(sevIn) ? sevIn : "high";
          void op(() => call("create", { kind: "recall", reason: reason.trim(), severity }));
        }}>New recall</button>
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
        <div className="admin__card" aria-label={`Recall ${current.recall_number}`} ref={detailRef}>
          <h3 className="admin__section">{current.recall_number} · {current.kind} · severity: {current.severity}</h3>
          <p className="admin__note">Status: <b>{current.status}</b> · containment: {current.containment_status}</p>
          <p className="admin__note">How it works: <b>1.</b> add the affected batch(es) below. <b>2.</b> move the case to <i>initiated</i>. <b>3.</b> <i>Apply containment</i> blocks their release / allocation / picking / dispatch (returned units route to quarantine). <b>4.</b> <i>Prepare contact list</i> builds the affected-customer list (no external send). Severity is set when the case is created.</p>

          {/* Affected batches — what the case acts on. Containment/notifications do nothing until batches are added. */}
          <div className="admin__section">
            <h4>Affected batches {detail?.batches ? `(${detail.batches.length})` : ""}</h4>
            <ul className="prov-ship">
              {(detail?.batches ?? []).map((cb: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                <li key={cb.batch_id}>{cb.manufacturing_batches?.batch_code ?? cb.batch_id} · {cb.manufacturing_batches?.lifecycle_status} · {cb.manufacturing_batches?.recall_state}</li>
              ))}
              {detail?.batches && detail.batches.length === 0 ? <li className="admin__muted">None yet — add the affected batch code(s) to contain them.</li> : null}
            </ul>
            <button type="button" className="ff-btn" disabled={busy} onClick={() => addBatches(current.id)}>Add affected batch(es)</button>
          </div>

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
