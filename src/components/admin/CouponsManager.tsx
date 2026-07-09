"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdminCoupon } from "@/services/couponAdminService";

type Form = {
  id?: string; code: string; description: string; type: "percent" | "fixed"; value: number;
  maxDiscount: string; minOrder: string; maxUses: string; firstOrderOnly: boolean; autoApply: boolean;
  startsAt: string; expiresAt: string; isActive: boolean;
};

const toForm = (c: AdminCoupon): Form => ({
  id: c.id, code: c.code, description: c.description ?? "", type: c.type, value: c.value,
  maxDiscount: c.maxDiscount != null ? String(c.maxDiscount) : "", minOrder: String(c.minOrder),
  maxUses: c.maxUses != null ? String(c.maxUses) : "", firstOrderOnly: c.firstOrderOnly, autoApply: c.autoApply,
  startsAt: c.startsAt ? c.startsAt.slice(0, 10) : "", expiresAt: c.expiresAt ? c.expiresAt.slice(0, 10) : "", isActive: c.isActive,
});
const blank: Form = { code: "", description: "", type: "percent", value: 10, maxDiscount: "", minOrder: "0", maxUses: "", firstOrderOnly: false, autoApply: false, startsAt: "", expiresAt: "", isActive: true };
const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

export function CouponsManager({ coupons }: { coupons: AdminCoupon[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState<Form | null>(null);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/admin/coupons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      setBusy(false);
      if (!res.ok || d.ok === false) { setErr(d.error ?? d.reason ?? "Failed"); return false; }
      startTransition(() => router.refresh());
      return true;
    } catch { setBusy(false); setErr("Network error"); return false; }
  };

  const save = async (f: Form) => {
    const coupon = {
      code: f.code, description: f.description || undefined, type: f.type, value: Number(f.value),
      maxDiscount: numOrNull(f.maxDiscount), minOrder: Number(f.minOrder || 0), maxUses: numOrNull(f.maxUses),
      firstOrderOnly: f.firstOrderOnly, autoApply: f.autoApply,
      startsAt: f.startsAt || null, expiresAt: f.expiresAt || null, isActive: f.isActive,
    };
    if (await post(f.id ? { action: "update", id: f.id, coupon } : { action: "create", coupon })) setEdit(null);
  };

  const badge = (c: AdminCoupon) => {
    const now = Date.now();
    if (!c.isActive) return { l: "Inactive", t: "pending" };
    if (c.expiresAt && new Date(c.expiresAt).getTime() < now) return { l: "Expired", t: "failed" };
    if (c.maxUses != null && c.usedCount >= c.maxUses) return { l: "Used up", t: "failed" };
    if (c.startsAt && new Date(c.startsAt).getTime() > now) return { l: "Scheduled", t: "refundprog" };
    return { l: "Active", t: "paid" };
  };

  return (
    <div className="cfg">
      <div className="cfg-actions">
        <button type="button" className="ff-btn ff-btn--primary" onClick={() => { setErr(""); setEdit({ ...blank }); }}>New coupon</button>
        {pending ? <span className="ff-refreshing">updating…</span> : null}
        {err && !edit ? <span className="ff-err">{err}</span> : null}
      </div>

      <table className="admin__table admin__table--board">
        <thead><tr><th>Code</th><th>Discount</th><th>Conditions</th><th>Usage</th><th>Window</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {coupons.map((c) => {
            const b = badge(c);
            return (
              <tr key={c.id}>
                <td className="admin__mono">{c.code}{c.autoApply ? <span className="bc-tag" data-derived="0"> auto</span> : null}{c.description ? <div className="admin__muted">{c.description}</div> : null}</td>
                <td>{c.type === "percent" ? `${c.value}%${c.maxDiscount ? ` up to ₹${c.maxDiscount}` : ""}` : `₹${c.value}`}</td>
                <td className="admin__muted">{c.minOrder ? `min ₹${c.minOrder}` : "—"}{c.firstOrderOnly ? " · 1st order" : ""}</td>
                <td className="admin__mono">{c.usedCount}{c.maxUses != null ? ` / ${c.maxUses}` : ""}</td>
                <td className="admin__muted">{c.startsAt ? c.startsAt.slice(0, 10) : "—"} → {c.expiresAt ? c.expiresAt.slice(0, 10) : "∞"}</td>
                <td><span className="om-pay" data-tone={b.t}>{b.l}</span></td>
                <td><div className="ff-actions">
                  <button type="button" className="cfg-toggle" data-on={c.isActive ? "1" : "0"} disabled={busy} onClick={() => post({ action: "toggle", id: c.id, isActive: !c.isActive })}>{c.isActive ? "On" : "Off"}</button>
                  <button type="button" className="ff-btn" onClick={() => { setErr(""); setEdit(toForm(c)); }}>Edit</button>
                  <button type="button" className="ff-btn ff-btn--danger" disabled={busy} onClick={() => post({ action: "delete", id: c.id })}>Delete</button>
                </div></td>
              </tr>
            );
          })}
          {coupons.length === 0 ? <tr><td colSpan={7} className="admin__empty">No coupons yet. Create codes here — they go live for checkout immediately.</td></tr> : null}
        </tbody>
      </table>

      {edit ? (
        <div className="om-modal" role="dialog" aria-modal="true" onClick={() => !busy && setEdit(null)}>
          <div className="om-modal__card om-modal__card--wide" onClick={(e) => e.stopPropagation()}>
            <h2 className="om-modal__title">{edit.id ? `Edit ${edit.code}` : "New coupon"}</h2>
            <div className="cfg-grid">
              <label className="cfg-field"><span>Code</span><input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })} placeholder="WELCOME10" /></label>
              <label className="cfg-field"><span>Type</span><select value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value as "percent" | "fixed" })}><option value="percent">Percent (%)</option><option value="fixed">Fixed (₹)</option></select></label>
              <label className="cfg-field"><span>Value {edit.type === "percent" ? "(%)" : "(₹)"}</span><input type="number" value={edit.value} onChange={(e) => setEdit({ ...edit, value: Number(e.target.value) })} /></label>
              {edit.type === "percent" ? <label className="cfg-field"><span>Max discount (₹)</span><input type="number" value={edit.maxDiscount} onChange={(e) => setEdit({ ...edit, maxDiscount: e.target.value })} placeholder="no cap" /></label> : null}
              <label className="cfg-field"><span>Min order (₹)</span><input type="number" value={edit.minOrder} onChange={(e) => setEdit({ ...edit, minOrder: e.target.value })} /></label>
              <label className="cfg-field"><span>Max uses</span><input type="number" value={edit.maxUses} onChange={(e) => setEdit({ ...edit, maxUses: e.target.value })} placeholder="unlimited" /></label>
              <label className="cfg-field"><span>Starts</span><input type="date" value={edit.startsAt} onChange={(e) => setEdit({ ...edit, startsAt: e.target.value })} /></label>
              <label className="cfg-field"><span>Expires</span><input type="date" value={edit.expiresAt} onChange={(e) => setEdit({ ...edit, expiresAt: e.target.value })} /></label>
              <label className="cfg-field"><span>Description</span><input value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} placeholder="Welcome offer" /></label>
            </div>
            <div className="cfg-checks">
              <label className="om-check"><input type="checkbox" checked={edit.autoApply} onChange={(e) => setEdit({ ...edit, autoApply: e.target.checked })} /><span>Auto-apply (no code needed)</span></label>
              <label className="om-check"><input type="checkbox" checked={edit.firstOrderOnly} onChange={(e) => setEdit({ ...edit, firstOrderOnly: e.target.checked })} /><span>First order only</span></label>
              <label className="om-check"><input type="checkbox" checked={edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} /><span>Active</span></label>
            </div>
            {err ? <p className="ff-err">{err}</p> : null}
            <div className="om-modal__actions">
              <button type="button" className="ff-btn" disabled={busy} onClick={() => setEdit(null)}>Cancel</button>
              <button type="button" className="ff-btn ff-btn--primary" disabled={busy || !edit.code.trim()} onClick={() => save(edit)}>{busy ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
