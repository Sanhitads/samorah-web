"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PromoBanner } from "@/services/couponAdminService";

/**
 * Promo banner editor — the admin controls whether a storefront strip advertising a code is shown
 * (the `enabled` toggle) and its text + highlighted code. Saved to the settings KV; the storefront
 * <PromoBanner> renders it site-wide when enabled.
 */
export function PromoBannerEditor({ initial }: { initial: PromoBanner }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<PromoBanner>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/admin/coupons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-banner", banner: form }) });
      const d = await res.json();
      if (!res.ok || d.ok === false) setMsg({ ok: false, text: d.error ?? d.reason ?? "Failed" });
      else { setMsg({ ok: true, text: form.enabled ? "Banner is live on the storefront." : "Banner saved (hidden)." }); startTransition(() => router.refresh()); }
    } catch { setMsg({ ok: false, text: "Network error" }); }
    setBusy(false);
  };

  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
        <p className="admin__eyebrow">Coupons · storefront</p>
        <h2 className="admin__title" style={{ fontSize: 18 }}>Promotional banner</h2>
      </div>
      {/* Live preview mirrors the storefront strip. */}
      {form.message ? (
        <div className="promo-banner" style={{ opacity: form.enabled ? 1 : 0.45, marginBottom: 12 }} role="note">
          <p className="promo-banner__text">{form.message}{form.code ? <> — <span className="promo-banner__code">{form.code.toUpperCase()}</span></> : null}</p>
        </div>
      ) : null}
      <div className="cfg-grid">
        <label className="cfg-field" data-wide="1"><span>Message</span><input value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Enjoy 10% off your first order" maxLength={200} /></label>
        <label className="cfg-field"><span>Highlight code (optional)</span><input value={form.code ?? ""} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="SAVE10" /></label>
      </div>
      <div className="cfg-checks" style={{ marginTop: 10 }}>
        <label className="om-check"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /><span>Show on storefront</span></label>
      </div>
      <div className="om-modal__actions" style={{ marginTop: 12 }}>
        {msg ? <span className={msg.ok ? "" : "ff-err"} style={msg.ok ? { color: "#2f6b3c", fontSize: 12 } : undefined}>{msg.text}</span> : null}
        {pending ? <span className="ff-refreshing">updating…</span> : null}
        <button type="button" className="ff-btn ff-btn--primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save banner"}</button>
      </div>
    </section>
  );
}
