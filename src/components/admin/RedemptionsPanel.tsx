"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RedemptionRow } from "@/services/couponAdminService";

/**
 * Coupon redemptions monitor (Phase-1 testing aid) — watch the reserve → consume → release/restore
 * lifecycle without SQL. Read-only, except an admin RESTORE on a released redemption (reason required +
 * audited), which surfaces the restore_coupon RPC.
 */
const STATE_TONE: Record<RedemptionRow["state"], string> = {
  reserved: "refundprog", // held at checkout, awaiting payment
  consumed: "paid",       // payment succeeded
  released: "refunded",   // freed (cancel / abandon)
  restored: "paid",       // admin re-held
};
const when = (r: RedemptionRow) => r.releasedAt ?? r.consumedAt ?? r.reservedAt;
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");

export function RedemptionsPanel({ rows }: { rows: RedemptionRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const restore = async (r: RedemptionRow) => {
    if (!r.orderId) return;
    // Restore is operationally sensitive: released → restored does NOT itself prove the order was paid,
    // and it re-holds a coupon slot (used_count +1). Require an explicit, reasoned confirmation.
    const reason = window.prompt(
      `Restore the ${r.couponCode} redemption for order ${r.orderNumber ?? r.orderId}?\n\n` +
      `Use ONLY when this redemption was released incorrectly. Restoring re-holds the coupon slot ` +
      `(usage +1); it does not by itself prove the order was paid, and analytics still only count it once the order is genuinely paid.\n\n` +
      `Enter a reason (required, audited):`,
    );
    if (!reason?.trim()) return;
    setBusy(r.id); setErr("");
    try {
      const res = await fetch("/api/admin/coupons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore-redemption", orderId: r.orderId, reason }) });
      const d = await res.json();
      if (!res.ok || d.ok === false) setErr(d.error ?? d.reason ?? "Restore failed");
      else startTransition(() => router.refresh());
    } catch { setErr("Network error"); }
    setBusy(null);
  };

  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
        <p className="admin__eyebrow">Coupons · lifecycle</p>
        <h2 className="admin__title" style={{ fontSize: 18 }}>Recent redemptions</h2>
        {pending ? <span className="ff-refreshing">updating…</span> : null}
        {err ? <span className="ff-err">{err}</span> : null}
      </div>
      <div className="admin__table-wrap">
        <table className="admin__table admin__table--board">
          <thead><tr><th>Order</th><th>Code</th><th>Customer</th><th>Discount</th><th>State</th><th>When</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="admin__mono">{r.orderNumber ?? "—"}</td>
                <td className="admin__mono">{r.couponCode}</td>
                <td className="admin__mono" title={r.identity}>{r.identity.startsWith("guest:") ? r.identity.slice(6) : "account"}</td>
                <td>₹{r.discount.toFixed(2)}</td>
                <td><span className="om-pay" data-tone={STATE_TONE[r.state]}>{r.state}</span>{r.reason ? <span className="admin__muted" title={r.reason}> · ⓘ</span> : null}</td>
                <td className="admin__muted">{fmt(when(r))}</td>
                <td>{r.state === "released" && r.orderId ? <button type="button" className="ff-btn ff-btn--mini" disabled={busy === r.id} onClick={() => restore(r)}>{busy === r.id ? "…" : "Restore"}</button> : null}</td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={7} className="admin__empty">No redemptions yet. Apply a coupon at checkout to see reserve → consume → release here.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
