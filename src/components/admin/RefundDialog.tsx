"use client";

import { useState } from "react";
import { useOrderContext } from "@/hooks/useOrderContext";
import { REFUND_TYPES, refundAmountForType, NOTIFY_CHANNELS, type RefundType, type RefundBreakdown } from "@/lib/admin/orderDialogs";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dt = (v: string) => new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Refund dialog (Screen 3). Type presets (Full / Partial / Shipping-only), a money breakdown, the
 * prior-refund history with the remaining balance, gateway/transaction status, a customer-reason /
 * internal-note split, and an already-refunded guard. The DB over-refund guard stays authoritative;
 * this UI just can't propose an impossible amount.
 */
export function RefundDialog({
  orderNumber, total, remaining, hasPayment, paymentStatus, paymentMethod, onClose, onDone,
}: {
  orderNumber: string;
  total: number;
  remaining: number;
  hasPayment: boolean;
  paymentStatus: string;
  paymentMethod: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { ctx, loading } = useOrderContext(orderNumber, true);

  const [refundType, setRefundType] = useState<RefundType>("full");
  const [partial, setPartial] = useState(remaining.toFixed(2));
  const [customerReason, setCustomerReason] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Breakdown from context when available; otherwise fall back to the summary values we already have,
  // so the dialog still functions (with a coarser breakdown) if the context fetch fails.
  const bd: RefundBreakdown = ctx
    ? { products: ctx.order.products, shipping: ctx.order.shipping, tax: ctx.order.tax, total: ctx.order.total, alreadyRefunded: ctx.order.refundAmount, remaining: ctx.order.remaining }
    : { products: 0, shipping: 0, tax: 0, total, alreadyRefunded: Math.max(0, total - remaining), remaining };

  // Full/Shipping are derived from the breakdown; Partial is the operator's clamped figure.
  const amount = refundType === "partial" ? refundAmountForType("partial", bd, Number(partial)) : refundAmountForType(refundType, bd, 0);
  const fullyRefunded = bd.remaining <= 0;

  const submit = async () => {
    if (amount <= 0) { setErr("Enter an amount greater than zero."); return; }
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/orders/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNumber,
          amount,
          refundType,
          reason: customerReason.trim() || undefined,
          internalNote: internalNote.trim() || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error ?? "Failed"); setBusy(false); return; }
      onDone();
    } catch { setErr("Network error"); setBusy(false); }
  };

  return (
    <div className="om-modal" role="dialog" aria-modal="true" onClick={() => !busy && onClose()}>
      <div className="om-modal__card om-modal__card--wide" onClick={(e) => e.stopPropagation()}>
        <h2 className="om-modal__title">Refund · {orderNumber}</h2>

        {/* Gateway / transaction status */}
        <div className="om-gateway">
          {hasPayment ? <>Razorpay · {paymentMethod ?? "card"} · <span className="om-pay" data-tone={paymentStatus === "paid" ? "paid" : "refunded"}>{paymentStatus}</span></> : <>Manual — no online payment on file</>}
        </div>

        {fullyRefunded ? (
          <p className="om-guard-note">This order is fully refunded ({inr(bd.alreadyRefunded)}). Nothing remains to refund.</p>
        ) : (
          <>
            {/* Type presets */}
            <div className="om-seg" role="group" aria-label="Refund type">
              {REFUND_TYPES.map((t) => (
                <button key={t.key} type="button" className="om-seg__btn" data-active={refundType === t.key ? "1" : undefined} onClick={() => setRefundType(t.key)} disabled={t.key === "shipping" && bd.shipping <= 0}>
                  {t.label}
                </button>
              ))}
            </div>

            <label className="om-field">
              <span>Amount (₹)</span>
              {refundType === "partial" ? (
                <input type="number" min="0" step="0.01" value={partial} onChange={(e) => setPartial(e.target.value)} />
              ) : (
                <input type="text" value={amount.toFixed(2)} readOnly className="om-field__ro" />
              )}
            </label>

            {/* Breakdown */}
            <dl className="om-breakdown">
              <div><dt>Products</dt><dd>{inr(bd.products)}</dd></div>
              <div><dt>Shipping</dt><dd>{inr(bd.shipping)}</dd></div>
              <div><dt>Tax</dt><dd>{inr(bd.tax)}</dd></div>
              <div className="om-breakdown__grand"><dt>Order total</dt><dd>{inr(bd.total)}</dd></div>
              {bd.alreadyRefunded > 0 ? <div><dt>Already refunded</dt><dd>−{inr(bd.alreadyRefunded)}</dd></div> : null}
              <div className="om-breakdown__grand"><dt>Remaining</dt><dd>{inr(bd.remaining)}</dd></div>
            </dl>

            <label className="om-field">
              <span>Customer reason <em className="om-field__hint">— visible to the customer if notified</em></span>
              <input value={customerReason} onChange={(e) => setCustomerReason(e.target.value)} placeholder="e.g. goodwill, damaged item" />
            </label>
            <label className="om-field">
              <span>Internal finance note <em className="om-field__hint">— staff only</em></span>
              <input value={internalNote} onChange={(e) => setInternalNote(e.target.value)} placeholder="e.g. approved by finance, ticket #123" />
            </label>

            {/* Notify — structure-only for refunds today (no customer refund template yet) */}
            <div className="om-channels">
              <span className="om-channels__label">Notify customer</span>
              {NOTIFY_CHANNELS.map((c) => (
                <label key={c.key} className="om-channel om-channel--soon" title="Refund notifications are not yet automated">
                  <input type="checkbox" disabled /> {c.label} <em>soon</em>
                </label>
              ))}
            </div>
          </>
        )}

        {/* Prior refunds */}
        {ctx && ctx.refunds.length ? (
          <details className="om-tl-wrap">
            <summary>Refund history ({ctx.refunds.length})</summary>
            <ol className="om-hist">
              {ctx.refunds.map((r, i) => (
                <li key={i}><span>{inr(r.amount)} · {r.method}</span><span className="om-pay" data-tone={r.status === "processed" ? "paid" : r.status === "failed" ? "failed" : "refundprog"}>{r.status}</span><span className="admin__muted">{dt(r.createdAt)}</span></li>
              ))}
            </ol>
          </details>
        ) : loading ? <p className="admin__muted">Loading history…</p> : null}

        {err ? <p className="ff-err">{err}</p> : null}
        <div className="om-modal__actions">
          <button type="button" className="ff-btn" disabled={busy} onClick={onClose}>Close</button>
          {!fullyRefunded ? (
            <button type="button" className="ff-btn ff-btn--primary" disabled={busy} onClick={submit}>
              {busy ? "Refunding…" : `Refund ${inr(amount)}`}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
