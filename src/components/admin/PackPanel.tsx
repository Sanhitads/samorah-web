"use client";

import { useEffect, useState } from "react";

interface PackItem { key: string; label: string; done: boolean; }

/**
 * Packing-collateral checklist (Priority-1 #3). Opened while an order is in "packing": the operator
 * checks each brand item, and "Mark Packed" unlocks ONLY when the checklist is complete — the gate
 * that stops an order shipping without its Story Card / Care Card / Gift Box. The advance→packed
 * transition re-enforces this server-side, so the gate can't be bypassed.
 */
export function PackPanel({ orderNumber, onClose, onDone }: { orderNumber: string; onClose: () => void; onDone: () => void }) {
  const [items, setItems] = useState<PackItem[] | null>(null);
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/fulfillment/${encodeURIComponent(orderNumber)}/packing`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.ok) { setItems(d.items); setComplete(d.complete); } })
      .catch(() => { if (alive) setErr("Could not load checklist"); });
    return () => { alive = false; };
  }, [orderNumber]);

  const toggle = async (item: PackItem) => {
    const done = !item.done;
    setItems((prev) => (prev ?? []).map((i) => (i.key === item.key ? { ...i, done } : i)));
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/admin/fulfillment/packing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderNumber, itemKey: item.key, done }) });
      const d = await res.json();
      setBusy(false);
      if (!res.ok) { setErr(d.error ?? "Failed"); return; }
      setComplete(d.complete);
    } catch { setBusy(false); setErr("Network error"); }
  };

  const markPacked = async () => {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/admin/fulfillment/advance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderNumber, to: "packed" }) });
      const d = await res.json();
      setBusy(false);
      if (!res.ok) { setErr(d.error === "packing_checklist_incomplete" ? "Finish the checklist first." : (d.error ?? "Failed")); return; }
      onDone(); onClose();
    } catch { setBusy(false); setErr("Network error"); }
  };

  const doneCount = (items ?? []).filter((i) => i.done).length;
  const total = (items ?? []).length;

  return (
    <div className="om-modal" role="dialog" aria-modal="true" onClick={() => !busy && onClose()}>
      <div className="om-modal__card" onClick={(e) => e.stopPropagation()}>
        <h2 className="om-modal__title">Pack · {orderNumber}</h2>
        <p className="om-modal__note">Check each item before sealing — <b>{doneCount}/{total}</b> ready. Mark Packed unlocks when complete.</p>
        {items === null ? <p className="admin__muted">Loading…</p> : null}
        <ul className="pick-list">
          {(items ?? []).map((it) => (
            <li key={it.key} className="pack-row" data-done={it.done ? "1" : undefined}>
              <label className="pack-row__label"><input type="checkbox" checked={it.done} disabled={busy} onChange={() => toggle(it)} /> {it.label}</label>
            </li>
          ))}
        </ul>
        {err ? <p className="ff-err">{err}</p> : null}
        <div className="om-modal__actions">
          <button type="button" className="ff-btn" disabled={busy} onClick={onClose}>Close</button>
          <button type="button" className="ff-btn ff-btn--primary" disabled={busy || !complete} title={complete ? "" : "Complete the checklist first"} onClick={markPacked}>
            {busy ? "…" : "Mark Packed"}
          </button>
        </div>
      </div>
    </div>
  );
}
