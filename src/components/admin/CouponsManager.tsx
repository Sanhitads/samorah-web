"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdminCoupon, AdminCouponTarget, TargetOptions } from "@/services/couponAdminService";
import { validateCouponConfig } from "@/lib/couponValidation";

type Form = {
  id?: string; code: string; description: string; type: "percent" | "fixed" | "free_shipping"; value: number;
  maxDiscount: string; minOrder: string; maxUses: string; maxUsesPerUser: string; firstOrderOnly: boolean;
  autoApply: boolean; combinable: boolean; priority: string; excludeSale: boolean;
  startsAt: string; expiresAt: string; isActive: boolean; targets: AdminCouponTarget[];
};

const toForm = (c: AdminCoupon): Form => ({
  id: c.id, code: c.code, description: c.publicDescription ?? "", type: c.type, value: c.value,
  maxDiscount: c.maxDiscount != null ? String(c.maxDiscount) : "", minOrder: String(c.minOrder),
  maxUses: c.maxUses != null ? String(c.maxUses) : "", maxUsesPerUser: c.maxUsesPerUser != null ? String(c.maxUsesPerUser) : "",
  firstOrderOnly: c.eligibility === "first_order", autoApply: c.autoApply, combinable: c.combinable, priority: String(c.priority), excludeSale: c.excludeSale,
  startsAt: c.startsAt ? c.startsAt.slice(0, 10) : "", expiresAt: c.expiresAt ? c.expiresAt.slice(0, 10) : "", isActive: c.isActive,
  targets: c.targets.map((t) => ({ ...t })),
});
const blank: Form = { code: "", description: "", type: "percent", value: 10, maxDiscount: "", minOrder: "0", maxUses: "", maxUsesPerUser: "1", firstOrderOnly: false, autoApply: false, combinable: false, priority: "100", excludeSale: false, startsAt: "", expiresAt: "", isActive: true, targets: [] };
const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));
const couponFromForm = (f: Form) => ({
  code: f.code, description: f.description || undefined, type: f.type, value: Number(f.value),
  maxDiscount: numOrNull(f.maxDiscount), minOrder: Number(f.minOrder || 0), maxUses: numOrNull(f.maxUses),
  maxUsesPerUser: numOrNull(f.maxUsesPerUser), firstOrderOnly: f.firstOrderOnly, autoApply: f.autoApply,
  combinable: f.combinable, priority: Number(f.priority || 100), excludeSale: f.excludeSale,
  startsAt: f.startsAt || null, expiresAt: f.expiresAt || null, isActive: f.isActive, targets: f.targets,
});
const validateForm = (f: Form) => validateCouponConfig({
  ...couponFromForm(f), includes: f.targets.filter((t) => t.mode === "include"), excludes: f.targets.filter((t) => t.mode === "exclude"),
});

export function CouponsManager({ coupons, targetOptions }: { coupons: AdminCoupon[]; targetOptions: TargetOptions }) {
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
    const coupon = couponFromForm(f);
    // Same validator the server runs — catch it here for instant feedback (server stays authoritative).
    const errs = validateForm(f);
    if (errs.length) { setErr(errs[0]); return; }
    if (await post(f.id ? { action: "update", id: f.id, coupon } : { action: "create", coupon })) setEdit(null);
  };
  const formErrors = edit ? validateForm(edit) : [];
  const patch = (p: Partial<Form>) => setEdit((e) => (e ? { ...e, ...p } : e));

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
                <td className="admin__mono">{c.code}{c.autoApply ? <span className="bc-tag" data-derived="0"> auto</span> : null}{c.publicDescription ? <div className="admin__muted">{c.publicDescription}</div> : null}</td>
                <td>{c.type === "percent" ? `${c.value}%${c.maxDiscount ? ` up to ₹${c.maxDiscount}` : ""}` : `₹${c.value}`}</td>
                <td className="admin__muted">{c.minOrder ? `min ₹${c.minOrder}` : "—"}{c.eligibility === "first_order" ? " · 1st order" : ""}</td>
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
              <label className="cfg-field"><span>Type</span><select value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value as Form["type"] })}><option value="percent">Percent (%)</option><option value="fixed">Fixed (₹)</option><option value="free_shipping">Free shipping</option></select></label>
              {edit.type !== "free_shipping" ? <label className="cfg-field"><span>Value {edit.type === "percent" ? "(%)" : "(₹)"}</span><input type="number" value={edit.value} onChange={(e) => setEdit({ ...edit, value: Number(e.target.value) })} /></label> : null}
              {edit.type === "percent" ? <label className="cfg-field"><span>Max discount (₹)</span><input type="number" value={edit.maxDiscount} onChange={(e) => setEdit({ ...edit, maxDiscount: e.target.value })} placeholder="no cap" /></label> : null}
              <label className="cfg-field"><span>Min order (₹)</span><input type="number" value={edit.minOrder} onChange={(e) => setEdit({ ...edit, minOrder: e.target.value })} /></label>
              <label className="cfg-field"><span>Max uses (total)</span><input type="number" value={edit.maxUses} onChange={(e) => patch({ maxUses: e.target.value })} placeholder="unlimited" /></label>
              <label className="cfg-field"><span>Per customer</span><input type="number" value={edit.maxUsesPerUser} onChange={(e) => patch({ maxUsesPerUser: e.target.value })} placeholder="unlimited" /></label>
              {edit.autoApply || edit.combinable ? <label className="cfg-field"><span>Priority</span><input type="number" value={edit.priority} onChange={(e) => patch({ priority: e.target.value })} title="Lower applies first / wins ties" /></label> : null}
              <label className="cfg-field"><span>Starts</span><input type="date" value={edit.startsAt} onChange={(e) => patch({ startsAt: e.target.value })} /></label>
              <label className="cfg-field"><span>Expires</span><input type="date" value={edit.expiresAt} onChange={(e) => patch({ expiresAt: e.target.value })} /></label>
              <label className="cfg-field"><span>Description</span><input value={edit.description} onChange={(e) => patch({ description: e.target.value })} placeholder="Welcome offer" /></label>
            </div>
            <div className="cfg-checks">
              <label className="om-check"><input type="checkbox" checked={edit.autoApply} onChange={(e) => patch({ autoApply: e.target.checked })} /><span>Auto-apply (no code needed)</span></label>
              <label className="om-check"><input type="checkbox" checked={edit.firstOrderOnly} onChange={(e) => patch({ firstOrderOnly: e.target.checked })} /><span>First order only</span></label>
              <label className="om-check"><input type="checkbox" checked={edit.combinable} onChange={(e) => patch({ combinable: e.target.checked })} /><span>Combinable (stack with other discounts)</span></label>
              <label className="om-check"><input type="checkbox" checked={edit.excludeSale} onChange={(e) => patch({ excludeSale: e.target.checked })} /><span>Exclude sale items</span></label>
              <label className="om-check"><input type="checkbox" checked={edit.isActive} onChange={(e) => patch({ isActive: e.target.checked })} /><span>Active</span></label>
            </div>

            <CouponTargetsEditor targets={edit.targets} options={targetOptions} onChange={(targets) => patch({ targets })} />
            {formErrors.length ? <p className="ff-err">{formErrors[0]}</p> : err ? <p className="ff-err">{err}</p> : null}
            <div className="om-modal__actions">
              <button type="button" className="ff-btn" disabled={busy} onClick={() => setEdit(null)}>Cancel</button>
              <button type="button" className="ff-btn ff-btn--primary" disabled={busy || formErrors.length > 0} onClick={() => save(edit)}>{busy ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Applies-to / exclusions editor — ID-backed rules (points 2/3). Zero rules = entire order. Explicit
 *  exclusions always win (enforced by the engine). Variant targeting is by id (advanced); the common
 *  category / chapter / product / product-type cases use searchable dropdowns of real entities. */
function CouponTargetsEditor({ targets, options, onChange }: { targets: AdminCouponTarget[]; options: TargetOptions; onChange: (t: AdminCouponTarget[]) => void }) {
  const update = (i: number, p: Partial<AdminCouponTarget>) => onChange(targets.map((t, j) => (j === i ? { ...t, ...p } : t)));
  const remove = (i: number) => onChange(targets.filter((_, j) => j !== i));
  const add = (mode: "include" | "exclude") => onChange([...targets, { mode, type: "category", id: options.categories[0]?.id ?? null, value: null }]);
  const setType = (i: number, type: AdminCouponTarget["type"]) => {
    const firstId = type === "category" ? options.categories[0]?.id : type === "collection" ? options.collections[0]?.id : type === "product" ? options.products[0]?.id : undefined;
    update(i, { type, id: type === "product_type" ? null : (firstId ?? ""), value: type === "product_type" ? options.productTypes[0] : null });
  };
  const listFor = (type: AdminCouponTarget["type"]) => (type === "category" ? options.categories : type === "collection" ? options.collections : options.products);
  return (
    <div className="cfg-targets">
      <div className="cfg-targets__head">
        <span>Applies to / Exclusions</span>
        <span>
          <button type="button" className="ff-btn ff-btn--mini" onClick={() => add("include")}>+ Applies to</button>{" "}
          <button type="button" className="ff-btn ff-btn--mini" onClick={() => add("exclude")}>+ Exclusion</button>
        </span>
      </div>
      {targets.length === 0 ? <small className="admin__muted">No rules — the coupon applies to the entire order. Add rules to target or exclude categories, chapters, products, product types or variants.</small> : null}
      {targets.map((t, i) => (
        <div key={i} className="cfg-targets__row" data-mode={t.mode}>
          <select value={t.mode} onChange={(e) => update(i, { mode: e.target.value as "include" | "exclude" })}>
            <option value="include">Include</option><option value="exclude">Exclude</option>
          </select>
          <select value={t.type} onChange={(e) => setType(i, e.target.value as AdminCouponTarget["type"])}>
            <option value="category">Category</option><option value="collection">Chapter</option>
            <option value="product">Product</option><option value="product_type">Product type</option><option value="variant">Variant</option>
          </select>
          {t.type === "product_type" ? (
            <select value={t.value ?? ""} onChange={(e) => update(i, { value: e.target.value, id: null })}>
              {options.productTypes.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          ) : t.type === "variant" ? (
            <input value={t.id ?? ""} onChange={(e) => update(i, { id: e.target.value, value: null })} placeholder="variant id" />
          ) : (
            <select value={t.id ?? ""} onChange={(e) => update(i, { id: e.target.value, value: null })}>
              {listFor(t.type).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
          <button type="button" className="ff-btn ff-btn--mini ff-btn--danger" onClick={() => remove(i)} aria-label="Remove rule">×</button>
        </div>
      ))}
    </div>
  );
}
