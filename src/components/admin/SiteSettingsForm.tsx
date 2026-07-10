"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SiteSettings } from "@/services/siteSettingsService";

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

  const g = <K extends keyof SiteSettings>(group: K, key: keyof SiteSettings[K], v: string | boolean) =>
    setS((p) => ({ ...p, [group]: { ...p[group], [key]: v } }));

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/admin/settings/site", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patch: s }) });
      const d = await res.json();
      setBusy(false);
      if (!res.ok) { setMsg({ tone: "err", text: d.error ?? "Failed" }); return; }
      setMsg({ tone: "ok", text: "Saved." });
      startTransition(() => router.refresh());
    } catch { setBusy(false); setMsg({ tone: "err", text: "Network error" }); }
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
        <label className="cfg-field"><span>Packaging cost / order (₹)</span><input type="number" value={s.costs.packagingPerOrder} onChange={(e) => setS((p) => ({ ...p, costs: { ...p.costs, packagingPerOrder: Number(e.target.value) } }))} /></label>
        <label className="cfg-field"><span>Courier cost / order (₹)</span><input type="number" value={s.costs.shippingCostPerOrder} onChange={(e) => setS((p) => ({ ...p, costs: { ...p.costs, shippingCostPerOrder: Number(e.target.value) } }))} /></label>
        <label className="cfg-field"><span>Payment gateway fee (%)</span><input type="number" step="0.1" value={s.costs.paymentFeePercent} onChange={(e) => setS((p) => ({ ...p, costs: { ...p.costs, paymentFeePercent: Number(e.target.value) } }))} /></label>
      </div>
      <p className="cfg-hint">Per-unit product cost (COGS) is set on each variant under Products; these are the flat per-order and gateway costs the orders can’t tell us.</p>

      <p className="cfg-sub">Announcement bar</p>
      <label className="cfg-field"><span>Text</span><input value={s.announcement.text} onChange={(e) => g("announcement", "text", e.target.value)} placeholder="Complimentary shipping over ₹1,499" /></label>
      <div className="cfg-grid">
        <label className="cfg-field"><span>Link (optional)</span><input value={s.announcement.link} onChange={(e) => g("announcement", "link", e.target.value)} /></label>
      </div>
      <label className="om-check"><input type="checkbox" checked={s.announcement.active} onChange={(e) => g("announcement", "active", e.target.checked)} /><span>Show announcement bar</span></label>

      <div className="cfg-actions">
        <button type="button" className="ff-btn ff-btn--primary" disabled={busy || pending} onClick={save}>{busy ? "Saving…" : "Save settings"}</button>
        {msg ? <span className={`cfg-msg cfg-msg--${msg.tone}`}>{msg.text}</span> : null}
      </div>
    </div>
  );
}
