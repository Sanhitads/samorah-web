"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Order-level alert banner (review points 9, 16). When staff arrive from a "Refund failed"
 * notification, this makes the reason for navigation obvious AND gives the full debugging
 * context operators need — amount, gateway, refund id, attempts, reason — with a one-click
 * Retry and a jump to the audit logs.
 */
export function RefundRetryBanner({ orderNumber, customer, reason, attemptedAt, amount, gateway, refundId, attempts }: {
  orderNumber: string; customer: string; reason: string; attemptedAt: string; amount: number; gateway: string; refundId: string | null; attempts: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const retry = async () => {
    setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/admin/orders/refund", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderNumber }) });
      const d = (await res.json()) as { error?: string };
      if (res.ok) { setMsg("Retry sent — refreshing…"); router.refresh(); }
      else setMsg(d.error ?? "Retry failed.");
    } catch { setMsg("Retry failed."); }
    finally { setBusy(false); }
  };

  const when = new Date(attemptedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const inr = `₹${Number(amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="od-banner" role="alert">
      <div className="od-banner__main">
        <span className="od-banner__icon" aria-hidden>⚠</span>
        <div className="od-banner__body">
          <span className="od-banner__title">Refund failed</span>
          <dl className="od-banner__grid">
            <div><dt>Customer</dt><dd>{customer}</dd></div>
            <div><dt>Attempted</dt><dd>{when}</dd></div>
            <div><dt>Amount</dt><dd>{inr}</dd></div>
            <div><dt>Gateway</dt><dd>{gateway}</dd></div>
            <div><dt>Reason</dt><dd>{reason}</dd></div>
            {refundId ? <div><dt>Refund ID</dt><dd className="admin__mono">{refundId}</dd></div> : null}
            <div><dt>Attempts</dt><dd>{attempts}</dd></div>
          </dl>
          {msg ? <span className="od-banner__msg">{msg}</span> : null}
        </div>
      </div>
      <div className="od-banner__actions">
        <a href={`/admin/audit?search=${encodeURIComponent(orderNumber)}`} className="od-banner__btn">View logs</a>
        <a href="#refunds" className="od-banner__btn">View refunds</a>
        <button type="button" className="od-banner__btn od-banner__btn--primary" onClick={retry} disabled={busy}>{busy ? "Retrying…" : "Retry Refund"}</button>
      </div>
    </div>
  );
}
