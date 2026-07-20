"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RESOLUTIONS, INSPECTION_RESULTS, WAREHOUSE_DECISIONS, DAMAGE_GRADES, REFUND_METHODS, labelOf } from "@/lib/returns/resolution";

/**
 * Resolution-Center setters for one return. Each section saves independently to
 * /api/admin/returns/update. Financial decisions (resolution / refund method / customer message)
 * are shown only to approve-capable staff; inspection / warehouse / damage / internal note to
 * operate-capable staff. The API re-enforces the same split.
 *
 * Two safety rails (review priorities 1, 2, 7):
 *  - `locked` (return already settled) disables the resolution + refund-method setters; the API
 *    rejects the change too, so a stale tab can't slip one through.
 *  - The three expensive decisions — resolution, warehouse decision, refund method — go through a
 *    confirm dialog before they save. "Refund Only → Replacement Only" is a costly slip otherwise.
 */
interface Current {
  resolution: string; resolutionReason: string; refundMethod: string;
  inspectionResult: string; inspectionNote: string;
  warehouseDecision: string; damage: string;
  internalNote: string; customerMessage: string;
}

type Pending = { key: string; fields: Record<string, unknown>; detail: string };

export function ReturnManage({ returnId, current, canApprove, canOperate, locked = false }: { returnId: string; current: Current; canApprove: boolean; canOperate: boolean; locked?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [confirm, setConfirm] = useState<Pending | null>(null);

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

  // Route the three high-stakes decisions through confirmation; everything else saves directly.
  const ask = (key: string, fields: Record<string, unknown>, detail: string) => setConfirm({ key, fields, detail });
  const runConfirm = () => { if (!confirm) return; const c = confirm; setConfirm(null); save(c.key, c.fields); };

  return (
    <section className="od-section">
      <h2 className="od-card__title">Manage</h2>

      {locked ? <p className="rman__lock">🔒 Resolution locked — this return has settled (refund paid / replacement shipped / closed). Resolution &amp; refund method can&apos;t be changed.</p> : null}

      <div className="rman">
        {canApprove ? (
          <>
            <div className="rman__row">
              <label className="rman__label">Resolution</label>
              <select value={resolution} onChange={(e) => setResolution(e.target.value)} disabled={locked}>
                <option value="">— not decided —</option>
                {RESOLUTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <input value={resolutionReason} onChange={(e) => setResolutionReason(e.target.value)} placeholder="Reason (e.g. return cost exceeds product value)" disabled={locked} />
              <button type="button" className="ff-btn ff-btn--primary" disabled={locked || busy !== null || (resolution === current.resolution && resolutionReason === current.resolutionReason)} onClick={() => ask("res", { resolution, resolutionReason }, `Set resolution to “${labelOf(RESOLUTIONS, resolution) || "not decided"}”.`)}>{busy === "res" ? "…" : "Set"}</button>
            </div>
            <div className="rman__row">
              <label className="rman__label">Refund method</label>
              <select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)} disabled={locked}>
                <option value="">—</option>
                {REFUND_METHODS.map((o) => <option key={o.value} value={o.value} disabled={!o.enabled}>{o.label}{!o.enabled ? " (disabled)" : ""}</option>)}
              </select>
              <button type="button" className="ff-btn" disabled={locked || busy !== null || refundMethod === current.refundMethod} onClick={() => ask("rm", { refundMethod }, `Set refund method to “${labelOf(REFUND_METHODS, refundMethod) || "—"}”.`)}>{busy === "rm" ? "…" : "Set"}</button>
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
              <button type="button" className="ff-btn" disabled={busy !== null || warehouseDecision === current.warehouseDecision} onClick={() => ask("wh", { warehouseDecision }, `Set warehouse decision to “${labelOf(WAREHOUSE_DECISIONS, warehouseDecision) || "—"}”.`)}>{busy === "wh" ? "…" : "Set"}</button>
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

      {confirm ? (
        <div className="cf" role="dialog" aria-modal="true" onClick={() => setConfirm(null)}>
          <div className="cf__box" onClick={(e) => e.stopPropagation()}>
            <h3 className="cf__title">Confirm change</h3>
            <p className="cf__detail">{confirm.detail}</p>
            <p className="cf__warn">This action affects the customer&apos;s resolution. Continue?</p>
            <div className="cf__actions">
              <button type="button" className="ff-btn" onClick={() => setConfirm(null)}>Cancel</button>
              <button type="button" className="ff-btn ff-btn--primary" onClick={runConfirm}>Confirm</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
