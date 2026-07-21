"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Inline "retry" on a failed refund row in the order Refunds panel — a compact companion to the
 * top-of-page RefundRetryBanner, for when staff are reading the refund list itself. Re-issues via
 * the same /api/admin/orders/refund endpoint (order.refund gated); the ledger's over-refund guard
 * makes a repeat click safe. Confirms first since it moves money.
 */
export function RefundRowRetry({ orderNumber, amount }: { orderNumber: string; amount: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState(false);

  const retry = async () => {
    if (!window.confirm(`Retry the ₹${Number(amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} refund through the gateway?`)) return;
    setBusy(true); setMsg(""); setErr(false);
    try {
      const res = await fetch("/api/admin/orders/refund", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderNumber, amount, reason: "Retry failed refund" }) });
      const d = await res.json().catch(() => ({}));
      setBusy(false);
      if (!res.ok) { setErr(true); setMsg(d.error ?? "Retry failed"); return; }
      setMsg("Sent"); startTransition(() => router.refresh());
    } catch { setBusy(false); setErr(true); setMsg("Network error"); }
  };

  return (
    <span className="refund-retry-inline">
      <button type="button" className="ff-btn ff-btn--mini" disabled={busy} onClick={retry}>{busy ? "…" : "Retry"}</button>
      {msg ? <span className={err ? "ff-error" : "ff-done"}>{msg}</span> : null}
      {pending && !busy ? <span className="ff-refreshing">…</span> : null}
    </span>
  );
}
