"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Add an internal (staff-only) note to a shipment — "customer unavailable", "delay due to rain",
 * "courier strike" (review priority 2.10). Posts to /api/admin/shipments/note, which records it on
 * the audit stream; existing notes render from that stream. No customer-facing note here by design.
 */
export function ShipmentNote({ shipmentId }: { shipmentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState(false);

  const save = async () => {
    if (!note.trim()) return;
    setBusy(true); setMsg(""); setErr(false);
    try {
      const res = await fetch("/api/admin/shipments/note", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shipmentId, note: note.trim() }) });
      const d = await res.json().catch(() => ({}));
      setBusy(false);
      if (!res.ok) { setErr(true); setMsg(d.error ?? "Failed"); return; }
      setNote(""); setMsg("Saved"); startTransition(() => router.refresh());
    } catch { setBusy(false); setErr(true); setMsg("Network error"); }
  };

  return (
    <div className="ship-note">
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Internal note — staff only (e.g. customer unavailable, neighbour accepted, delay due to rain)" />
      <div className="ship-note__row">
        <button type="button" className="ff-btn ff-btn--primary" disabled={busy || !note.trim()} onClick={save}>{busy ? "Saving…" : "Add note"}</button>
        {msg ? <span className={err ? "ff-error" : "ff-done"}>{msg}</span> : null}
        {pending ? <span className="ff-refreshing">refreshing…</span> : null}
      </div>
    </div>
  );
}
