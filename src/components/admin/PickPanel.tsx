"use client";

import { useEffect, useState } from "react";
import { clampPicked } from "@/lib/fulfillment/pick";

interface PickItem { id: string; name: string; sku: string | null; quantity: number; pickedQty: number; }

/**
 * Per-item pick panel (Priority-1 #2). Opened while an order is in "picking": the operator marks
 * each line picked (± or All), progress persists to order_items.picked_qty, and the order
 * auto-advances to "picked" when every unit is in. Survives an interrupted pick — progress is on the
 * server, not this panel.
 */
export function PickPanel({ orderNumber, onClose, onDone }: { orderNumber: string; onClose: () => void; onDone: () => void }) {
  const [items, setItems] = useState<PickItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/fulfillment/${encodeURIComponent(orderNumber)}/items`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.ok) setItems(d.items); })
      .catch(() => { if (alive) setErr("Could not load items"); });
    return () => { alive = false; };
  }, [orderNumber]);

  const picked = (items ?? []).reduce((s, i) => s + Math.min(i.pickedQty, i.quantity), 0);
  const total = (items ?? []).reduce((s, i) => s + i.quantity, 0);

  const set = async (item: PickItem, requested: number) => {
    const next = clampPicked(requested, item.quantity);
    if (next === item.pickedQty) return;
    setItems((prev) => (prev ?? []).map((i) => (i.id === item.id ? { ...i, pickedQty: next } : i)));
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/admin/fulfillment/pick", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderNumber, itemId: item.id, pickedQty: next }) });
      const d = await res.json();
      setBusy(false);
      if (!res.ok) { setErr(d.error ?? "Failed"); return; }
      if (d.advanced) { onDone(); onClose(); } // fully picked → order moved on
    } catch { setBusy(false); setErr("Network error"); }
  };

  return (
    <div className="om-modal" role="dialog" aria-modal="true" onClick={() => !busy && onClose()}>
      <div className="om-modal__card" onClick={(e) => e.stopPropagation()}>
        <h2 className="om-modal__title">Pick · {orderNumber}</h2>
        <p className="om-modal__note">Mark each line as you pick it. Progress is saved as you go — <b>{picked}/{total}</b> picked.</p>
        {items === null ? <p className="admin__muted">Loading…</p> : null}
        {items?.length === 0 ? <p className="admin__muted">No items.</p> : null}
        <ul className="pick-list">
          {(items ?? []).map((it) => (
            <li key={it.id} className="pick-row" data-done={it.pickedQty >= it.quantity ? "1" : undefined}>
              <span className="pick-row__name">{it.name}{it.sku ? <span className="admin__muted"> · {it.sku}</span> : null}</span>
              <span className="pick-row__ctl">
                <button type="button" className="pick-btn" disabled={busy || it.pickedQty <= 0} onClick={() => set(it, it.pickedQty - 1)} aria-label="one less">−</button>
                <span className="pick-row__n">{it.pickedQty}/{it.quantity}</span>
                <button type="button" className="pick-btn" disabled={busy || it.pickedQty >= it.quantity} onClick={() => set(it, it.pickedQty + 1)} aria-label="one more">+</button>
                <button type="button" className="ff-btn" disabled={busy || it.pickedQty >= it.quantity} onClick={() => set(it, it.quantity)}>All</button>
              </span>
            </li>
          ))}
        </ul>
        {err ? <p className="ff-err">{err}</p> : null}
        <div className="om-modal__actions">
          <button type="button" className="ff-btn" disabled={busy} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
