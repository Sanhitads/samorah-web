"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ENQUIRY_STATUS_LABEL, type EnquiryStatus } from "@/lib/enquiries/state";

/** Enquiry workflow controls — status change, assignment, internal notes. Posts to the shared
 *  /api/admin/enquiries route and refreshes. Read-only staff see a note instead. */
export function EnquiryManage({ id, status, nextStates, assigneeName, adminNotes, canManage }: {
  id: string; status: EnquiryStatus; nextStates: EnquiryStatus[]; assigneeName: string | null; adminNotes: string | null; canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState(adminNotes ?? "");
  const [msg, setMsg] = useState("");

  const post = async (body: Record<string, unknown>): Promise<boolean> => {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/admin/enquiries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) });
      const d = await r.json().catch(() => ({}));
      setBusy(false);
      if (!r.ok || d.ok === false) { setMsg(d.error ?? d.reason ?? "Failed"); return false; }
      startTransition(() => router.refresh());
      return true;
    } catch { setBusy(false); setMsg("Network error"); return false; }
  };

  if (!canManage) return <p className="admin__muted">You need the <span className="admin__mono">enquiries.manage</span> capability (manager+) to act on this enquiry.</p>;

  return (
    <div className="enq-manage">
      <div className="enq-manage__row">
        <span className="enq-manage__label">Status</span>
        <select value="" disabled={busy || pending} onChange={(e) => e.target.value && post({ action: "status", status: e.target.value })} aria-label="Change status">
          <option value="">{ENQUIRY_STATUS_LABEL[status]} — change to…</option>
          {nextStates.map((s) => <option key={s} value={s}>{ENQUIRY_STATUS_LABEL[s]}</option>)}
        </select>
      </div>
      <div className="enq-manage__row">
        <span className="enq-manage__label">Assignment</span>
        <span>{assigneeName ? `Assigned to ${assigneeName}` : "Unassigned"}</span>
        <button type="button" className="ff-btn" disabled={busy || pending} onClick={() => post({ action: "assign", assignTo: "me" })}>Assign to me</button>
        {assigneeName ? <button type="button" className="ff-btn" disabled={busy || pending} onClick={() => post({ action: "assign", assignTo: null })}>Unassign</button> : null}
      </div>
      <label className="enq-manage__notes">
        <span className="enq-manage__label">Internal notes</span>
        <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Visible to staff only" />
      </label>
      <div className="enq-manage__foot">
        <button type="button" className="ff-btn ff-btn--primary" disabled={busy || pending} onClick={() => post({ action: "note", adminNotes: notes })}>{busy ? "Saving…" : "Save notes"}</button>
        {msg ? <span className="ff-err" role="alert">{msg}</span> : null}
      </div>
    </div>
  );
}
