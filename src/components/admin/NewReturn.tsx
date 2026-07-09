"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const REASONS = [
  { v: "damaged", l: "Damaged" },
  { v: "defective", l: "Defective" },
  { v: "wrong_item", l: "Wrong item" },
  { v: "not_as_described", l: "Not as described" },
  { v: "changed_mind", l: "Changed mind" },
];

/** Open a full return for an order (RMA). Item-level partial returns come later. */
export function NewReturn() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [reason, setReason] = useState("damaged");
  const [returnType, setReturnType] = useState<"refund" | "replacement" | "exchange">("refund");
  const [notes, setNotes] = useState("");

  const submit = async () => {
    if (!orderNumber.trim()) { setErr("Order number is required."); return; }
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/returns/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber: orderNumber.trim(), reason, returnType, notes: notes.trim() || undefined }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error ?? "Failed"); setBusy(false); return; }
      setOpen(false);
      setOrderNumber(""); setNotes("");
      startTransition(() => router.refresh());
    } catch {
      setErr("Network error");
    }
    setBusy(false);
  };

  if (!open) {
    return <button type="button" className="ff-btn ff-btn--primary" onClick={() => setOpen(true)}>New return</button>;
  }

  return (
    <div className="om-modal" role="dialog" aria-modal="true" onClick={() => !busy && setOpen(false)}>
      <div className="om-modal__card" onClick={(e) => e.stopPropagation()}>
        <h2 className="om-modal__title">Open a return</h2>
        <p className="om-modal__note">Creates a full return (RMA) for the order. Refund + restock happen when it settles.</p>
        <label className="om-field"><span>Order number</span>
          <input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="SAM-2026-000007" />
        </label>
        <label className="om-field"><span>Reason</span>
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            {REASONS.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
          </select>
        </label>
        <label className="om-field"><span>Type</span>
          <select value={returnType} onChange={(e) => setReturnType(e.target.value as typeof returnType)}>
            <option value="refund">Refund</option>
            <option value="replacement">Replacement</option>
            <option value="exchange">Exchange</option>
          </select>
        </label>
        <label className="om-field"><span>Notes (optional)</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. wax cracked in transit" />
        </label>
        {err ? <p className="ff-err">{err}</p> : null}
        <div className="om-modal__actions">
          <button type="button" className="ff-btn" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
          <button type="button" className="ff-btn ff-btn--primary" disabled={busy} onClick={submit}>{busy ? "Opening…" : "Open return"}</button>
        </div>
      </div>
    </div>
  );
}
