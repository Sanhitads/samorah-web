"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Order-level alert banner (review point 16). When staff arrive here from a "Refund failed"
 * notification, this makes the reason for navigation immediately obvious — the failure reason,
 * when it was attempted, and a one-click Retry (POST /api/admin/orders/refund) + a jump to the
 * refund history. Without it, the admin has no idea why they were taken to the order.
 */
export function RefundRetryBanner({ orderNumber, reason, attemptedAt }: { orderNumber: string; reason: string; attemptedAt: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const retry = async () => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/orders/refund", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderNumber }) });
      const d = (await res.json()) as { error?: string };
      if (res.ok) { setMsg("Retry sent — refreshing…"); router.refresh(); }
      else setMsg(d.error ?? "Retry failed.");
    } catch {
      setMsg("Retry failed.");
    } finally {
      setBusy(false);
    }
  };

  const when = new Date(attemptedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="od-banner" role="alert">
      <span className="od-banner__icon" aria-hidden>⚠</span>
      <div className="od-banner__body">
        <span className="od-banner__title">Refund failed</span>
        <span className="od-banner__detail">Attempted {when} · Reason: <b>{reason}</b></span>
        {msg ? <span className="od-banner__msg">{msg}</span> : null}
      </div>
      <div className="od-banner__actions">
        <a href="#refunds" className="od-banner__btn">View refunds</a>
        <button type="button" className="od-banner__btn od-banner__btn--primary" onClick={retry} disabled={busy}>{busy ? "Retrying…" : "Retry Refund"}</button>
      </div>
    </div>
  );
}
