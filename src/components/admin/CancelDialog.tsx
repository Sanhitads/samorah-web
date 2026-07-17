"use client";

import { useState } from "react";
import Link from "next/link";
import { useOrderContext } from "@/hooks/useOrderContext";
import {
  CANCEL_REASONS, customerSafePhrase, requiresTypedConfirm, cancelImpact, NOTIFY_CHANNELS,
} from "@/lib/admin/orderDialogs";

const EVENT_LABEL = (e: string) => e.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const dt = (v: string) => new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Commercial cancellation dialog (Screen 2). Structured reason (category → sub-reason), a
 * customer-facing message SEPARATE from the internal note (so private phrasing never reaches the
 * customer), an HONEST impact preview (only effects cancel_order actually performs), the order
 * timeline, notification-channel choice, and a typed-CANCEL guard on high-value orders.
 */
export function CancelDialog({
  orderNumber, status, total, remaining, paid, hasPayment, onClose, onDone,
}: {
  orderNumber: string;
  status: string;
  total: number;
  remaining: number;
  paid: boolean;
  hasPayment: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { ctx, loading } = useOrderContext(orderNumber, true);

  const [categoryIdx, setCategoryIdx] = useState(0);
  const category = CANCEL_REASONS[categoryIdx];
  const [subReason, setSubReason] = useState(category.subReasons[0].value);
  const [customerReason, setCustomerReason] = useState(customerSafePhrase(category.type, category.subReasons[0].value));
  const [internalNote, setInternalNote] = useState("");
  const [release, setRelease] = useState(true);
  const [doRefund, setDoRefund] = useState(paid);
  const [email, setEmail] = useState(true);
  const [sms, setSms] = useState(false);
  const [whatsapp, setWhatsapp] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const mustType = requiresTypedConfirm(total);

  // Category change → reset the sub-reason + refresh the safe customer phrase.
  const changeCategory = (idx: number) => {
    const cat = CANCEL_REASONS[idx];
    setCategoryIdx(idx);
    setSubReason(cat.subReasons[0].value);
    setCustomerReason(customerSafePhrase(cat.type, cat.subReasons[0].value));
  };
  const changeSub = (value: string) => {
    setSubReason(value);
    setCustomerReason(customerSafePhrase(category.type, value)); // re-seed; operator may edit after
  };

  const impact = ctx
    ? cancelImpact({
        units: ctx.order.units,
        releaseInventory: release,
        paymentPaid: ctx.order.paid,
        issueRefund: doRefund && paid,
        refundAmount: ctx.order.remaining,
        gateway: ctx.order.gateway,
        couponCode: ctx.order.couponCode,
        loyaltyPoints: ctx.order.loyaltyPoints,
        hasInvoice: ctx.order.hasInvoice,
      })
    : [];

  const submit = async () => {
    if (!internalNote.trim()) { setErr("An internal note is required (kept private — not sent to the customer)."); return; }
    if (mustType && typed.trim().toUpperCase() !== "CANCEL") { setErr("Type CANCEL to confirm this high-value cancellation."); return; }
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/orders/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNumber,
          cancellationType: category.type,
          reasonCategory: category.type,
          subReason,
          customerReason: customerReason.trim() || undefined,
          internalNote: internalNote.trim(),
          notifyEmail: email,
          releaseInventory: release,
          issueRefund: doRefund && paid,
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
        <h2 className="om-modal__title">Cancel · {orderNumber}</h2>
        <p className="om-modal__note">Cancelling stops the order. Returning money is a separate choice below.</p>

        {status === "packed" ? (
          <p className="om-guard-note">This order is packed and close to dispatch. If it has already shipped, cancel is blocked — <Link href="/admin/returns" className="text-link">create a Return</Link> instead.</p>
        ) : null}

        <div className="om-reason-grid">
          <label className="om-field">
            <span>Category</span>
            <select value={categoryIdx} onChange={(e) => changeCategory(Number(e.target.value))}>
              {CANCEL_REASONS.map((c, i) => <option key={c.type} value={i}>{c.label}</option>)}
            </select>
          </label>
          <label className="om-field">
            <span>Reason</span>
            <select value={subReason} onChange={(e) => changeSub(e.target.value)}>
              {category.subReasons.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
        </div>

        <label className="om-field">
          <span>Customer message <em className="om-field__hint">— shown to the customer</em></span>
          <textarea value={customerReason} onChange={(e) => setCustomerReason(e.target.value)} rows={2} placeholder="What the customer is told" />
        </label>
        <label className="om-field">
          <span>Internal note <em className="om-field__hint">— staff only, never sent</em></span>
          <textarea value={internalNote} onChange={(e) => setInternalNote(e.target.value)} rows={2} placeholder="Why, for the record (e.g. flagged by risk review)" />
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
        ) : <p className="om-modal__note">No captured payment — nothing to refund.</p>}

        {/* Honest impact preview */}
        <div className="om-impact">
          <p className="om-impact__title">What happens on confirm</p>
          {loading && !ctx ? <p className="admin__muted">Calculating…</p> : null}
          {impact.map((r) => (
            <div key={r.label} className="om-impact__row" data-tone={r.tone}>
              <span className="om-impact__label">{r.label}{!r.automated ? " ⚠" : ""}</span>
              <span className="om-impact__val">{r.value}</span>
            </div>
          ))}
          {impact.some((r) => !r.automated) ? <p className="om-impact__foot">⚠ not automated — handle these by hand.</p> : null}
        </div>

        {/* Customer notification channels */}
        <div className="om-channels">
          <span className="om-channels__label">Notify customer</span>
          <label className="om-channel"><input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /> Email</label>
          {NOTIFY_CHANNELS.filter((c) => !c.live).map((c) => (
            <label key={c.key} className="om-channel om-channel--soon" title="Structure ready — not yet delivering">
              <input type="checkbox" checked={c.key === "sms" ? sms : whatsapp} onChange={(e) => (c.key === "sms" ? setSms : setWhatsapp)(e.target.checked)} />
              {c.label} <em>soon</em>
            </label>
          ))}
        </div>

        {/* Timeline */}
        {ctx && ctx.timeline.length ? (
          <details className="om-tl-wrap">
            <summary>Order timeline ({ctx.timeline.length})</summary>
            <ol className="om-tl-mini">
              {ctx.timeline.map((e, i) => (
                <li key={i}><span className="admin__muted">{dt(e.at)}</span> {EVENT_LABEL(e.event)}{e.next ? <span className="admin__muted"> → {e.next}</span> : null}</li>
              ))}
            </ol>
          </details>
        ) : null}

        {mustType ? (
          <label className="om-field om-guard">
            <span>High-value order — type <b>CANCEL</b> to confirm</span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="CANCEL" autoComplete="off" />
          </label>
        ) : null}

        {err ? <p className="ff-err">{err}</p> : null}
        <div className="om-modal__actions">
          <button type="button" className="ff-btn" disabled={busy} onClick={onClose}>Keep order</button>
          <button type="button" className="ff-btn ff-btn--danger" disabled={busy} onClick={submit}>
            {busy ? "Cancelling…" : "Confirm cancellation"}
          </button>
        </div>
      </div>
    </div>
  );
}
