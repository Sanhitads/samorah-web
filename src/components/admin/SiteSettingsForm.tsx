"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SiteSettings } from "@/services/siteSettingsService";
import { validateCosts, type CostValidationError } from "@/lib/settings/costValidation";
import { validateDispatch, type DispatchValidationError } from "@/lib/settings/dispatchValidation";
import { validateShipping, type ShippingValidationError } from "@/lib/settings/shippingValidation";
import { shouldGuardNavigation } from "@/lib/bundleNavGuard";

const FEATURE_LABELS: Record<string, string> = {
  reviews: "Reviews", wishlist: "Wishlist", rewards: "Rewards / Loyalty", blog: "Journal / Blog",
  wholesale: "Wholesale", referral: "Referral", subscription: "Subscriptions", aiSearch: "AI Search",
};

/** General site settings editor (brand · support · social · SEO · analytics · announcement). */
export function SiteSettingsForm({ settings }: { settings: SiteSettings }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: string; text: string } | null>(null);
  const [s, setS] = useState<SiteSettings>(settings);
  const [baseline, setBaseline] = useState<SiteSettings>(settings); // last-saved snapshot (dirty authority)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const dirty = JSON.stringify(s) !== JSON.stringify(baseline);

  const g = <K extends keyof SiteSettings>(group: K, key: keyof SiteSettings[K], v: string | boolean) =>
    setS((p) => ({ ...p, [group]: { ...p[group], [key]: v } }));

  // Unsaved-changes warning — reuse the Bundle-CMS guard (browser close/refresh + in-app navigation).
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!dirtyRef.current) return;
      const a = (e.target as HTMLElement)?.closest?.("a") as HTMLAnchorElement | null;
      if (!a) return;
      const guard = shouldGuardNavigation(
        { button: e.button, modified: e.metaKey || e.ctrlKey || e.shiftKey || e.altKey, rawHref: a.getAttribute("href"), absoluteHref: a.href, target: a.target || null, download: a.hasAttribute("download") },
        { origin: window.location.origin, pathname: window.location.pathname },
      );
      if (guard && !window.confirm("You have unsaved Settings changes. Leave without saving?")) { e.preventDefault(); e.stopPropagation(); }
    };
    document.addEventListener("click", onDocClick, true);
    return () => document.removeEventListener("click", onDocClick, true);
  }, []);

  const save = async () => {
    // Client-side corrective validation first (server re-checks — defense-in-depth).
    const errs: (CostValidationError | DispatchValidationError | ShippingValidationError)[] = [...validateCosts(s.costs), ...validateDispatch(s.dispatch), ...validateShipping(s.shipping)];
    if (errs.length) {
      setFieldErrors(Object.fromEntries(errs.map((e) => [e.field, e.message])));
      setMsg({ tone: "err", text: `Please correct ${errs.length} field${errs.length > 1 ? "s" : ""} below before saving.` });
      return;
    }
    setFieldErrors({}); setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/admin/settings/site", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patch: s }) });
      const d = await res.json();
      setBusy(false);
      if (!res.ok) {
        if (Array.isArray(d.fieldErrors)) setFieldErrors(Object.fromEntries(d.fieldErrors.map((e: { field: string; message: string }) => [e.field, e.message])));
        setMsg({ tone: "err", text: d.error ?? "Could not save." });
        return;
      }
      setBaseline(s); // now clean at the saved snapshot
      setMsg({ tone: "ok", text: "Saved." });
      startTransition(() => router.refresh());
    } catch { setBusy(false); setMsg({ tone: "err", text: "Network error — check your connection and try again." }); }
  };

  return (
    <div className="cfg">
      <p className="cfg-sub">Brand</p>
      <div className="cfg-grid">
        <label className="cfg-field"><span>Brand name</span><input value={s.brand.name} onChange={(e) => g("brand", "name", e.target.value)} /></label>
        <label className="cfg-field"><span>Tagline</span><input value={s.brand.tagline} onChange={(e) => g("brand", "tagline", e.target.value)} /></label>
      </div>

      <p className="cfg-sub">Support</p>
      <div className="cfg-grid">
        <label className="cfg-field"><span>Support email</span><input value={s.support.email} onChange={(e) => g("support", "email", e.target.value)} /></label>
        <label className="cfg-field"><span>Support phone</span><input value={s.support.phone} onChange={(e) => g("support", "phone", e.target.value)} /></label>
        <label className="cfg-field"><span>Support hours</span><input value={s.support.hours} onChange={(e) => g("support", "hours", e.target.value)} placeholder="Mon–Sat 10–6" /></label>
      </div>

      <p className="cfg-sub">Social links</p>
      <div className="cfg-grid">
        <label className="cfg-field"><span>Instagram</span><input value={s.social.instagram} onChange={(e) => g("social", "instagram", e.target.value)} placeholder="https://instagram.com/…" /></label>
        <label className="cfg-field"><span>Pinterest</span><input value={s.social.pinterest} onChange={(e) => g("social", "pinterest", e.target.value)} /></label>
        <label className="cfg-field"><span>Spotify</span><input value={s.social.spotify} onChange={(e) => g("social", "spotify", e.target.value)} /></label>
        <label className="cfg-field"><span>Facebook</span><input value={s.social.facebook} onChange={(e) => g("social", "facebook", e.target.value)} /></label>
      </div>

      <p className="cfg-sub">SEO defaults</p>
      <div className="cfg-grid">
        <label className="cfg-field"><span>Title suffix</span><input value={s.seo.titleSuffix} onChange={(e) => g("seo", "titleSuffix", e.target.value)} placeholder=" · Samorah" /></label>
        <label className="cfg-field"><span>Default description</span><input value={s.seo.defaultDescription} onChange={(e) => g("seo", "defaultDescription", e.target.value)} /></label>
        <label className="cfg-field"><span>Default OG image URL</span><input value={s.seo.ogImageUrl} onChange={(e) => g("seo", "ogImageUrl", e.target.value)} /></label>
      </div>

      <p className="cfg-sub">Analytics</p>
      <div className="cfg-grid">
        <label className="cfg-field"><span>GA4 Measurement ID</span><input value={s.analytics.gaId} onChange={(e) => g("analytics", "gaId", e.target.value)} placeholder="G-XXXXXXX" /></label>
      </div>

      <p className="cfg-sub">Feature flags (toggle modules — no deploy)</p>
      <div className="cfg-checks" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        {Object.keys(s.features).map((k) => (
          <label key={k} className="om-check"><input type="checkbox" checked={s.features[k as keyof typeof s.features]} onChange={(e) => setS((p) => ({ ...p, features: { ...p.features, [k]: e.target.checked } }))} /><span>{FEATURE_LABELS[k] ?? k}</span></label>
        ))}
      </div>

      <p className="cfg-sub">Maintenance & store notice</p>
      <label className="om-check"><input type="checkbox" checked={s.maintenance.enabled} onChange={(e) => g("maintenance", "enabled", e.target.checked)} /><span>Maintenance mode (storefront lockout — admin stays open)</span></label>
      <label className="cfg-field"><span>Maintenance message</span><input value={s.maintenance.message} onChange={(e) => g("maintenance", "message", e.target.value)} /></label>
      <label className="om-check"><input type="checkbox" checked={s.storeNotice.active} onChange={(e) => g("storeNotice", "active", e.target.checked)} /><span>Show store notice banner</span></label>
      <label className="cfg-field"><span>Store notice text</span><input value={s.storeNotice.text} onChange={(e) => g("storeNotice", "text", e.target.value)} placeholder="Dispatch paused 12–15 Aug for a short break" /></label>

      <p className="cfg-sub">Operating costs (feed the Profit report)</p>
      <div className="cfg-grid">
        <label className="cfg-field"><span>Packaging cost / order (₹)</span><input type="number" min="0" aria-invalid={!!fieldErrors.packagingPerOrder} value={s.costs.packagingPerOrder} onChange={(e) => setS((p) => ({ ...p, costs: { ...p.costs, packagingPerOrder: Number(e.target.value) } }))} />{fieldErrors.packagingPerOrder ? <span className="ff-err" role="alert">{fieldErrors.packagingPerOrder}</span> : null}</label>
        <label className="cfg-field"><span>Courier cost / order (₹)</span><input type="number" min="0" aria-invalid={!!fieldErrors.shippingCostPerOrder} value={s.costs.shippingCostPerOrder} onChange={(e) => setS((p) => ({ ...p, costs: { ...p.costs, shippingCostPerOrder: Number(e.target.value) } }))} />{fieldErrors.shippingCostPerOrder ? <span className="ff-err" role="alert">{fieldErrors.shippingCostPerOrder}</span> : null}</label>
        <label className="cfg-field"><span>Payment gateway fee (%)</span><input type="number" step="0.1" min="0" max="100" aria-invalid={!!fieldErrors.paymentFeePercent} value={s.costs.paymentFeePercent} onChange={(e) => setS((p) => ({ ...p, costs: { ...p.costs, paymentFeePercent: Number(e.target.value) } }))} />{fieldErrors.paymentFeePercent ? <span className="ff-err" role="alert">{fieldErrors.paymentFeePercent}</span> : null}</label>
      </div>
      <p className="cfg-hint">Per-unit product cost (COGS) is set on each variant under Products; these are the flat per-order and gateway costs the orders can’t tell us.</p>

      <p className="cfg-sub">Dispatch &amp; cutoff</p>
      <div className="cfg-grid">
        <label className="cfg-field"><span>Same-day cutoff time (HH:MM)</span><input type="time" aria-invalid={!!fieldErrors.cutoffTime} value={s.dispatch.cutoffTime} onChange={(e) => setS((p) => ({ ...p, dispatch: { ...p.dispatch, cutoffTime: e.target.value } }))} />{fieldErrors.cutoffTime ? <span className="ff-err" role="alert">{fieldErrors.cutoffTime}</span> : null}</label>
        <label className="cfg-field"><span>Dispatch SLA (hours)</span><input type="number" min="0" max="240" aria-invalid={!!fieldErrors.slaHours} value={s.dispatch.slaHours} onChange={(e) => setS((p) => ({ ...p, dispatch: { ...p.dispatch, slaHours: Number(e.target.value) } }))} />{fieldErrors.slaHours ? <span className="ff-err" role="alert">{fieldErrors.slaHours}</span> : null}</label>
      </div>
      <p className="cfg-hint">Orders placed before the cutoff dispatch same day; the SLA is the promised dispatch window, in hours.</p>

      <p className="cfg-sub">Shipping</p>
      <div className="cfg-grid">
        <label className="cfg-field"><span>Free shipping threshold (₹)</span><input type="number" min="0" step="1" aria-invalid={!!fieldErrors.freeThreshold} value={s.shipping.freeThreshold} onChange={(e) => setS((p) => ({ ...p, shipping: { ...p.shipping, freeThreshold: Number(e.target.value) } }))} />{fieldErrors.freeThreshold ? <span className="ff-err" role="alert">{fieldErrors.freeThreshold}</span> : null}</label>
      </div>
      <p className="cfg-hint">The single source of truth for free shipping — this same amount drives the checkout charge, the cart’s “free shipping remaining” hint, and the Shipping Policy copy. Set to 0 to ship everything free.</p>

      <p className="cfg-sub">Announcement bar</p>
      <label className="cfg-field"><span>Text</span><input value={s.announcement.text} onChange={(e) => g("announcement", "text", e.target.value)} placeholder="Complimentary shipping over ₹1,499" /></label>
      <div className="cfg-grid">
        <label className="cfg-field"><span>Link (optional)</span><input value={s.announcement.link} onChange={(e) => g("announcement", "link", e.target.value)} /></label>
      </div>
      <label className="om-check"><input type="checkbox" checked={s.announcement.active} onChange={(e) => g("announcement", "active", e.target.checked)} /><span>Show announcement bar</span></label>

      <div className="cfg-actions">
        <button type="button" className="ff-btn ff-btn--primary" disabled={busy || pending} onClick={save}>{busy ? "Saving…" : "Save settings"}</button>
        {msg ? <span className={`cfg-msg cfg-msg--${msg.tone}`} role={msg.tone === "err" ? "alert" : undefined}>{msg.text}</span> : null}
        {dirty && !busy ? <span className="cfg-msg admin__muted" aria-live="polite">Unsaved changes</span> : null}
      </div>
    </div>
  );
}
