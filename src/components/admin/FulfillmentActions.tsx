"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FulfillmentStatus } from "@/lib/fulfillment/state";
import { HOLD_REASONS, composeHoldReason } from "@/lib/fulfillment/holdReasons";
import { PickPanel } from "@/components/admin/PickPanel";
import { PackPanel } from "@/components/admin/PackPanel";

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
  const [showPick, setShowPick] = useState(false);
  const [showPack, setShowPack] = useState(false);
  const [reasonValue, setReasonValue] = useState(HOLD_REASONS[0].value);
  const [note, setNote] = useState("");
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
  const confirmHold = () => post("/api/admin/fulfillment/hold", { orderNumber, reason: composeHoldReason(reasonValue, note) }, "hold");
  // No Cancel here — cancellation is a commercial action owned by Order Management
  // (Admin/CS), not the warehouse board (Design Principles 1, 4, 7).

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

  // Happy path stays primary; QC failure is a secondary (⋯) action, not a competing button.
  // "packed" while packing is routed through the checklist panel (the brand gate), not a bare button.
  const forwardNext = nextStates.filter((s) => !SHIPMENT_DRIVEN.has(s) && !SECONDARY.has(s) && s !== "qc_failed" && !(fulfillmentStatus === "packing" && s === "packed"));
  const canCreateShipment = fulfillmentStatus === "ready_for_dispatch" && !shipmentStatus;
  const canHold = nextStates.includes("on_hold");
  const canFailQc = nextStates.includes("qc_failed");

  return (
    <div className="ff-actions">
      {fulfillmentStatus === "picking" ? (
        <button type="button" className="ff-btn" disabled={disabled} onClick={() => setShowPick(true)}>Pick items</button>
      ) : null}
      {fulfillmentStatus === "packing" ? (
        <button type="button" className="ff-btn ff-btn--primary" disabled={disabled} onClick={() => setShowPack(true)}>Packing checklist</button>
      ) : null}
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

      {canHold || canFailQc ? (
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
              <select className="ff-hold-input" value={reasonValue} onChange={(e) => setReasonValue(e.target.value)} aria-label="Hold reason">
                {HOLD_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <input
                className="ff-hold-input"
                placeholder="Note (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { confirmHold(); setMore(false); } }}
              />
              <button type="button" className="ff-btn ff-btn--primary" disabled={disabled} onClick={() => { confirmHold(); setMore(false); }}>
                {busy === "hold" ? "…" : "Confirm Hold"}
              </button>
            </span>
          ) : null}
          {canFailQc ? (
            <button type="button" className="ff-more__item ff-more__item--danger" disabled={disabled} onClick={() => { advance("qc_failed"); setMore(false); }}>
              Fail QC (rework)
            </button>
          ) : null}
        </div>
      ) : null}

      {pending ? <span className="ff-refreshing">updating…</span> : null}
      {err ? <span className="ff-err">{err}</span> : null}

      {showPick ? (
        <PickPanel orderNumber={orderNumber} onClose={() => setShowPick(false)} onDone={() => startTransition(() => router.refresh())} />
      ) : null}
      {showPack ? (
        <PackPanel orderNumber={orderNumber} onClose={() => setShowPack(false)} onDone={() => startTransition(() => router.refresh())} />
      ) : null}
    </div>
  );
}
