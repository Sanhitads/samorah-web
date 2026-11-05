"use client";

import { useCallback, useEffect, useState } from "react";
import { BatchProvenancePanel, type Entitlements, type PickRow, type ShipRow } from "@/components/admin/BatchProvenancePanel";

/**
 * Modal wrapper that loads batch-provenance data for one order (entitlements + confirmed picks + shipped
 * lines) from /api/admin/fulfillment/batch and renders BatchProvenancePanel. Opened from the Admin
 * Fulfillment board. Handles loading / error / empty (no tracked lines) states.
 */
interface PanelData { orderId: string | null; orderNumber: string; entitlements: Entitlements | null; picks: PickRow[]; shipped: ShipRow[] }

export function BatchProvenanceModal({ orderNumber, onClose }: { orderNumber: string; onClose: () => void }) {
  const [data, setData] = useState<PanelData | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try {
      const res = await fetch("/api/admin/fulfillment/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "panel", orderNumber }) });
      const d = await res.json();
      if (!res.ok || !d.ok) { setErr(d.error ?? "Could not load provenance."); return; }
      setData(d.result as PanelData);
    } catch { setErr("Network error."); }
  }, [orderNumber]);

  useEffect(() => { void load(); }, [load]);

  const tracked = (data?.entitlements?.items ?? []).some((i) => i.tracked);

  return (
    <div className="om-modal" role="dialog" aria-modal="true" aria-label="Batch provenance" onClick={onClose}>
      <div className="om-modal__card" onClick={(e) => e.stopPropagation()}>
        {err ? <p className="ff-err" role="alert">{err}</p> : null}
        {data === null && !err ? <p className="admin__muted">Loading…</p> : null}
        {data && data.entitlements ? (
          !tracked ? (
            <section className="admin__card">
              <h3 className="admin__section">Batch provenance · {orderNumber}</h3>
              <p className="admin__muted">No batch-tracked lines on this order — physical batch confirmation is not required.</p>
            </section>
          ) : (
            <BatchProvenancePanel orderId={data.orderId ?? ""} orderNumber={orderNumber}
              entitlements={data.entitlements} picks={data.picks} shipped={data.shipped} onChanged={load} />
          )
        ) : null}
        <div className="om-modal__actions">
          <button type="button" className="ff-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
