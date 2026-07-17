"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FRAUD_STATES, WHOLESALE_STATES, fraudBadge, wholesaleBadge } from "@/lib/admin/orderList";

/**
 * Single-order operational flags editor (Phase 2). Sets fraud-review / wholesale / incident link for
 * ONE order by reusing the bulk endpoint (targets of one) — the same audited path as bulk, so there
 * is no parallel mutation to drift. Manager/triage-gated at the API.
 */
export function OrderFlags({
  orderNumber, fraudReview, wholesale, incidentNumber,
}: {
  orderNumber: string;
  fraudReview: string;
  wholesale: string;
  incidentNumber: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fraud, setFraud] = useState(fraudReview || "none");
  const [whole, setWhole] = useState(wholesale || "none");
  const [incident, setIncident] = useState(incidentNumber ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const send = async (action: string, extra: Record<string, unknown>, key: string) => {
    setBusy(key); setMsg("");
    try {
      const res = await fetch("/api/admin/orders/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, orderNumbers: [orderNumber], ...extra }) });
      const d = await res.json();
      setBusy(null);
      if (!res.ok) { setMsg(d.error ?? "Failed"); return; }
      setMsg("Saved");
      startTransition(() => router.refresh());
    } catch { setBusy(null); setMsg("Network error"); }
  };

  const fb = fraudBadge(fraudReview);
  const wb = wholesaleBadge(wholesale);

  return (
    <section className="od-card">
      <h2 className="od-card__title">Operational flags</h2>
      <div className="oflags">
        <div className="oflags__row">
          <label className="oflags__label">Fraud review {fb ? <span className="adm-badge" data-b={fb.b}>{fb.label}</span> : null}</label>
          <div className="oflags__ctl">
            <select value={fraud} onChange={(e) => setFraud(e.target.value)}>
              {FRAUD_STATES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <button type="button" className="ff-btn" disabled={busy !== null || fraud === fraudReview} onClick={() => send("markFraud", { fraudState: fraud }, "fraud")}>{busy === "fraud" ? "…" : "Set"}</button>
          </div>
        </div>

        <div className="oflags__row">
          <label className="oflags__label">Wholesale {wb ? <span className="adm-badge" data-b={wb.b}>{wb.label}</span> : null}</label>
          <div className="oflags__ctl">
            <select value={whole} onChange={(e) => setWhole(e.target.value)}>
              {WHOLESALE_STATES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <button type="button" className="ff-btn" disabled={busy !== null || whole === wholesale} onClick={() => send("markWholesale", { wholesaleState: whole }, "whole")}>{busy === "whole" ? "…" : "Set"}</button>
          </div>
        </div>

        <div className="oflags__row">
          <label className="oflags__label">Incident link</label>
          <div className="oflags__ctl">
            <input value={incident} onChange={(e) => setIncident(e.target.value)} placeholder="e.g. INC-2026-001" />
            <button type="button" className="ff-btn" disabled={busy !== null || !incident.trim() || incident === (incidentNumber ?? "")} onClick={() => send("linkIncident", { incidentNumber: incident.trim() }, "inc")}>{busy === "inc" ? "…" : "Link"}</button>
          </div>
        </div>

        {msg ? <p className="obulk-bar__msg">{msg}</p> : null}
        {pending ? <span className="ff-refreshing">refreshing…</span> : null}
      </div>
    </section>
  );
}
