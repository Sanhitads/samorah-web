"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ShipmentStatus } from "@/lib/shipment/state";

const LABEL: Record<string, string> = {
  ready_to_ship: "Ready to Ship",
  shipment_created: "Created",
  courier_assigned: "Assign Courier",
  label_generated: "Generate Label",
  pickup_scheduled: "Schedule Pickup",
  picked_up: "Mark Picked Up",
  in_transit: "Mark In Transit",
  out_for_delivery: "Out for Delivery",
  delivered: "Mark Delivered",
  exception: "Report Exception",
  rto: "Mark RTO",
  cancelled: "Cancel Shipment",
};
const SECONDARY = new Set<ShipmentStatus>(["exception", "rto", "cancelled"]);

export function ShipmentActions({
  shipmentId,
  status,
  nextStates,
  hasLabel,
  providerShipmentId,
}: {
  shipmentId: string;
  status: ShipmentStatus;
  nextStates: ShipmentStatus[];
  hasLabel: boolean;
  providerShipmentId?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [dialog, setDialog] = useState<null | "delivered" | "exception" | "rto">(null);
  const [recipient, setRecipient] = useState("");
  const [note, setNote] = useState("");
  const [rtoReason, setRtoReason] = useState("");
  const disabled = busy !== null || pending;

  const post = async (url: string, body: Record<string, unknown>, key: string) => {
    setBusy(key);
    setErr("");
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok) { setErr(d.error ?? "Failed"); setBusy(null); return; }
      setDialog(null);
      startTransition(() => router.refresh());
    } catch { setErr("Network error"); }
    setBusy(null);
  };

  const advance = (to: ShipmentStatus) => {
    if (to === "delivered") { setDialog("delivered"); return; }
    if (to === "exception") { setDialog("exception"); return; }
    if (to === "rto") { setDialog("rto"); return; } // confirm + reason before RTO (priority 1.7)
    if (to === "cancelled") { post("/api/admin/shipments/cancel", { shipmentId }, "cancelled"); return; }
    post("/api/admin/shipments/advance", { shipmentId, to }, to);
  };

  const forward = nextStates.filter((s) => !SECONDARY.has(s));
  // Exception is a neutral report action (grey); RTO / cancel are destructive (red) — priority note.
  const exception = nextStates.includes("exception");
  const dangers = nextStates.filter((s) => s === "rto" || s === "cancelled");

  return (
    <div className="ff-actions">
      {forward.map((s) => (
        <button key={s} type="button" disabled={disabled} onClick={() => advance(s)} className="ff-btn ff-btn--primary">
          {busy === s ? "…" : LABEL[s] ?? s}
        </button>
      ))}
      {exception ? (
        <button type="button" disabled={disabled} onClick={() => advance("exception")} className="ff-btn">
          {busy === "exception" ? "…" : LABEL.exception}
        </button>
      ) : null}
      {dangers.map((s) => (
        <button key={s} type="button" disabled={disabled} onClick={() => advance(s)} className="ff-btn ff-btn--danger">
          {busy === s ? "…" : LABEL[s] ?? s}
        </button>
      ))}
      {providerShipmentId ? (
        <button type="button" disabled={disabled} onClick={() => post("/api/admin/shipments/label", { shipmentId }, "label")} className="ff-btn">
          {busy === "label" ? "…" : hasLabel ? "Re-label" : "Label"}
        </button>
      ) : null}
      {!nextStates.length ? <span className="ff-done">✓ {status === "delivered" ? "Delivered" : status === "rto" ? "RTO" : "Closed"}</span> : null}
      {pending ? <span className="ff-refreshing">updating…</span> : null}
      {err && !dialog ? <span className="ff-err">{err}</span> : null}

      {dialog === "delivered" ? (
        <div className="om-modal" role="dialog" aria-modal="true" onClick={() => !disabled && setDialog(null)}>
          <div className="om-modal__card" onClick={(e) => e.stopPropagation()}>
            <h2 className="om-modal__title">Mark delivered — proof of delivery</h2>
            <label className="om-field"><span>Received by (optional)</span>
              <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="e.g. customer, security, neighbour" />
            </label>
            <label className="om-field"><span>Note (optional)</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. left at reception" />
            </label>
            {err ? <p className="ff-err">{err}</p> : null}
            <div className="om-modal__actions">
              <button type="button" className="ff-btn" disabled={disabled} onClick={() => setDialog(null)}>Cancel</button>
              <button type="button" className="ff-btn ff-btn--primary" disabled={disabled} onClick={() => post("/api/admin/shipments/advance", { shipmentId, to: "delivered", recipient: recipient.trim() || undefined, description: note.trim() || undefined }, "delivered")}>
                {busy === "delivered" ? "Saving…" : "Confirm delivery"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {dialog === "exception" ? (
        <div className="om-modal" role="dialog" aria-modal="true" onClick={() => !disabled && setDialog(null)}>
          <div className="om-modal__card" onClick={(e) => e.stopPropagation()}>
            <h2 className="om-modal__title">Report a delivery exception</h2>
            <p className="om-modal__note">NDR — the parcel couldn't be delivered. From here you can reattempt (Out for Delivery) or send it RTO.</p>
            <label className="om-field"><span>Reason</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. customer unavailable, address not found" />
            </label>
            {err ? <p className="ff-err">{err}</p> : null}
            <div className="om-modal__actions">
              <button type="button" className="ff-btn" disabled={disabled} onClick={() => setDialog(null)}>Cancel</button>
              <button type="button" className="ff-btn ff-btn--danger" disabled={disabled} onClick={() => post("/api/admin/shipments/advance", { shipmentId, to: "exception", reason: note.trim() || undefined }, "exception")}>
                {busy === "exception" ? "Saving…" : "Record exception"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {dialog === "rto" ? (
        <div className="om-modal" role="dialog" aria-modal="true" onClick={() => !disabled && setDialog(null)}>
          <div className="om-modal__card" onClick={(e) => e.stopPropagation()}>
            <h2 className="om-modal__title">Mark Return to Origin (RTO)</h2>
            <p className="om-modal__note">RTO is terminal — the parcel is coming back and the order moves to <b>rto</b>. Record why, so finance and support have the context.</p>
            <label className="om-field"><span>Reason</span>
              <input value={rtoReason} onChange={(e) => setRtoReason(e.target.value)} placeholder="e.g. 3 delivery attempts failed, customer unreachable" />
            </label>
            <label className="om-field"><span>Internal note (optional)</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. customer asked to cancel on call" />
            </label>
            {err ? <p className="ff-err">{err}</p> : null}
            <div className="om-modal__actions">
              <button type="button" className="ff-btn" disabled={disabled} onClick={() => setDialog(null)}>Cancel</button>
              <button type="button" className="ff-btn ff-btn--danger" disabled={disabled || !rtoReason.trim()} onClick={() => post("/api/admin/shipments/advance", { shipmentId, to: "rto", reason: rtoReason.trim(), description: note.trim() || undefined }, "rto")}>
                {busy === "rto" ? "Saving…" : "Confirm RTO"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
