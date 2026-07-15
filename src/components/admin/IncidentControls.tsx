"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const post = (body: unknown) => fetch("/api/admin/incidents/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** Manual "run correlation" trigger for the incident list (the cron does it every 5 min). */
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
  return (
    <span className="inc-run">
      <button type="button" className="cc-qa__btn" onClick={run} disabled={busy}>{busy ? "Correlating…" : "Run correlation"}</button>
      {msg ? <span className="admin__muted" style={{ fontSize: 12 }}>{msg}</span> : null}
    </span>
  );
}

const STATUSES = ["open", "investigating", "mitigated", "resolved", "closed"];

/** Assign / change status / add resolution note on the incident detail page. */
export function IncidentActions({ number, status }: { number: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    try { const res = await post({ number, ...body }); if (res.ok) router.refresh(); } finally { setBusy(false); }
  };
  return (
    <div className="inc-actions">
      <button type="button" className="op-item__btn" disabled={busy} onClick={() => act({ action: "assign" })}>Assign to me</button>
      <label className="inc-actions__status">
        Status
        <select value={status} disabled={busy} onChange={(e) => act({ action: "status", status: e.target.value })}>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <span className="inc-actions__note">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Resolution note…" />
        <button type="button" className="op-item__btn" disabled={busy || !note.trim()} onClick={() => { act({ action: "note", note }); setNote(""); }}>Save note</button>
      </span>
    </div>
  );
}
