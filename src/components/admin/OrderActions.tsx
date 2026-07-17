"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CancelDialog } from "./CancelDialog";
import { RefundDialog } from "./RefundDialog";

/**
 * Commercial actions for one order (SLP principles 7–9). The Cancel and Refund
 * dialogs live in their own components; this just gates the buttons by capability
 * + order state and refreshes the list on success. Both APIs re-check server-side.
 */
const CANCELLABLE = new Set(["pending", "confirmed", "processing", "packed"]);
const REFUNDABLE_PAYMENT = new Set(["paid", "partially_refunded"]);

export function OrderActions({
  orderNumber,
  status,
  paymentStatus,
  paymentMethod = null,
  total,
  refundAmount,
  hasPayment,
  canCancel: canCancelCap = true,
  canRefund: canRefundCap = true,
}: {
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod?: string | null;
  total: number;
  refundAmount: number;
  hasPayment: boolean;
  canCancel?: boolean;
  canRefund?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<null | "cancel" | "refund">(null);

  const paid = REFUNDABLE_PAYMENT.has(paymentStatus);
  const remaining = Math.max(0, total - refundAmount);
  const canCancel = canCancelCap && CANCELLABLE.has(status);
  const canRefund = canRefundCap && paid && remaining > 0;

  const done = () => {
    setDialog(null);
    startTransition(() => router.refresh());
  };

  if (status === "cancelled") {
    return <span className="admin__muted">Cancelled{refundAmount > 0 ? ` · ₹${refundAmount.toFixed(2)} refunded` : ""}</span>;
  }

  return (
    <div className="ff-actions">
      {canCancel ? (
        <button type="button" className="ff-btn ff-btn--danger" disabled={pending} onClick={() => setDialog("cancel")}>Cancel</button>
      ) : null}
      {canRefund ? (
        <button type="button" className="ff-btn" disabled={pending} onClick={() => setDialog("refund")}>Refund</button>
      ) : null}
      {!canCancel && !canRefund ? <span className="admin__muted">—</span> : null}
      {pending ? <span className="ff-refreshing">updating…</span> : null}

      {dialog === "cancel" ? (
        <CancelDialog
          orderNumber={orderNumber}
          status={status}
          total={total}
          remaining={remaining}
          paid={paid}
          hasPayment={hasPayment}
          onClose={() => setDialog(null)}
          onDone={done}
        />
      ) : null}
      {dialog === "refund" ? (
        <RefundDialog
          orderNumber={orderNumber}
          total={total}
          remaining={remaining}
          hasPayment={hasPayment}
          paymentStatus={paymentStatus}
          paymentMethod={paymentMethod}
          onClose={() => setDialog(null)}
          onDone={done}
        />
      ) : null}
    </div>
  );
}
