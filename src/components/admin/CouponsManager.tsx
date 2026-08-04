"use client";

import { useState, useMemo, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdminCoupon, AdminCouponTarget, TargetOptions, CouponAuditEntry } from "@/services/couponAdminService";
import type { CouponSummaryMetrics, CouponAnalytics, ContributingOrder } from "@/services/couponAnalyticsService";
import type { CouponWarning, WarningSeverity } from "@/lib/couponWarnings";
import { validateCouponDraft, validateCouponForActivation, type CouponConfigInput } from "@/lib/couponValidation";
import { couponStatus, type CouponEffectiveStatus } from "@/lib/couponStatus";
import { istLocalToUtc, utcToIstLocal, formatIST } from "@/lib/istTime";
import { describeCoupon } from "@/lib/couponSummary";
import { generateCouponCode } from "@/lib/couponCodeGen";

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
/** paise → ₹ — whole rupees unless there's a genuine paise remainder (decimals only when necessary). */
const money = (paise: number) => {
  const r = paise / 100;
  return r % 1 === 0 ? "₹" + r.toLocaleString("en-IN") : "₹" + r.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const toForm = (c: AdminCoupon): Form => ({
  id: c.id, code: c.code, publicDescription: c.publicDescription ?? "", internalNotes: c.internalNotes ?? "",
  type: c.type, value: c.value, maxDiscount: str(c.maxDiscount), minOrder: String(c.minOrder),
  minQualifyingQuantity: str(c.minQualifyingQuantity), maxUses: str(c.maxUses), maxUsesPerUser: str(c.maxUsesPerUser),
  eligibility: c.eligibility, autoApply: c.autoApply, combinable: c.combinable, priority: String(c.priority), excludeSale: c.excludeSale,
  startsAt: utcToIstLocal(c.startsAt), expiresAt: utcToIstLocal(c.expiresAt), status: c.status, targets: c.targets.map((t) => ({ ...t })),
});
// Defaults are intentionally UNRESTRICTED: no minimum quantity, unlimited per-customer. The admin opts
// into limits explicitly (see the defaults note reported to the merchant).
const blank: Form = { code: "", publicDescription: "", internalNotes: "", type: "percent", value: 10, maxDiscount: "", minOrder: "0", minQualifyingQuantity: "", maxUses: "", maxUsesPerUser: "", eligibility: "everyone", autoApply: false, combinable: false, priority: "100", excludeSale: false, startsAt: "", expiresAt: "", status: "draft", targets: [] };

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
const SEV_ICON: Record<WarningSeverity, string> = { critical: "!", warning: "⚠", info: "ⓘ" };
const topSev = (ws: CouponWarning[]): WarningSeverity | null => ws.some((w) => w.severity === "critical") ? "critical" : ws.some((w) => w.severity === "warning") ? "warning" : ws.some((w) => w.severity === "info") ? "info" : null;

type SortKey = "created" | "updated" | "most_used" | "attr_rev" | "gross_disc" | "ending_soon";
const SORT_LABEL: Record<SortKey, string> = { created: "Recently created", updated: "Recently updated", most_used: "Most used", attr_rev: "Highest attributed revenue", gross_disc: "Highest gross discount", ending_soon: "Ending soon" };

export function CouponsManager({ coupons, targetOptions }: { coupons: AdminCoupon[]; targetOptions: TargetOptions }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState<Form | null>(null);
  const [genPrefix, setGenPrefix] = useState("");
  const [timeline, setTimeline] = useState<{ code: string; entries: CouponAuditEntry[] } | null>(null);
  const [analytics, setAnalytics] = useState<{ coupon: AdminCoupon; data: CouponAnalytics | null; orders: ContributingOrder[] | null; warnings: CouponWarning[]; error: boolean } | null>(null);
  const [analyticsLoadingId, setAnalyticsLoadingId] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [warnFor, setWarnFor] = useState<string | null>(null);

  // Filters + sort (config search/filter/sort is client-side; financial aggregation is server-side).
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState<string>("live");
  const [fType, setFType] = useState<string>("");
  const [fElig, setFElig] = useState<string>("");
  const [fApplies, setFApplies] = useState<string>("");
  const [fHealth, setFHealth] = useState<string>("");
  const [fAuto, setFAuto] = useState(false);
  const [sort, setSort] = useState<SortKey>("created");
  const filtersActive = !!(q || fStatus !== "live" || fType || fElig || fApplies || fHealth || fAuto || sort !== "created");
  const clearFilters = () => { setQ(""); setFStatus("live"); setFType(""); setFElig(""); setFApplies(""); setFHealth(""); setFAuto(false); setSort("created"); };

  // Server-computed analytics (Attributed Revenue + Gross Discount) + warnings, behind analytics.view.
  const [summary, setSummary] = useState<Record<string, CouponSummaryMetrics>>({});
  const [warnings, setWarnings] = useState<Record<string, CouponWarning[]>>({});
  const [analyticsAllowed, setAnalyticsAllowed] = useState<boolean | null>(null);

  const loadAnalytics = () => {
    fetch("/api/admin/coupons/analytics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "list" }) })
      .then(async (res) => {
        if (res.status === 403) { setAnalyticsAllowed(false); return; }
        const d = await res.json();
        if (d.ok) { setSummary(d.summary ?? {}); setWarnings(d.warnings ?? {}); setAnalyticsAllowed(true); }
      })
      .catch(() => setAnalyticsAllowed(false));
  };
  useEffect(loadAnalytics, [coupons]);
  // Close overflow menu / warning popover on any outside click.
  useEffect(() => {
    if (!menuFor && !warnFor) return;
    const h = () => { setMenuFor(null); setWarnFor(null); };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, [menuFor, warnFor]);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true); setErr(""); setMenuFor(null);
    try {
      const res = await fetch("/api/admin/coupons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      setBusy(false);
      if (!res.ok || d.ok === false) { setErr(d.error ?? d.reason ?? "Failed"); return null; }
      startTransition(() => router.refresh());
      return d;
    } catch { setBusy(false); setErr("Network error"); return null; }
  };

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
  const openAnalytics = async (c: AdminCoupon) => {
    setMenuFor(null);
    setAnalyticsLoadingId(c.id);
    setAnalytics({ coupon: c, data: null, orders: null, warnings: warnings[c.id] ?? [], error: false });
    const call = (action: string) => fetch("/api/admin/coupons/analytics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id: c.id }) }).then((r) => (r.ok ? r.json() : Promise.reject(new Error("http"))));
    try {
      const [detail, ords] = await Promise.all([call("detail"), call("orders")]);
      setAnalytics((a) => (a && a.coupon.id === c.id ? { ...a, data: detail.analytics ?? null, orders: ords.orders ?? [] } : a));
    } catch {
      setAnalytics((a) => (a && a.coupon.id === c.id ? { ...a, error: true } : a));
    } finally {
      setAnalyticsLoadingId(null);
    }
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

  const rows = useMemo(() => {
    const health = (id: string) => {
      const ws = warnings[id] ?? [];
      const codes = new Set(ws.map((w) => w.code));
      return {
        needs: ws.some((w) => w.severity === "critical" || w.severity === "warning"),
        expiring: codes.has("expiring_soon"), near: codes.has("near_limit"),
        config: codes.has("no_eligible_products") || codes.has("invalid_config") || codes.has("auto_conflict") || codes.has("archived_target"),
      };
    };
    const term = q.trim().toLowerCase();
    const filtered = coupons.filter((c) => {
      const s = effStatus(c).status;
      if (fStatus === "live" ? s === "archived" : fStatus && s !== fStatus) return false;
      if (fType && c.type !== fType) return false;
      if (fElig && c.eligibility !== fElig) return false;
      if (fAuto && !c.autoApply) return false;
      if (fApplies) {
        const inc = c.targets.filter((t) => t.mode === "include");
        if (fApplies === "entire" ? inc.length > 0 : !inc.some((t) => t.type === fApplies)) return false;
      }
      if (fHealth) {
        const h = health(c.id);
        const active = effStatus(c).status === "active";
        if (fHealth === "needs" && !h.needs) return false;
        if (fHealth === "healthy" && !(active && !h.needs)) return false;
        if (fHealth === "expiring" && !h.expiring) return false;
        if (fHealth === "near" && !h.near) return false;
        if (fHealth === "config" && !h.config) return false;
      }
      if (term && !`${c.code} ${c.publicDescription ?? ""} ${c.internalNotes ?? ""}`.toLowerCase().includes(term)) return false;
      return true;
    });
    const rev = (id: string) => summary[id]?.attributedRevenuePaise ?? -1;
    const disc = (id: string) => summary[id]?.grossDiscountPaise ?? -1;
    const time = (v: string | null) => (v ? Date.parse(v) : 0);
    const endMs = (c: AdminCoupon) => {
      const st = effStatus(c).status;
      return (st === "active" || st === "scheduled") && c.expiresAt ? Date.parse(c.expiresAt) : Number.POSITIVE_INFINITY;
    };
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sort) {
        case "updated": return time(b.updatedAt) - time(a.updatedAt);
        case "most_used": return b.usedCount - a.usedCount;
        case "attr_rev": return rev(b.id) - rev(a.id);
        case "gross_disc": return disc(b.id) - disc(a.id);
        case "ending_soon": return endMs(a) - endMs(b);
        default: return time(b.createdAt) - time(a.createdAt);
      }
    });
    return sorted;
  }, [coupons, q, fStatus, fType, fElig, fApplies, fHealth, fAuto, sort, summary, warnings]);

  const appliesTo = (c: AdminCoupon) => {
    const inc = c.targets.filter((t) => t.mode === "include");
    return inc.length ? inc.map(labelOf).join(", ") : "Entire order";
  };
  const money$ = analyticsAllowed !== false; // hide the two financial columns if analytics.view is denied
  const colCount = money$ ? 9 : 7;

  // Lower-frequency lifecycle actions → overflow menu (Edit + Analytics stay inline).
  const menuItems = (c: AdminCoupon) => {
    const items: { label: string; onClick: () => void; danger?: boolean; sep?: boolean }[] = [];
    if (c.status === "draft" || c.status === "paused") items.push({ label: "Activate", onClick: () => post({ action: "activate", id: c.id }) });
    if (c.status === "active") items.push({ label: "Pause", onClick: () => post({ action: "pause", id: c.id }) });
    items.push({ label: "Duplicate", onClick: () => { setMenuFor(null); const code = window.prompt(`Duplicate ${c.code} as (new code):`); if (code?.trim()) post({ action: "duplicate", id: c.id, code }); } });
    items.push({ label: "View history", onClick: () => { setMenuFor(null); openTimeline(c); } });
    if (c.status === "archived") items.push({ label: "Restore to draft", onClick: () => post({ action: "restore", id: c.id }) });
    if (c.status === "active" || c.status === "paused") items.push({ label: "Archive", onClick: () => post({ action: "archive", id: c.id }), danger: true, sep: true });
    if (c.status === "draft") items.push({ label: "Delete draft", onClick: () => post({ action: "delete", id: c.id }), danger: true, sep: true });
    return items;
  };

  return (
    <div className="cfg cpn">
      {/* Zone 1: search + primary action */}
      <div className="cpn-toolbar__top">
        <div className="cpn-search">
          <span className="cpn-search__icon" aria-hidden>⌕</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code, description or notes" aria-label="Search coupons" />
        </div>
        <button type="button" className="ff-btn ff-btn--primary" onClick={() => { setErr(""); setGenPrefix(""); setEdit({ ...blank }); }}>+ New coupon</button>
      </div>
      {/* Zone 2: filters (left) + sort (right) */}
      <div className="cpn-toolbar__filters">
        <div className="cpn-filtergroup">
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="Status"><option value="live">All (live)</option><option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="active">Active</option><option value="paused">Paused</option><option value="expired">Expired</option><option value="exhausted">Exhausted</option><option value="archived">Archived</option><option value="">Everything</option></select>
          <select value={fHealth} onChange={(e) => setFHealth(e.target.value)} aria-label="Operational health"><option value="">All health</option><option value="needs">Needs attention</option><option value="healthy">Healthy</option><option value="expiring">Expiring soon</option><option value="near">Near usage limit</option><option value="config">Configuration issue</option></select>
          <select value={fType} onChange={(e) => setFType(e.target.value)} aria-label="Type"><option value="">All types</option><option value="percent">Percent</option><option value="fixed">Fixed</option><option value="free_shipping">Free shipping</option></select>
          <select value={fApplies} onChange={(e) => setFApplies(e.target.value)} aria-label="Applies to"><option value="">Any target</option><option value="entire">Entire order</option><option value="category">Category</option><option value="collection">Chapter</option><option value="product">Product</option><option value="product_type">Product type</option><option value="variant">Variant</option></select>
          <select value={fElig} onChange={(e) => setFElig(e.target.value)} aria-label="Customer"><option value="">All customers</option><option value="everyone">Everyone</option><option value="first_order">First order</option></select>
          <label className="om-check cpn-autocheck"><input type="checkbox" checked={fAuto} onChange={(e) => setFAuto(e.target.checked)} /><span>Auto-apply</span></label>
        </div>
        <div className="cpn-sortgroup">
          {filtersActive ? <button type="button" className="cpn-clear" onClick={clearFilters}>Clear filters</button> : null}
          <label className="cpn-sort">Sort <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort">{(Object.keys(SORT_LABEL) as SortKey[]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}</select></label>
        </div>
      </div>
      <div className="cpn-meta">
        <span className="admin__muted">Showing {rows.length} of {coupons.length} coupons</span>
        {pending ? <span className="ff-refreshing">updating…</span> : null}
        {err && !edit ? <span className="ff-err">{err}</span> : null}
      </div>

      <div className="admin__table-wrap">
        <table className="admin__table admin__table--board cpn-table">
          <thead><tr>
            <th>Code</th><th>Offer</th><th>Applies to</th><th title="Successful (paid) redemptions, and capacity used vs limit. Capacity includes live reservations.">Usage</th>
            {money$ ? <th title="Net merchandise attributed to this coupon (pro-rata by discount share, refund-netted). An attribution model — not accounting revenue, profit, ROI or ROAS.">Attributed Revenue</th> : null}
            {money$ ? <th title="Historical promotional value given, before refund netting. Subsequent refunds do NOT claw this back.">Gross Discount Given</th> : null}
            <th>Validity (IST)</th><th>Status</th><th>Actions</th>
          </tr></thead>
          <tbody>
            {rows.map((c) => {
              const s = effStatus(c);
              const m = summary[c.id];
              const ws = warnings[c.id] ?? [];
              const sev = topSev(ws);
              return (
                <tr key={c.id}>
                  <td className="admin__mono cpn-code">{c.code}{c.autoApply ? <span className="admin__muted"> · auto</span> : null}{c.publicDescription ? <div className="cpn-sub">{c.publicDescription}</div> : null}</td>
                  <td>{c.type === "percent" ? `${c.value}%${c.maxDiscount ? ` up to ₹${c.maxDiscount}` : ""}` : c.type === "fixed" ? `₹${c.value}` : "Free ship"}{c.eligibility === "first_order" ? <div className="cpn-sub">1st order</div> : null}{c.minOrder ? <div className="cpn-sub">min ₹{c.minOrder}{c.minQualifyingQuantity ? ` · ${c.minQualifyingQuantity} items` : ""}</div> : c.minQualifyingQuantity ? <div className="cpn-sub">{c.minQualifyingQuantity} items</div> : null}</td>
                  <td className="cpn-sub">{appliesTo(c)}{c.excludeSale ? " · excl. sale" : ""}</td>
                  <td className="cpn-usage"><span>Redemptions {m ? m.successfulRedemptions : 0}</span><span className="cpn-sub">Capacity {c.maxUses != null ? `${c.usedCount} / ${c.maxUses}` : "Unlimited"}</span></td>
                  {money$ ? <td className="admin__mono">{m ? money(m.attributedRevenuePaise) : "—"}</td> : null}
                  {money$ ? <td className="admin__mono">{m ? money(m.grossDiscountPaise) : "—"}</td> : null}
                  <td className="cpn-sub" title={s.reason}>{c.startsAt || c.expiresAt ? `${c.startsAt ? formatIST(c.startsAt, { dateOnly: true, withZone: false }) : "now"} – ${c.expiresAt ? formatIST(c.expiresAt, { dateOnly: true, withZone: false }) : "∞"}` : "—"}</td>
                  <td className="cpn-statuscell cpn-warncell">
                    <span className="om-pay" data-tone={STATUS_TONE[s.status]} title={s.reason}>{s.status}</span>
                    {sev ? (
                      <>
                        <button type="button" className={`cpn-warn cpn-warn--${sev}`} onClick={(e) => { e.stopPropagation(); setWarnFor(warnFor === c.id ? null : c.id); setMenuFor(null); }} aria-label={`${ws.length} ${sev} warning${ws.length > 1 ? "s" : ""}`}>{SEV_ICON[sev]} {ws.length}</button>
                        {warnFor === c.id ? (
                          <div className="cpn-pop" onClick={(e) => e.stopPropagation()}>
                            {ws.map((w, i) => <p key={i} className={`cpn-pop__row cpn-pop__row--${w.severity}`}><span>{SEV_ICON[w.severity]}</span> {w.message}</p>)}
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </td>
                  <td>
                    <div className="cpn-rowactions">
                      {c.status !== "archived" ? <button type="button" className="ff-btn ff-btn--mini" onClick={() => { setErr(""); setEdit(toForm(c)); }}>Edit</button> : null}
                      {money$ ? <button type="button" className="ff-btn ff-btn--mini" disabled={analyticsLoadingId === c.id} onClick={() => openAnalytics(c)}>{analyticsLoadingId === c.id ? "…" : "Analytics"}</button> : null}
                      <div className="cpn-morewrap">
                        <button type="button" className="ff-btn ff-btn--mini cpn-more" aria-label="More actions" aria-haspopup="menu" onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === c.id ? null : c.id); setWarnFor(null); }}>•••</button>
                        {menuFor === c.id ? (
                          <div className="cpn-menu" role="menu" onClick={(e) => e.stopPropagation()}>
                            {menuItems(c).map((it, i) => (
                              <button key={i} type="button" role="menuitem" className={`cpn-menu__item${it.danger ? " cpn-menu__item--danger" : ""}${it.sep ? " cpn-menu__item--sep" : ""}`} disabled={busy} onClick={it.onClick}>{it.label}</button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? <tr><td colSpan={colCount} className="admin__empty">No coupons match. {filtersActive ? <button type="button" className="cpn-clear" onClick={clearFilters}>Clear filters</button> : "Create one to get started."}</td></tr> : null}
          </tbody>
        </table>
      </div>

      {edit ? (
        <div className="om-modal" role="dialog" aria-modal="true" onClick={() => !busy && setEdit(null)}>
          <div className="om-modal__card om-modal__card--wide" onClick={(e) => e.stopPropagation()}>
            <h2 className="om-modal__title">{edit.id ? `Edit ${edit.code}` : "New coupon"}{edit.id ? <span className="admin__muted"> · {edit.status}</span> : null}</h2>

            <section className="cfg-section">
              <h4 className="cfg-section__h">Offer &amp; limits</h4>
              <div className="cfg-grid">
                <label className="cfg-field" data-wide="1"><span>Code</span>
                  <div className="cpn-codegen">
                    <input value={edit.code} onChange={(e) => patch({ code: e.target.value.toUpperCase() })} placeholder="WELCOME10" />
                    <input value={genPrefix} onChange={(e) => setGenPrefix(e.target.value)} placeholder="prefix (optional)" title="Optional prefix for Generate, e.g. WELCOME → WELCOME-K7M9P" />
                    <button type="button" className="ff-btn ff-btn--mini" onClick={() => patch({ code: generateCouponCode(genPrefix) })} title="Generate a readable, unguessable code (manual entry still works)">Generate</button>
                  </div>
                </label>
                <label className="cfg-field"><span>Type</span><select value={edit.type} onChange={(e) => patch({ type: e.target.value as Form["type"] })}><option value="percent">Percent (%)</option><option value="fixed">Fixed (₹)</option><option value="free_shipping">Free shipping</option></select></label>
                {edit.type !== "free_shipping" ? <label className="cfg-field"><span>Value {edit.type === "percent" ? "(%)" : "(₹)"}</span><input type="number" value={edit.value} onChange={(e) => patch({ value: Number(e.target.value) })} /></label> : null}
                {edit.type === "percent" ? <label className="cfg-field"><span>Max discount (₹)</span><input type="number" value={edit.maxDiscount} onChange={(e) => patch({ maxDiscount: e.target.value })} placeholder="no cap" /></label> : null}
                <label className="cfg-field"><span>Min order (₹)</span><input type="number" value={edit.minOrder} onChange={(e) => patch({ minOrder: e.target.value })} /></label>
                <label className="cfg-field"><span>Min qualifying items</span><input type="number" value={edit.minQualifyingQuantity} onChange={(e) => patch({ minQualifyingQuantity: e.target.value })} placeholder="none" title="Minimum eligible units (blank = no minimum)" /></label>
                <label className="cfg-field"><span>Max uses (total)</span><input type="number" value={edit.maxUses} onChange={(e) => patch({ maxUses: e.target.value })} placeholder="unlimited" /></label>
                <label className="cfg-field"><span>Per customer</span><input type="number" value={edit.maxUsesPerUser} onChange={(e) => patch({ maxUsesPerUser: e.target.value })} placeholder="unlimited" /></label>
              </div>
            </section>

            <section className="cfg-section">
              <h4 className="cfg-section__h">Eligibility</h4>
              <div className="cfg-grid">
                <label className="cfg-field"><span>Customer eligibility</span><select value={edit.eligibility} onChange={(e) => patch({ eligibility: e.target.value as Form["eligibility"] })}><option value="everyone">Everyone</option><option value="first_order">First-order only</option></select></label>
              </div>
            </section>

            <section className="cfg-section">
              <h4 className="cfg-section__h">Schedule</h4>
              <div className="cfg-grid">
                <label className="cfg-field"><span>Starts (IST)</span><input type="datetime-local" value={edit.startsAt} onChange={(e) => patch({ startsAt: e.target.value })} /><small className="admin__muted">{edit.startsAt ? formatIST(istLocalToUtc(edit.startsAt)) : "no start"}</small></label>
                <label className="cfg-field"><span>Ends (IST)</span><input type="datetime-local" value={edit.expiresAt} onChange={(e) => patch({ expiresAt: e.target.value })} /><small className="admin__muted">{edit.expiresAt ? formatIST(istLocalToUtc(edit.expiresAt)) : "no end"}</small></label>
              </div>
            </section>

            <section className="cfg-section">
              <h4 className="cfg-section__h">Customer messaging</h4>
              <div className="cfg-grid">
                <label className="cfg-field" data-wide="1"><span>Public description (shown to customers)</span><input value={edit.publicDescription} onChange={(e) => patch({ publicDescription: e.target.value })} placeholder="Welcome offer — 10% off your first order" /></label>
                <label className="cfg-field" data-wide="1"><span>Internal notes (admin-only — never shown to customers)</span><input value={edit.internalNotes} onChange={(e) => patch({ internalNotes: e.target.value })} placeholder="Instagram launch, Aug 2026" /></label>
              </div>
            </section>

            <section className="cfg-section">
              <h4 className="cfg-section__h">Promotion behaviour</h4>
              <div className="cfg-checks">
                <label className="om-check"><input type="checkbox" checked={edit.autoApply} onChange={(e) => patch({ autoApply: e.target.checked })} /><span>Auto-apply (no code needed)</span></label>
                <label className="om-check"><input type="checkbox" checked={edit.combinable} onChange={(e) => patch({ combinable: e.target.checked })} /><span>Combinable (stack with other discounts)</span></label>
                <label className="om-check"><input type="checkbox" checked={edit.excludeSale} onChange={(e) => patch({ excludeSale: e.target.checked })} /><span>Exclude sale items</span></label>
                {edit.autoApply || edit.combinable ? <label className="cfg-field cfg-field--inline"><span>Priority</span><input type="number" value={edit.priority} onChange={(e) => patch({ priority: e.target.value })} title="Lower applies first / wins ties" /></label> : null}
              </div>
            </section>

            <section className="cfg-section">
              <h4 className="cfg-section__h">Targeting &amp; exclusions</h4>
              <CouponTargetsEditor targets={edit.targets} options={targetOptions} onChange={(targets) => patch({ targets })} />
            </section>

            {preview ? (
              <section className="cfg-section">
                <h4 className="cfg-section__h">Rule summary</h4>
                <div className="cfg-preview">
                  <p className="cfg-preview__lines">{preview.lines.join(" · ")}</p>
                  {preview.warnings.length ? (
                    <div className="cfg-preview__warns">
                      {preview.warnings.map((w, i) => <p key={i} className="cfg-preview__warn">⚠ {w}</p>)}
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}

            {formErrors.length ? <p className="ff-err">{formErrors[0]}</p> : err ? <p className="ff-err">{err}</p> : null}
            <div className="om-modal__actions">
              <button type="button" className="ff-btn" disabled={busy} onClick={() => setEdit(null)}>Cancel</button>
              {edit.status === "active" ? (
                <button type="button" className="ff-btn ff-btn--primary" disabled={busy} onClick={() => save(edit, true)}>{busy ? "Saving…" : "Save changes"}</button>
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

      {analytics ? <AnalyticsModal a={analytics} onRetry={() => openAnalytics(analytics.coupon)} onClose={() => setAnalytics(null)} /> : null}

      {timeline ? (
        <div className="om-modal" role="dialog" aria-modal="true" onClick={() => setTimeline(null)}>
          <div className="om-modal__card" onClick={(e) => e.stopPropagation()}>
            <h2 className="om-modal__title">History · {timeline.code}</h2>
            <div className="cfg-timeline">
              {timeline.entries.length === 0 ? <p className="admin__muted">No changes recorded yet.</p> : null}
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

/** Read-only per-coupon analytics + contributing-orders drill-down (deep-links to the Order Command Centre). */
function AnalyticsModal({ a, onRetry, onClose }: { a: { coupon: AdminCoupon; data: CouponAnalytics | null; orders: ContributingOrder[] | null; warnings: CouponWarning[]; error: boolean }; onRetry: () => void; onClose: () => void }) {
  const d = a.data;
  const money2 = (paise: number) => { const r = paise / 100; return r % 1 === 0 ? "₹" + r.toLocaleString("en-IN") : "₹" + r.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  const stat = (label: string, value: string, title?: string, primary?: boolean) => (
    <div className={`cpn-stat${primary ? " cpn-stat--primary" : ""}`} title={title}><span className="cpn-stat__v">{value}</span><span className="cpn-stat__l">{label}{title ? <span className="cpn-stat__i" aria-hidden> ⓘ</span> : null}</span></div>
  );
  const cap = d ? (d.maxUses != null ? `${d.usedCount} / ${d.maxUses}` : `${d.usedCount} · Unlimited`) : "—";
  return (
    <div className="om-modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="om-modal__card om-modal__card--wide" onClick={(e) => e.stopPropagation()}>
        <h2 className="om-modal__title">Analytics · {a.coupon.code}</h2>
        {a.error ? (
          <div className="cpn-analytics-state"><p>Couldn’t load analytics.</p><button type="button" className="ff-btn ff-btn--mini" onClick={onRetry}>Retry</button></div>
        ) : !d ? (
          <p className="admin__muted cpn-analytics-state">Loading coupon analytics…</p>
        ) : (
          <>
            {d.isFreeShipping ? <p className="admin__muted cpn-fsnote">Free-shipping coupon — its benefit is shipping, so it earns ₹0 <em>merchandise</em> attributed revenue by design (Model A).</p> : null}
            <div className="cpn-stats cpn-stats--primary">
              {stat("Attributed Revenue", money2(d.attributedRevenuePaise), "Net Merchandise Attributed Revenue — an attribution model, not accounting revenue / profit / ROI / ROAS.", true)}
              {stat("Gross Discount Given", money2(d.grossDiscountPaise), "Historical promotional value given, before refund netting. Refunds do NOT claw this back.", true)}
              {stat("Successful Redemptions", String(d.successfulRedemptions), "Payment-proven completed redemptions (consumed/restored, paid).", true)}
              {stat("Orders", String(d.ordersUsingCoupon), undefined, true)}
            </div>
            <div className="cpn-stats cpn-stats--secondary">
              {stat("Unique Customers", String(d.uniqueCustomers), "Distinct account identity or normalized guest email. The same person using multiple identities may be counted more than once.")}
              {stat("Attributed Revenue / Order", d.attributedAovPaise != null ? money2(d.attributedAovPaise) : "—")}
              {stat("Avg Discount / Order", d.avgDiscountPerOrderPaise != null ? money2(d.avgDiscountPerOrderPaise) : "—")}
              {stat("Usage / Capacity", cap, "Capacity includes live reservations, so it can exceed successful redemptions.")}
              {stat("Attribution Efficiency", d.efficiencyRatio != null ? `${d.efficiencyRatio.toFixed(1)}×` : "—", "Revenue attributed per ₹1 of gross coupon discount. An efficiency ratio — NOT profit, ROI or ROAS.")}
            </div>
            {a.warnings.length ? (
              <div className="cpn-warnlist">
                {a.warnings.map((w, i) => <p key={i} className={`cpn-pop__row cpn-pop__row--${w.severity}`}><span>{SEV_ICON[w.severity]}</span> {w.message}</p>)}
              </div>
            ) : null}
            <p className="admin__eyebrow cpn-orders__h">Contributing orders</p>
            <div className="cpn-orders">
              <table className="admin__table cpn-table">
                <thead><tr><th>Order #</th><th>Date</th><th>Customer</th><th>Order Value</th><th>Coupon Discount</th><th>Attributed Revenue</th><th>State</th></tr></thead>
                <tbody>
                  {(a.orders ?? []).map((o) => (
                    <tr key={o.orderNumber}>
                      <td className="admin__mono"><a href={`/admin/orders/${o.orderNumber}`} target="_blank" rel="noreferrer">{o.orderNumber}</a></td>
                      <td className="cpn-sub">{formatIST(o.createdAt, { dateOnly: true, withZone: false })}</td>
                      <td className="cpn-sub">{o.customer}</td>
                      <td className="admin__mono">{money2(o.orderValuePaise)}</td>
                      <td className="admin__mono">{money2(o.couponDiscountPaise)}</td>
                      <td className="admin__mono">{money2(o.attributedRevenuePaise)}</td>
                      <td><span className="om-pay" data-tone={o.paymentState === "refunded" ? "refunded" : o.paymentState === "partially_refunded" ? "refundprog" : "paid"}>{o.paymentState}</span></td>
                    </tr>
                  ))}
                  {a.orders && a.orders.length === 0 ? <tr><td colSpan={7} className="admin__empty">No qualifying orders yet.</td></tr> : null}
                  {!a.orders ? <tr><td colSpan={7} className="admin__muted">Loading…</td></tr> : null}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="om-modal__actions"><button type="button" className="ff-btn" onClick={onClose}>Close</button></div>
      </div>
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
