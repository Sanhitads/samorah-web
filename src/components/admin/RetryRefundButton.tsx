"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Retry a return refund whose gateway attempt failed (review follow-on). Shown on the finance card
 * only when the refund is in a failed state and the viewer can approve. Confirms first (it moves
 * money), then POSTs to /api/admin/returns/refund-retry and refreshes. The refund ledger is
 * over-refund-guarded server-side, so a double-click can't double-pay.
 */
export function RetryRefundButton({ returnId, amount }: { returnId: string; amount: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const retry = async () => {
    setBusy(true); setMsg(""); setErr(false); setConfirm(false);
    try {
      const res = await fetch("/api/admin/returns/refund-retry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ returnId }) });
      const d = await res.json().catch(() => ({}));
      setBusy(false);
      if (!res.ok || d.ok === false) { setErr(true); setMsg(d.error ?? "Retry failed"); return; }
      setMsg(d.status === "processed" ? "Refund completed." : "Refund re-submitted.");
      startTransition(() => router.refresh());
    } catch { setBusy(false); setErr(true); setMsg("Network error"); }
  };

  return (
    <div className="retry-refund">
      <button type="button" className="ff-btn ff-btn--primary" disabled={busy} onClick={() => setConfirm(true)}>{busy ? "Retrying…" : "Retry refund"}</button>
      {msg ? <span className={err ? "ff-error" : "ff-done"}>{msg}</span> : null}
      {pending && !busy ? <span className="ff-refreshing">refreshing…</span> : null}

      {confirm ? (
        <div className="cf" role="dialog" aria-modal="true" onClick={() => setConfirm(false)}>
          <div className="cf__box" onClick={(e) => e.stopPropagation()}>
            <h3 className="cf__title">Retry refund</h3>
            <p className="cf__detail">Re-attempt the ₹{Number(amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} refund through Razorpay.</p>
            <p className="cf__warn">This moves money. The ledger prevents double-refunding, but only retry once the original cause is resolved. Continue?</p>
            <div className="cf__actions">
              <button type="button" className="ff-btn" onClick={() => setConfirm(false)}>Cancel</button>
              <button type="button" className="ff-btn ff-btn--primary" onClick={retry}>Confirm retry</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
