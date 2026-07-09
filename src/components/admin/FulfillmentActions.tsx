"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FulfillmentStatus } from "@/lib/fulfillment/state";

const ACTION_LABEL: Record<string, string> = {
  picking: "Start Picking",
  picked: "Mark Picked",
  packing: "Start Packing",
  packed: "Mark Packed",
  qc_passed: "Pass QC",
  qc_failed: "Fail QC",
  ready_for_dispatch: "Mark Ready",
};
const SHIPMENT_DRIVEN = new Set<FulfillmentStatus>(["courier_assigned", "picked_up", "shipped"]);
const SECONDARY = new Set<FulfillmentStatus>(["on_hold", "cancelled"]);
const DISPATCHED = new Set(["picked_up", "in_transit", "out_for_delivery", "delivered", "shipped"]);

export function FulfillmentActions({
  orderNumber,
  fulfillmentStatus,
  nextStates,
  shipmentStatus,
  holdReason,
}: {
  orderNumber: string;
  fulfillmentStatus: FulfillmentStatus;
  nextStates: FulfillmentStatus[];
  shipmentStatus: string | null;
  holdReason: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [more, setMore] = useState(false);
  const [holdInput, setHoldInput] = useState(false);
  const [reason, setReason] = useState("");
  const disabled = busy !== null || pending;

  const post = async (url: string, body: Record<string, unknown>, key: string) => {
    setBusy(key);
    setErr("");
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok) {
        setErr(d.error ?? "Failed");
        setBusy(null);
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setErr("Network error");
    }
    setBusy(null);
  };

  const advance = (to: FulfillmentStatus) => post("/api/admin/fulfillment/advance", { orderNumber, to }, to);
  const createShipment = () => post("/api/admin/fulfillment/create-shipment", { orderNumber }, "ship");
  const dispatch = () => post("/api/admin/fulfillment/dispatch", { orderNumber }, "dispatch");
  const resume = () => post("/api/admin/fulfillment/hold", { orderNumber, resume: true }, "resume");
  const confirmHold = () => post("/api/admin/fulfillment/hold", { orderNumber, reason }, "hold");
  const cancel = () => post("/api/admin/fulfillment/advance", { orderNumber, to: "cancelled" }, "cancelled");

  // ── On Hold view — badge + reason + a single Resume ──
  if (fulfillmentStatus === "on_hold") {
    return (
      <div className="ff-actions">
        <span className="ff-hold-badge">On Hold{holdReason ? ` · ${holdReason}` : ""}</span>
        <button type="button" disabled={disabled} onClick={resume} className="ff-btn ff-btn--primary">
          {busy === "resume" ? "…" : "Resume"}
        </button>
        {pending ? <span className="ff-refreshing">updating…</span> : null}
        {err ? <span className="ff-err">{err}</span> : null}
      </div>
    );
  }

  const forwardNext = nextStates.filter((s) => !SHIPMENT_DRIVEN.has(s) && !SECONDARY.has(s));
  const canCreateShipment = fulfillmentStatus === "ready_for_dispatch" && !shipmentStatus;
  const canHold = nextStates.includes("on_hold");
  const canCancel = nextStates.includes("cancelled");

  return (
    <div className="ff-actions">
      {forwardNext.map((s) => (
        <button key={s} type="button" disabled={disabled} onClick={() => advance(s)} className="ff-btn">
          {busy === s ? "…" : ACTION_LABEL[s] ?? s}
        </button>
      ))}
      {canCreateShipment ? (
        <button type="button" disabled={disabled} onClick={createShipment} className="ff-btn ff-btn--primary">
          {busy === "ship" ? "…" : "Create Shipment"}
        </button>
      ) : null}
      {shipmentStatus === "courier_assigned" ? (
        <button type="button" disabled={disabled} onClick={dispatch} className="ff-btn ff-btn--primary">
          {busy === "dispatch" ? "…" : "Dispatch"}
        </button>
      ) : null}
      {shipmentStatus && DISPATCHED.has(shipmentStatus) ? <span className="ff-done">✓ Dispatched</span> : null}

      {canHold || canCancel ? (
        <button type="button" className="ff-more-toggle" disabled={disabled} aria-label="More actions" onClick={() => { setMore((m) => !m); setHoldInput(false); }}>
          ⋯
        </button>
      ) : null}

      {more ? (
        <div className="ff-more">
          {canHold && !holdInput ? (
            <button type="button" className="ff-more__item" onClick={() => setHoldInput(true)}>Hold</button>
          ) : null}
          {canHold && holdInput ? (
            <span className="ff-hold-form">
              <input
                className="ff-hold-input"
                placeholder="Reason (optional)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { confirmHold(); setMore(false); } }}
              />
              <button type="button" className="ff-btn" disabled={disabled} onClick={() => { confirmHold(); setMore(false); }}>
                {busy === "hold" ? "…" : "Confirm Hold"}
              </button>
            </span>
          ) : null}
          {canCancel ? (
            <button type="button" className="ff-more__item ff-more__item--danger" disabled={disabled} onClick={() => { cancel(); setMore(false); }}>
              Cancel Order
            </button>
          ) : null}
        </div>
      ) : null}

      {pending ? <span className="ff-refreshing">updating…</span> : null}
      {err ? <span className="ff-err">{err}</span> : null}
    </div>
  );
}
