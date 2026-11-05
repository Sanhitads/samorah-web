"use client";

import { useState } from "react";

/**
 * Phase 8 — batch provenance panel for the Admin Fulfillment detail screen. Shows, per order line, the
 * allocated vs. actual manufacturing batch, picked/remaining quantities and any blocking reason, and lets
 * an operator confirm the ACTUAL picked batch (a different eligible batch = an audited substitution with a
 * reason). Prop-driven: the parent fetches entitlements + pick confirmations; actions post to
 * /api/admin/fulfillment/batch. Inert for untracked orders (no tracked lines → nothing to confirm).
 */
export interface EntitlementItem {
  order_item_id: string; variant_id: string; is_bundle: boolean;
  ordered: number; allocated: number; picked_qty: number; picked_confirmed: number;
  shipped: number; refunded_identifiable: number; remaining_fulfillable: number;
}
export interface Entitlements { order_id: string; order_blocked: boolean; block_reason: string | null; items: EntitlementItem[] }
export interface PickRow { order_item_id: string; batch_id: string; qty: number; is_substitution: boolean; allocated_batch_id: string | null; reason: string | null }
export interface ShipRow { order_item_id: string; batch_id: string; qty: number }

const BLOCK_LABEL: Record<string, string> = {
  allocation_exception: "An unresolved stock-allocation exception must be cleared first.",
  cancelled: "This order is cancelled — it cannot be fulfilled.",
  fully_refunded: "This order is fully refunded — it cannot be shipped.",
  ambiguous_partial_refund: "A partial refund isn't allocated to specific lines — allocate it before fulfilling.",
};

export function BatchProvenancePanel({
  orderId, orderNumber, entitlements, picks, shipped, onChanged,
}: {
  orderId: string; orderNumber: string;
  entitlements: Entitlements; picks: PickRow[]; shipped: ShipRow[];
  onChanged?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState<Record<string, { batchId: string; qty: string; reason: string }>>({});

  const picksFor = (oi: string) => picks.filter((p) => p.order_item_id === oi);

  async function confirm(oi: string) {
    const dd = draft[oi];
    if (!dd?.batchId || !dd.qty) { setErr("Enter a batch code and quantity."); return; }
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/admin/fulfillment/batch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm_pick", orderItemId: oi, batchId: dd.batchId, qty: Number(dd.qty), reason: dd.reason || undefined }),
      });
      const d = await res.json();
      setBusy(false);
      if (!res.ok || !d.ok) { setErr(d.error ?? "Could not confirm the pick."); return; }
      setDraft((p) => ({ ...p, [oi]: { batchId: "", qty: "", reason: "" } }));
      onChanged?.();
    } catch { setBusy(false); setErr("Network error."); }
  }

  return (
    <section className="admin__card" aria-label="Batch provenance">
      <h3 className="admin__section">Batch provenance · {orderNumber}</h3>

      {entitlements.order_blocked ? (
        <p className="ff-err" role="alert">Blocked: {BLOCK_LABEL[entitlements.block_reason ?? ""] ?? entitlements.block_reason}</p>
      ) : (
        <p className="admin__note">Confirm the actual manufacturing batch of each picked unit. A different eligible batch is recorded as an audited substitution.</p>
      )}

      <ul className="pick-list">
        {entitlements.items.map((it) => {
          const dd = draft[it.order_item_id] ?? { batchId: "", qty: "", reason: "" };
          const rem = it.remaining_fulfillable;
          return (
            <li key={it.order_item_id} className="pick-row" data-done={it.picked_confirmed >= rem && rem > 0 ? "1" : undefined}>
              <span className="pick-row__name">
                Line {it.is_bundle ? "(bundle)" : ""}
                <span className="admin__muted"> · ordered {it.ordered} · allocated {it.allocated} · picked {it.picked_confirmed} · shipped {it.shipped}
                  {it.refunded_identifiable > 0 ? ` · refunded ${it.refunded_identifiable}` : ""} · remaining {rem}</span>
              </span>
              <span className="pick-row__prov">
                {picksFor(it.order_item_id).map((p, i) => (
                  <span key={i} className={p.is_substitution ? "prov-chip prov-chip--sub" : "prov-chip"}>
                    {p.batch_id.slice(0, 8)} × {p.qty}{p.is_substitution ? " (subst.)" : ""}
                  </span>
                ))}
              </span>
              {!entitlements.order_blocked && it.picked_confirmed < rem ? (
                <span className="pick-row__ctl">
                  <input className="admin__input" placeholder="actual batch id" value={dd.batchId}
                    onChange={(e) => setDraft((p) => ({ ...p, [it.order_item_id]: { ...dd, batchId: e.target.value } }))} />
                  <input className="admin__input" type="number" min={1} max={rem - it.picked_confirmed} placeholder="qty" value={dd.qty}
                    onChange={(e) => setDraft((p) => ({ ...p, [it.order_item_id]: { ...dd, qty: e.target.value } }))} />
                  <input className="admin__input" placeholder="substitution reason (if different batch)" value={dd.reason}
                    onChange={(e) => setDraft((p) => ({ ...p, [it.order_item_id]: { ...dd, reason: e.target.value } }))} />
                  <button type="button" className="ff-btn" disabled={busy} onClick={() => confirm(it.order_item_id)}>Confirm</button>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {shipped.length ? (
        <div className="admin__section">
          <h4>Shipped batch summary</h4>
          <ul className="prov-ship">
            {shipped.map((s, i) => (<li key={i}>{s.batch_id.slice(0, 8)} × {s.qty}</li>))}
          </ul>
        </div>
      ) : null}

      {err ? <p className="ff-err">{err}</p> : null}
    </section>
  );
}
