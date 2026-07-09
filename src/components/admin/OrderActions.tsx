"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Commercial actions for one order (SLP principles 7–9). Cancel opens a CONFIRM
 * dialog (reason required, optional restock + refund) — never a one-click destroy.
 * Refund is a distinct action. Both are manager+ only: the page renders this
 * component solely for that role, and the APIs re-check server-side.
 */
const CANCELLABLE = new Set(["pending", "confirmed", "processing", "packed"]);
const REFUNDABLE_PAYMENT = new Set(["paid", "partially_refunded"]);

export function OrderActions({
  orderNumber,
  status,
  paymentStatus,
  total,
  refundAmount,
  hasPayment,
}: {
  orderNumber: string;
  status: string;
  paymentStatus: string;
  total: number;
  refundAmount: number;
  hasPayment: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [dialog, setDialog] = useState<null | "cancel" | "refund">(null);

  const paid = REFUNDABLE_PAYMENT.has(paymentStatus);
  const remaining = Math.max(0, total - refundAmount);
  const canCancel = CANCELLABLE.has(status);
  const canRefund = paid && remaining > 0;

  // Cancel dialog fields
  const [reason, setReason] = useState("");
  const [release, setRelease] = useState(true);
  const [doRefund, setDoRefund] = useState(paid);
  // Refund dialog fields
  const [refundAmt, setRefundAmt] = useState(remaining.toFixed(2));
  const [refundReason, setRefundReason] = useState("");

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
      setDialog(null);
      startTransition(() => router.refresh());
    } catch {
      setErr("Network error");
    }
    setBusy(null);
  };

  const submitCancel = () => {
    if (!reason.trim()) {
      setErr("A reason is required.");
      return;
    }
    post(
      "/api/admin/orders/cancel",
      { orderNumber, reason: reason.trim(), releaseInventory: release, issueRefund: doRefund && paid },
      "cancel",
    );
  };

  const submitRefund = () => {
    const amt = Number(refundAmt);
    if (!Number.isFinite(amt) || amt <= 0) {
      setErr("Enter a valid amount.");
      return;
    }
    post("/api/admin/orders/refund", { orderNumber, amount: amt, reason: refundReason.trim() || undefined }, "refund");
  };

  if (status === "cancelled") {
    return <span className="admin__muted">Cancelled{refundAmount > 0 ? ` · ₹${refundAmount.toFixed(2)} refunded` : ""}</span>;
  }

  return (
    <div className="ff-actions">
      {canCancel ? (
        <button type="button" className="ff-btn ff-btn--danger" disabled={disabled} onClick={() => setDialog("cancel")}>
          Cancel
        </button>
      ) : null}
      {canRefund ? (
        <button type="button" className="ff-btn" disabled={disabled} onClick={() => { setRefundAmt(remaining.toFixed(2)); setDialog("refund"); }}>
          Refund
        </button>
      ) : null}
      {!canCancel && !canRefund ? <span className="admin__muted">—</span> : null}
      {pending ? <span className="ff-refreshing">updating…</span> : null}
      {err && !dialog ? <span className="ff-err">{err}</span> : null}

      {dialog === "cancel" ? (
        <div className="om-modal" role="dialog" aria-modal="true" onClick={() => !disabled && setDialog(null)}>
          <div className="om-modal__card" onClick={(e) => e.stopPropagation()}>
            <h2 className="om-modal__title">Cancel order {orderNumber}</h2>
            <p className="om-modal__note">This stops the order. Cancelling does not refund on its own — choose below.</p>
            <label className="om-field">
              <span>Reason</span>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Why is this order being cancelled?" />
            </label>
            <label className="om-check">
              <input type="checkbox" checked={release} onChange={(e) => setRelease(e.target.checked)} />
              <span>Release inventory (restock the items)</span>
            </label>
            {paid ? (
              <label className="om-check">
                <input type="checkbox" checked={doRefund} onChange={(e) => setDoRefund(e.target.checked)} />
                <span>Issue refund of ₹{remaining.toFixed(2)}{hasPayment ? " to the original payment" : " (manual — no online payment on file)"}</span>
              </label>
            ) : (
              <p className="om-modal__note">No captured payment — nothing to refund.</p>
            )}
            {err ? <p className="ff-err">{err}</p> : null}
            <div className="om-modal__actions">
              <button type="button" className="ff-btn" disabled={disabled} onClick={() => setDialog(null)}>Keep order</button>
              <button type="button" className="ff-btn ff-btn--danger" disabled={disabled} onClick={submitCancel}>
                {busy === "cancel" ? "Cancelling…" : "Confirm cancellation"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {dialog === "refund" ? (
        <div className="om-modal" role="dialog" aria-modal="true" onClick={() => !disabled && setDialog(null)}>
          <div className="om-modal__card" onClick={(e) => e.stopPropagation()}>
            <h2 className="om-modal__title">Refund order {orderNumber}</h2>
            <p className="om-modal__note">Remaining refundable: ₹{remaining.toFixed(2)}{hasPayment ? "" : " (manual — no online payment on file)"}.</p>
            <label className="om-field">
              <span>Amount (₹)</span>
              <input type="number" min="0" step="0.01" value={refundAmt} onChange={(e) => setRefundAmt(e.target.value)} />
            </label>
            <label className="om-field">
              <span>Reason (optional)</span>
              <input value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="e.g. goodwill, damaged item" />
            </label>
            {err ? <p className="ff-err">{err}</p> : null}
            <div className="om-modal__actions">
              <button type="button" className="ff-btn" disabled={disabled} onClick={() => setDialog(null)}>Close</button>
              <button type="button" className="ff-btn ff-btn--primary" disabled={disabled} onClick={submitRefund}>
                {busy === "refund" ? "Refunding…" : "Issue refund"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
