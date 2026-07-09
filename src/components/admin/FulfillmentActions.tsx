"use client";

import { useState } from "react";
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
  on_hold: "Hold",
  cancelled: "Cancel",
};
const SHIPMENT_DRIVEN = new Set<FulfillmentStatus>(["courier_assigned", "picked_up", "shipped"]);

export function FulfillmentActions({
  orderNumber,
  fulfillmentStatus,
  nextStates,
  shipmentStatus,
}: {
  orderNumber: string;
  fulfillmentStatus: FulfillmentStatus;
  nextStates: FulfillmentStatus[];
  shipmentStatus: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

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
      router.refresh();
    } catch {
      setErr("Network error");
    }
    setBusy(null);
  };

  const advance = (to: FulfillmentStatus) => post("/api/admin/fulfillment/advance", { orderNumber, to }, to);
  const createShipment = () => post("/api/admin/fulfillment/create-shipment", { orderNumber }, "ship");
  const dispatch = () => post("/api/admin/fulfillment/dispatch", { orderNumber }, "dispatch");

  const manualNext = nextStates.filter((s) => !SHIPMENT_DRIVEN.has(s));

  return (
    <div className="ff-actions">
      {manualNext.map((s) => (
        <button key={s} type="button" disabled={busy !== null} onClick={() => advance(s)} className={`ff-btn${s === "cancelled" ? " ff-btn--danger" : ""}`}>
          {busy === s ? "…" : ACTION_LABEL[s] ?? s}
        </button>
      ))}
      {fulfillmentStatus === "ready_for_dispatch" && !shipmentStatus ? (
        <button type="button" disabled={busy !== null} onClick={createShipment} className="ff-btn ff-btn--primary">
          {busy === "ship" ? "…" : "Create Shipment"}
        </button>
      ) : null}
      {shipmentStatus === "courier_assigned" ? (
        <button type="button" disabled={busy !== null} onClick={dispatch} className="ff-btn ff-btn--primary">
          {busy === "dispatch" ? "…" : "Dispatch"}
        </button>
      ) : null}
      {err ? <span className="ff-err">{err}</span> : null}
    </div>
  );
}
