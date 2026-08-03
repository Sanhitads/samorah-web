"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdminCoupon, AdminCouponTarget, TargetOptions, CouponAuditEntry } from "@/services/couponAdminService";
import { validateCouponDraft, validateCouponForActivation, type CouponConfigInput } from "@/lib/couponValidation";
import { couponStatus, type CouponEffectiveStatus } from "@/lib/couponStatus";
import { istLocalToUtc, utcToIstLocal, formatIST } from "@/lib/istTime";
import { describeCoupon } from "@/lib/couponSummary";

type Lifecycle = "draft" | "active" | "paused" | "archived";
type Form = {
  id?: string; code: string; publicDescription: string; internalNotes: string;
  type: "percent" | "fixed" | "free_shipping"; value: number;
  maxDiscount: string; minOrder: string; minQualifyingQuantity: string; maxUses: string; maxUsesPerUser: string;
  eligibility: "everyone" | "first_order"; autoApply: boolean; combinable: boolean; priority: string; excludeSale: boolean;
  startsAt: string; expiresAt: string; status: Lifecycle; targets: AdminCouponTarget[];
};

const str = (n: number | null) => (n != null ? String(n) : "");
const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

const toForm = (c: AdminCoupon): Form => ({
  id: c.id, code: c.code, publicDescription: c.publicDescription ?? "", internalNotes: c.internalNotes ?? "",
  type: c.type, value: c.value, maxDiscount: str(c.maxDiscount), minOrder: String(c.minOrder),
  minQualifyingQuantity: str(c.minQualifyingQuantity), maxUses: str(c.maxUses), maxUsesPerUser: str(c.maxUsesPerUser),
  eligibility: c.eligibility, autoApply: c.autoApply, combinable: c.combinable, priority: String(c.priority), excludeSale: c.excludeSale,
  startsAt: utcToIstLocal(c.startsAt), expiresAt: utcToIstLocal(c.expiresAt), status: c.status, targets: c.targets.map((t) => ({ ...t })),
});
const blank: Form = { code: "", publicDescription: "", internalNotes: "", type: "percent", value: 10, maxDiscount: "", minOrder: "0", minQualifyingQuantity: "", maxUses: "", maxUsesPerUser: "1", eligibility: "everyone", autoApply: false, combinable: false, priority: "100", excludeSale: false, startsAt: "", expiresAt: "", status: "draft", targets: [] };

// Coupon payload for the API. `status` chosen by the save action (draft vs activate). Dates → UTC.
const couponPayload = (f: Form, status: Lifecycle) => ({
  code: f.code, publicDescription: f.publicDescription || null, internalNotes: f.internalNotes || null,
  type: f.type, value: Number(f.value), maxDiscount: numOrNull(f.maxDiscount), minOrder: Number(f.minOrder || 0),
  minQualifyingQuantity: numOrNull(f.minQualifyingQuantity), maxUses: numOrNull(f.maxUses), maxUsesPerUser: numOrNull(f.maxUsesPerUser),
  eligibility: f.eligibility, autoApply: f.autoApply, combinable: f.combinable, priority: Number(f.priority || 100), excludeSale: f.excludeSale,
  startsAt: istLocalToUtc(f.startsAt), expiresAt: istLocalToUtc(f.expiresAt), status, targets: f.targets,
});
const configFor = (f: Form): CouponConfigInput => ({
  ...couponPayload(f, f.status), includes: f.targets.filter((t) => t.mode === "include"), excludes: f.targets.filter((t) => t.mode === "exclude"),
});

const STATUS_TONE: Record<CouponEffectiveStatus, string> = { draft: "pending", scheduled: "refundprog", active: "paid", paused: "pending", expired: "failed", exhausted: "failed", archived: "refunded" };
const effStatus = (c: AdminCoupon) => couponStatus({ status: c.status, startsAt: c.startsAt, expiresAt: c.expiresAt, maxUses: c.maxUses, usedCount: c.usedCount });

export function CouponsManager({ coupons, targetOptions }: { coupons: AdminCoupon[]; targetOptions: TargetOptions }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState<Form | null>(null);
  const [timeline, setTimeline] = useState<{ code: string; entries: CouponAuditEntry[] } | null>(null);
  const [fStatus, setFStatus] = useState<string>("live"); // live = everything except archived
  const [fType, setFType] = useState<string>("");
  const [fElig, setFElig] = useState<string>("");
  const [fAuto, setFAuto] = useState(false);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/admin/coupons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      setBusy(false);
      if (!res.ok || d.ok === false) { setErr(d.error ?? d.reason ?? "Failed"); return null; }
      startTransition(() => router.refresh());
      return d;
    } catch { setBusy(false); setErr("Network error"); return null; }
  };

  // Activate → active (strict); otherwise KEEP the coupon's current status (new coupon = draft, lenient).
  const save = async (f: Form, activate: boolean) => {
    const status: Lifecycle = activate ? "active" : f.status;
    const config = configFor({ ...f, status });
    const errs = status === "active" ? validateCouponForActivation(config) : validateCouponDraft(config);
    if (errs.length) { setErr(errs[0]); return; }
    const coupon = couponPayload(f, status);
    if (await post(f.id ? { action: "update", id: f.id, coupon } : { action: "create", coupon })) setEdit(null);
  };
  const openTimeline = async (c: AdminCoupon) => {
    const d = await post({ action: "audit", id: c.id });
    if (d?.entries) setTimeline({ code: c.code, entries: d.entries });
  };

  const formErrors = edit ? validateCouponDraft(configFor(edit)) : [];
  const patch = (p: Partial<Form>) => setEdit((e) => (e ? { ...e, ...p } : e));
  const labelOf = (t: AdminCouponTarget): string => {
    if (t.type === "product_type") return t.value ?? "";
    const list = t.type === "category" ? targetOptions.categories : t.type === "collection" ? targetOptions.collections : targetOptions.products;
    return list.find((o) => o.id === t.id)?.name ?? (t.type === "variant" ? `variant ${(t.id ?? "").slice(0, 8)}` : t.id ?? "");
  };
  const preview = edit ? describeCoupon({
    code: edit.code, type: edit.type, value: Number(edit.value), maxDiscount: numOrNull(edit.maxDiscount), minOrder: Number(edit.minOrder || 0),
    minQualifyingQuantity: numOrNull(edit.minQualifyingQuantity), eligibility: edit.eligibility, maxUses: numOrNull(edit.maxUses), maxUsesPerUser: numOrNull(edit.maxUsesPerUser),
    startsAt: istLocalToUtc(edit.startsAt), expiresAt: istLocalToUtc(edit.expiresAt), combinable: edit.combinable, autoApply: edit.autoApply, excludeSale: edit.excludeSale,
    targets: edit.targets.map((t) => ({ mode: t.mode, type: t.type, label: labelOf(t) })),
  }) : null;

  const rows = useMemo(() => coupons.filter((c) => {
    const s = effStatus(c).status;
    if (fStatus === "live" ? s === "archived" : fStatus && s !== fStatus) return false;
    if (fType && c.type !== fType) return false;
    if (fElig && c.eligibility !== fElig) return false;
    if (fAuto && !c.autoApply) return false;
    return true;
  }), [coupons, fStatus, fType, fElig, fAuto]);

  const appliesTo = (c: AdminCoupon) => {
    const inc = c.targets.filter((t) => t.mode === "include");
    return inc.length ? inc.map(labelOf).join(", ") : "Entire order";
  };

  return (
    <div className="cfg">
      <div className="cfg-actions" style={{ flexWrap: "wrap", gap: 8 }}>
        <button type="button" className="ff-btn ff-btn--primary" onClick={() => { setErr(""); setEdit({ ...blank }); }}>New coupon</button>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} title="Status"><option value="live">All (live)</option><option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="active">Active</option><option value="paused">Paused</option><option value="expired">Expired</option><option value="exhausted">Exhausted</option><option value="archived">Archived</option><option value="">Everything</option></select>
        <select value={fType} onChange={(e) => setFType(e.target.value)} title="Type"><option value="">All types</option><option value="percent">Percent</option><option value="fixed">Fixed</option><option value="free_shipping">Free shipping</option></select>
        <select value={fElig} onChange={(e) => setFElig(e.target.value)} title="Eligibility"><option value="">All customers</option><option value="everyone">Everyone</option><option value="first_order">First order</option></select>
        <label className="om-check"><input type="checkbox" checked={fAuto} onChange={(e) => setFAuto(e.target.checked)} /><span>Auto-apply</span></label>
        {pending ? <span className="ff-refreshing">updating…</span> : null}
        {err && !edit ? <span className="ff-err">{err}</span> : null}
      </div>

      <table className="admin__table admin__table--board">
        <thead><tr><th>Code</th><th>Offer</th><th>Applies to</th><th>Usage</th><th>Customer</th><th>Validity (IST)</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {rows.map((c) => {
            const s = effStatus(c);
            return (
              <tr key={c.id}>
                <td className="admin__mono">{c.code}{c.autoApply ? <span className="admin__muted"> · auto</span> : null}{c.publicDescription ? <div className="admin__muted">{c.publicDescription}</div> : null}</td>
                <td>{c.type === "percent" ? `${c.value}%${c.maxDiscount ? ` up to ₹${c.maxDiscount}` : ""}` : c.type === "fixed" ? `₹${c.value}` : "Free ship"}{c.minOrder ? <div className="admin__muted">min ₹{c.minOrder}{c.minQualifyingQuantity ? ` · ${c.minQualifyingQuantity} items` : ""}</div> : c.minQualifyingQuantity ? <div className="admin__muted">{c.minQualifyingQuantity} items</div> : null}</td>
                <td className="admin__muted">{appliesTo(c)}{c.excludeSale ? " · excl. sale" : ""}</td>
                <td className="admin__mono">{c.usedCount}{c.maxUses != null ? ` / ${c.maxUses}` : ""}{c.maxUsesPerUser != null ? <div className="admin__muted">{c.maxUsesPerUser}/cust</div> : null}</td>
                <td className="admin__muted">{c.eligibility === "first_order" ? "1st order" : "Everyone"}</td>
                <td className="admin__muted" title={s.reason}>{c.startsAt || c.expiresAt ? `${c.startsAt ? formatIST(c.startsAt, { dateOnly: true, withZone: false }) : "now"} – ${c.expiresAt ? formatIST(c.expiresAt, { dateOnly: true, withZone: false }) : "∞"}` : "—"}</td>
                <td><span className="om-pay" data-tone={STATUS_TONE[s.status]} title={s.reason}>{s.status}</span></td>
                <td><div className="ff-actions" style={{ flexWrap: "wrap" }}>
                  {(c.status === "draft" || c.status === "paused") ? <button type="button" className="ff-btn ff-btn--mini" disabled={busy} onClick={() => post({ action: "activate", id: c.id })} title="Activate">▶ activate</button> : null}
                  {c.status === "active" ? <button type="button" className="ff-btn ff-btn--mini" disabled={busy} onClick={() => post({ action: "pause", id: c.id })} title="Pause">⏸ pause</button> : null}
                  {c.status !== "archived" ? <button type="button" className="ff-btn ff-btn--mini" onClick={() => { setErr(""); setEdit(toForm(c)); }}>Edit</button> : null}
                  <button type="button" className="ff-btn ff-btn--mini" onClick={() => openTimeline(c)} title="History">log</button>
                  <button type="button" className="ff-btn ff-btn--mini" disabled={busy} onClick={() => { const code = window.prompt(`Duplicate ${c.code} as (new code):`); if (code?.trim()) post({ action: "duplicate", id: c.id, code }); }} title="Duplicate">dup</button>
                  {(c.status === "active" || c.status === "paused") ? <button type="button" className="ff-btn ff-btn--mini" disabled={busy} onClick={() => post({ action: "archive", id: c.id })} title="Archive">archive</button> : null}
                  {c.status === "archived" ? <button type="button" className="ff-btn ff-btn--mini" disabled={busy} onClick={() => post({ action: "restore", id: c.id })} title="Restore to draft">restore</button> : null}
                  {c.status === "draft" ? <button type="button" className="ff-btn ff-btn--mini ff-btn--danger" disabled={busy} onClick={() => post({ action: "delete", id: c.id })} title="Delete draft">del</button> : null}
                </div></td>
              </tr>
            );
          })}
          {rows.length === 0 ? <tr><td colSpan={8} className="admin__empty">No coupons match. Create one, or change the filters.</td></tr> : null}
        </tbody>
      </table>

      {edit ? (
        <div className="om-modal" role="dialog" aria-modal="true" onClick={() => !busy && setEdit(null)}>
          <div className="om-modal__card om-modal__card--wide" onClick={(e) => e.stopPropagation()}>
            <h2 className="om-modal__title">{edit.id ? `Edit ${edit.code}` : "New coupon"}{edit.id ? <span className="admin__muted"> · {edit.status}</span> : null}</h2>
            <div className="cfg-grid">
              <label className="cfg-field"><span>Code</span><input value={edit.code} onChange={(e) => patch({ code: e.target.value.toUpperCase() })} placeholder="WELCOME10" /></label>
              <label className="cfg-field"><span>Type</span><select value={edit.type} onChange={(e) => patch({ type: e.target.value as Form["type"] })}><option value="percent">Percent (%)</option><option value="fixed">Fixed (₹)</option><option value="free_shipping">Free shipping</option></select></label>
              {edit.type !== "free_shipping" ? <label className="cfg-field"><span>Value {edit.type === "percent" ? "(%)" : "(₹)"}</span><input type="number" value={edit.value} onChange={(e) => patch({ value: Number(e.target.value) })} /></label> : null}
              {edit.type === "percent" ? <label className="cfg-field"><span>Max discount (₹)</span><input type="number" value={edit.maxDiscount} onChange={(e) => patch({ maxDiscount: e.target.value })} placeholder="no cap" /></label> : null}
              <label className="cfg-field"><span>Min order (₹)</span><input type="number" value={edit.minOrder} onChange={(e) => patch({ minOrder: e.target.value })} /></label>
              <label className="cfg-field"><span>Min qualifying items</span><input type="number" value={edit.minQualifyingQuantity} onChange={(e) => patch({ minQualifyingQuantity: e.target.value })} placeholder="1" title="Minimum eligible units" /></label>
              <label className="cfg-field"><span>Customer eligibility</span><select value={edit.eligibility} onChange={(e) => patch({ eligibility: e.target.value as Form["eligibility"] })}><option value="everyone">Everyone</option><option value="first_order">First-order only</option></select></label>
              <label className="cfg-field"><span>Max uses (total)</span><input type="number" value={edit.maxUses} onChange={(e) => patch({ maxUses: e.target.value })} placeholder="unlimited" /></label>
              <label className="cfg-field"><span>Per customer</span><input type="number" value={edit.maxUsesPerUser} onChange={(e) => patch({ maxUsesPerUser: e.target.value })} placeholder="unlimited" /></label>
              {edit.autoApply || edit.combinable ? <label className="cfg-field"><span>Priority</span><input type="number" value={edit.priority} onChange={(e) => patch({ priority: e.target.value })} title="Lower applies first / wins ties" /></label> : null}
              <label className="cfg-field"><span>Starts (IST)</span><input type="datetime-local" value={edit.startsAt} onChange={(e) => patch({ startsAt: e.target.value })} /><small className="admin__muted">{edit.startsAt ? formatIST(istLocalToUtc(edit.startsAt)) : "no start"}</small></label>
              <label className="cfg-field"><span>Ends (IST)</span><input type="datetime-local" value={edit.expiresAt} onChange={(e) => patch({ expiresAt: e.target.value })} /><small className="admin__muted">{edit.expiresAt ? formatIST(istLocalToUtc(edit.expiresAt)) : "no end"}</small></label>
              <label className="cfg-field" data-wide="1"><span>Public description (shown to customers)</span><input value={edit.publicDescription} onChange={(e) => patch({ publicDescription: e.target.value })} placeholder="Welcome offer — 10% off your first order" /></label>
              <label className="cfg-field" data-wide="1"><span>Internal notes (admin-only — never shown to customers)</span><input value={edit.internalNotes} onChange={(e) => patch({ internalNotes: e.target.value })} placeholder="Instagram launch, Aug 2026" /></label>
            </div>
            <div className="cfg-checks">
              <label className="om-check"><input type="checkbox" checked={edit.autoApply} onChange={(e) => patch({ autoApply: e.target.checked })} /><span>Auto-apply (no code needed)</span></label>
              <label className="om-check"><input type="checkbox" checked={edit.combinable} onChange={(e) => patch({ combinable: e.target.checked })} /><span>Combinable (stack with other discounts)</span></label>
              <label className="om-check"><input type="checkbox" checked={edit.excludeSale} onChange={(e) => patch({ excludeSale: e.target.checked })} /><span>Exclude sale items</span></label>
            </div>

            <CouponTargetsEditor targets={edit.targets} options={targetOptions} onChange={(targets) => patch({ targets })} />

            {preview ? (
              <div className="cfg-preview">
                <p className="admin__eyebrow">Rule summary</p>
                <p className="cfg-preview__lines">{preview.lines.join(" · ")}</p>
                {preview.warnings.map((w, i) => <p key={i} className="cfg-preview__warn">⚠ {w}</p>)}
              </div>
            ) : null}

            {formErrors.length ? <p className="ff-err">{formErrors[0]}</p> : err ? <p className="ff-err">{err}</p> : null}
            <div className="om-modal__actions">
              <button type="button" className="ff-btn" disabled={busy} onClick={() => setEdit(null)}>Cancel</button>
              {edit.status === "active" ? (
                <button type="button" className="ff-btn ff-btn--primary" disabled={busy} onClick={() => save(edit, true)}>{busy ? "Saving…" : "Save"}</button>
              ) : (
                <>
                  <button type="button" className="ff-btn" disabled={busy || formErrors.length > 0} onClick={() => save(edit, false)}>{busy ? "Saving…" : `Save ${edit.status === "draft" ? "draft" : edit.status}`}</button>
                  <button type="button" className="ff-btn ff-btn--primary" disabled={busy} onClick={() => save(edit, true)}>{busy ? "Saving…" : "Save & activate"}</button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {timeline ? (
        <div className="om-modal" role="dialog" aria-modal="true" onClick={() => setTimeline(null)}>
          <div className="om-modal__card" onClick={(e) => e.stopPropagation()}>
            <h2 className="om-modal__title">History · {timeline.code}</h2>
            <div className="cfg-timeline">
              {timeline.entries.length === 0 ? <p className="admin__muted">No history recorded.</p> : null}
              {timeline.entries.map((e) => (
                <div key={e.id} className="cfg-timeline__row">
                  <span className="cfg-timeline__when">{formatIST(e.createdAt)}</span>
                  <span className="cfg-timeline__what">{renderAudit(e)}</span>
                  <span className="admin__muted">{e.actorType === "staff" ? "staff" : e.actorType ?? "system"}</span>
                </div>
              ))}
            </div>
            <div className="om-modal__actions"><button type="button" className="ff-btn" onClick={() => setTimeline(null)}>Close</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const fmtVal = (v: unknown) => (v == null || v === "" ? "—" : Array.isArray(v) ? (v.length ? v.join(", ") : "none") : String(v));
function renderAudit(e: CouponAuditEntry): string {
  if (e.event === "coupon.updated" && e.changes && Object.keys(e.changes).length) {
    return "Updated — " + Object.entries(e.changes).map(([f, ch]) => `${f}: ${fmtVal(ch.before)} → ${fmtVal(ch.after)}`).join("; ");
  }
  const verb = e.event.replace("coupon.", "").replace(/_/g, " ");
  return verb.charAt(0).toUpperCase() + verb.slice(1) + (e.notes ? ` (${e.notes})` : "");
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
