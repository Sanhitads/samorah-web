"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ShippingSettings } from "@/lib/settings/shippingSettings";

const STRATEGIES = ["manual", "cheapest", "fastest", "luxury", "preferred"];
const FRAGILE = ["auto", "always", "never"];
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function ShippingSettingsForm({
  settings,
  providers,
  warehouses,
}: {
  settings: ShippingSettings;
  providers: { name: string; configured: boolean }[];
  warehouses: { id: string; name: string; active: boolean }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err" | "warn"; text: string } | null>(null);
  const [s, setS] = useState<ShippingSettings>(settings);

  const set = <K extends keyof ShippingSettings>(k: K, v: ShippingSettings[K]) => setS((prev) => ({ ...prev, [k]: v }));
  const toggleDay = (d: string) => set("workingDays", s.workingDays.includes(d) ? s.workingDays.filter((x) => x !== d) : [...s.workingDays, d]);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/settings/shipping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patch: s }),
      });
      const d = await res.json();
      if (!res.ok) { setMsg({ tone: "err", text: d.error ?? "Failed" }); setBusy(false); return; }
      setMsg(d.warnings?.length ? { tone: "warn", text: `Saved. ${d.warnings.join(" ")}` } : { tone: "ok", text: "Saved." });
      startTransition(() => router.refresh());
    } catch { setMsg({ tone: "err", text: "Network error" }); }
    setBusy(false);
  };

  return (
    <div className="cfg">
      <div className="cfg-grid">
        <label className="cfg-field"><span>Default provider</span>
          <select value={s.defaultProvider} onChange={(e) => set("defaultProvider", e.target.value)}>
            {providers.map((p) => <option key={p.name} value={p.name}>{p.name}{p.configured ? "" : " (no adapter)"}</option>)}
          </select>
        </label>
        <label className="cfg-field"><span>Courier strategy</span>
          <select value={s.courierStrategy} onChange={(e) => set("courierStrategy", e.target.value as ShippingSettings["courierStrategy"])}>
            {STRATEGIES.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <label className="cfg-field"><span>Default warehouse</span>
          <select value={s.defaultWarehouseId} onChange={(e) => set("defaultWarehouseId", e.target.value)}>
            {warehouses.length === 0 ? <option value={s.defaultWarehouseId}>{s.defaultWarehouseId}</option> : null}
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}{w.active ? "" : " (inactive)"}</option>)}
          </select>
        </label>
        <label className="cfg-field"><span>Fragile policy</span>
          <select value={s.fragilePolicy} onChange={(e) => set("fragilePolicy", e.target.value as ShippingSettings["fragilePolicy"])}>
            {FRAGILE.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <label className="cfg-field"><span>Insurance threshold (₹)</span>
          <input type="number" value={s.insuranceThreshold} onChange={(e) => set("insuranceThreshold", Number(e.target.value))} />
        </label>
        <label className="cfg-field"><span>COD threshold (₹)</span>
          <input type="number" value={s.codThreshold} onChange={(e) => set("codThreshold", Number(e.target.value))} />
        </label>
        <label className="cfg-field"><span>Volumetric divisor</span>
          <input type="number" value={s.volumetricDivisor} onChange={(e) => set("volumetricDivisor", Number(e.target.value))} />
        </label>
      </div>

      <div className="cfg-checks">
        <label className="om-check"><input type="checkbox" checked={s.autoAssign} onChange={(e) => set("autoAssign", e.target.checked)} /><span>Auto-create shipment on payment (off = warehouse creates it from the board)</span></label>
        <label className="om-check"><input type="checkbox" checked={s.autoCreateAfterFulfillment} onChange={(e) => set("autoCreateAfterFulfillment", e.target.checked)} /><span>Only auto-create after fulfillment completes</span></label>
      </div>

      <div className="cfg-field">
        <span>Working days</span>
        <div className="cfg-days">
          {DAYS.map((d) => (
            <button key={d} type="button" className="cfg-day" data-on={s.workingDays.includes(d) ? "1" : "0"} onClick={() => toggleDay(d)}>{d}</button>
          ))}
        </div>
      </div>

      <label className="cfg-field"><span>Holiday calendar (comma-separated YYYY-MM-DD)</span>
        <input value={s.holidayCalendar.join(", ")} onChange={(e) => set("holidayCalendar", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} placeholder="2026-08-15, 2026-10-02" />
      </label>

      <div className="cfg-actions">
        <button type="button" className="ff-btn ff-btn--primary" disabled={busy || pending} onClick={save}>{busy ? "Saving…" : "Save settings"}</button>
        {msg ? <span className={`cfg-msg cfg-msg--${msg.tone}`}>{msg.text}</span> : null}
      </div>
    </div>
  );
}
