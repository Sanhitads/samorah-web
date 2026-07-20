"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RESOLUTIONS, INSPECTION_RESULTS, WAREHOUSE_DECISIONS, DAMAGE_GRADES, REFUND_METHODS } from "@/lib/returns/resolution";

/**
 * Resolution-Center setters for one return. Each section saves independently to
 * /api/admin/returns/update. Financial decisions (resolution / refund method / customer message)
 * are shown only to approve-capable staff; inspection / warehouse / damage / internal note to
 * operate-capable staff. The API re-enforces the same split.
 */
interface Current {
  resolution: string; resolutionReason: string; refundMethod: string;
  inspectionResult: string; inspectionNote: string;
  warehouseDecision: string; damage: string;
  internalNote: string; customerMessage: string;
}

export function ReturnManage({ returnId, current, canApprove, canOperate }: { returnId: string; current: Current; canApprove: boolean; canOperate: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const [resolution, setResolution] = useState(current.resolution);
  const [resolutionReason, setResolutionReason] = useState(current.resolutionReason);
  const [refundMethod, setRefundMethod] = useState(current.refundMethod);
  const [inspectionResult, setInspectionResult] = useState(current.inspectionResult);
  const [inspectionNote, setInspectionNote] = useState(current.inspectionNote);
  const [warehouseDecision, setWarehouseDecision] = useState(current.warehouseDecision);
  const [damage, setDamage] = useState(current.damage);
  const [internalNote, setInternalNote] = useState(current.internalNote);
  const [customerMessage, setCustomerMessage] = useState(current.customerMessage);

  const save = async (key: string, fields: Record<string, unknown>) => {
    setBusy(key); setMsg("");
    try {
      const res = await fetch("/api/admin/returns/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ returnId, ...fields }) });
      const d = await res.json();
      setBusy(null);
      if (!res.ok) { setMsg(d.error ?? "Failed"); return; }
      setMsg("Saved"); startTransition(() => router.refresh());
    } catch { setBusy(null); setMsg("Network error"); }
  };

  return (
    <section className="od-section">
      <h2 className="od-card__title">Manage</h2>
      <div className="rman">
        {canApprove ? (
          <>
            <div className="rman__row">
              <label className="rman__label">Resolution</label>
              <select value={resolution} onChange={(e) => setResolution(e.target.value)}>
                <option value="">— not decided —</option>
                {RESOLUTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <input value={resolutionReason} onChange={(e) => setResolutionReason(e.target.value)} placeholder="Reason (e.g. return cost exceeds product value)" />
              <button type="button" className="ff-btn ff-btn--primary" disabled={busy !== null || (resolution === current.resolution && resolutionReason === current.resolutionReason)} onClick={() => save("res", { resolution, resolutionReason })}>{busy === "res" ? "…" : "Set"}</button>
            </div>
            <div className="rman__row">
              <label className="rman__label">Refund method</label>
              <select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)}>
                <option value="">—</option>
                {REFUND_METHODS.map((o) => <option key={o.value} value={o.value} disabled={!o.enabled}>{o.label}{!o.enabled ? " (disabled)" : ""}</option>)}
              </select>
              <button type="button" className="ff-btn" disabled={busy !== null || refundMethod === current.refundMethod} onClick={() => save("rm", { refundMethod })}>{busy === "rm" ? "…" : "Set"}</button>
            </div>
          </>
        ) : null}

        {canOperate ? (
          <>
            <div className="rman__row">
              <label className="rman__label">Inspection</label>
              <select value={inspectionResult} onChange={(e) => setInspectionResult(e.target.value)}>
                <option value="">—</option>
                {INSPECTION_RESULTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <input value={inspectionNote} onChange={(e) => setInspectionNote(e.target.value)} placeholder="Note (e.g. wax melted, broken jar)" />
              <button type="button" className="ff-btn" disabled={busy !== null} onClick={() => save("insp", { inspectionResult, inspectionNote })}>{busy === "insp" ? "…" : "Set"}</button>
            </div>
            <div className="rman__row">
              <label className="rman__label">Warehouse decision</label>
              <select value={warehouseDecision} onChange={(e) => setWarehouseDecision(e.target.value)}>
                <option value="">—</option>
                {WAREHOUSE_DECISIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <button type="button" className="ff-btn" disabled={busy !== null || warehouseDecision === current.warehouseDecision} onClick={() => save("wh", { warehouseDecision })}>{busy === "wh" ? "…" : "Set"}</button>
            </div>
            <div className="rman__row">
              <label className="rman__label">Damage grade</label>
              <select value={damage} onChange={(e) => setDamage(e.target.value)}>
                <option value="">—</option>
                {DAMAGE_GRADES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <button type="button" className="ff-btn" disabled={busy !== null || damage === current.damage} onClick={() => save("dmg", { damage })}>{busy === "dmg" ? "…" : "Set"}</button>
            </div>
          </>
        ) : null}

        <div className="rman__notes">
          <label className="rman__label">Internal note <em className="om-field__hint">— staff only, never sent</em></label>
          <textarea value={internalNote} onChange={(e) => setInternalNote(e.target.value)} rows={2} />
          {canApprove ? (
            <>
              <label className="rman__label">Customer message <em className="om-field__hint">— visible to the customer</em></label>
              <textarea value={customerMessage} onChange={(e) => setCustomerMessage(e.target.value)} rows={2} />
            </>
          ) : null}
          <button type="button" className="ff-btn" disabled={busy !== null} onClick={() => save("notes", canApprove ? { internalNote, customerMessage } : { internalNote })}>{busy === "notes" ? "…" : "Save notes"}</button>
        </div>

        {msg ? <span className="ff-done">{msg}</span> : null}
        {pending ? <span className="ff-refreshing">refreshing…</span> : null}
      </div>
    </section>
  );
}
