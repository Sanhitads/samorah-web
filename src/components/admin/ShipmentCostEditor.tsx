"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Controlled editor for a shipment's operational logistics values (review: editable weight/cost with
 * audit). Each editable field has an inline Edit → value + required reason → Save flow; the server
 * recomputes GST + total logistics cost + derived weights and audits every change (old → new +
 * reason). Product-derived weights, GST, and the total are shown read-only. For a courier-integrated
 * shipment the cost fields are locked by default and an edit is labelled an OVERRIDE.
 *
 * Rendered per section ("costs" | "weights") so the detail page can place each in its own collapsible
 * group. Read-only for viewers without fulfillment.operate.
 */
type Row = { key: string; label: string; editable: boolean; override?: boolean; manualOnly?: boolean; hint?: string; strong?: boolean };

const COST_ROWS: Row[] = [
  { key: "shipping_cost", label: "Shipping charge", editable: true, override: true },
  { key: "courier_cost", label: "Courier cost", editable: true, override: true },
  { key: "packaging_cost", label: "Packaging", editable: true, override: true },
  { key: "insurance_cost", label: "Insurance", editable: true, override: true },
  { key: "fuel_surcharge", label: "Fuel surcharge", editable: true, override: true },
  { key: "cod_fee", label: "COD fee", editable: false, hint: "derived" },
  { key: "tax_cost", label: "GST (18%)", editable: false, hint: "system" },
  { key: "total_logistics_cost", label: "Total logistics cost", editable: false, hint: "computed", strong: true },
];
const WEIGHT_ROWS: Row[] = [
  { key: "packaging_weight_kg", label: "Package weight", editable: true },
  { key: "chargeable_weight_kg", label: "Chargeable weight", editable: true, manualOnly: true },
  { key: "net_weight_kg", label: "Net (product) weight", editable: false, hint: "from products" },
  { key: "shipping_weight_kg", label: "Total package weight", editable: false, hint: "net + packaging" },
  { key: "volumetric_weight_kg", label: "Volumetric weight", editable: false, hint: "from dimensions" },
];

const inr = (v: unknown) => (v != null ? `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—");
const kg = (v: unknown) => (v != null ? `${Number(v)} kg` : "—");

export function ShipmentCostEditor({ shipmentId, manual, canEdit, section, values }: {
  shipmentId: string; manual: boolean; canEdit: boolean; section: "costs" | "weights";
  values: Record<string, number | null>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null); // field key, or "dimensions"
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState(false);
  const fmt = section === "costs" ? inr : kg;

  const openEdit = (key: string, seed: Record<string, string>) => { setEditing(key); setDraft(seed); setReason(""); setMsg(""); setErr(false); };
  const cancel = () => { setEditing(null); setDraft({}); setReason(""); };

  const save = async (changes: Record<string, number>) => {
    if (!reason.trim()) { setErr(true); setMsg("Reason required"); return; }
    setBusy(true); setMsg(""); setErr(false);
    try {
      const res = await fetch("/api/admin/shipments/logistics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shipmentId, changes, reason: reason.trim() }) });
      const d = await res.json().catch(() => ({}));
      setBusy(false);
      if (!res.ok) { setErr(true); setMsg(d.error ?? "Failed"); return; }
      setEditing(null); setDraft({}); setReason("");
      startTransition(() => router.refresh());
    } catch { setBusy(false); setErr(true); setMsg("Network error"); }
  };

  const rows = section === "costs" ? COST_ROWS : WEIGHT_ROWS;

  const editForm = (onSave: () => void, isOverride: boolean, inputs: React.ReactNode) => (
    <div className="scost-edit">
      {inputs}
      <input className="scost-edit__reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={isOverride ? "Reason (override — e.g. courier billed extra)" : "Reason (e.g. added gift box + jute bag)"} />
      <button type="button" className="ff-btn ff-btn--primary" disabled={busy} onClick={onSave}>{busy ? "…" : "Save"}</button>
      <button type="button" className="ff-btn" disabled={busy} onClick={cancel}>Cancel</button>
      {msg ? <span className={err ? "ff-error" : "ff-done"}>{msg}</span> : null}
    </div>
  );

  return (
    <dl className="od-dl od-dl--fin scost">
      {rows.map((row) => {
        const rowEditable = canEdit && row.editable && (row.manualOnly ? manual : true);
        const isOverride = !manual && !!row.override;
        const val = values[row.key];
        return (
          <div key={row.key} className={row.strong ? "od-dl__net" : undefined}>
            <dt>{row.label}{row.hint ? <span className="scost__hint"> · {row.hint}</span> : null}{isOverride && rowEditable ? <span className="scost__lock" title="Courier-provided — editing is an audited override">🔒</span> : null}</dt>
            <dd>
              {editing === row.key ? null : <>{fmt(val)}{rowEditable ? <button type="button" className="scost__edit" onClick={() => openEdit(row.key, { [row.key]: String(val ?? 0) })}>{isOverride ? "Override" : "Edit"}</button> : null}</>}
            </dd>
            {editing === row.key ? (
              <div className="scost__editwrap">
                {editForm(() => save({ [row.key]: Number(draft[row.key]) }), isOverride, (
                  <input type="number" step="0.01" min="0" className="scost-edit__val" value={draft[row.key] ?? ""} onChange={(e) => setDraft({ [row.key]: e.target.value })} aria-label={row.label} />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}

      {/* Dimensions (L×W×H) — one logical field, edited together (weights section only). */}
      {section === "weights" ? (
        <div>
          <dt>Dimensions (L×W×H)</dt>
          <dd>
            {editing === "dimensions" ? null : <>
              {values.length_cm ? `${values.length_cm}×${values.width_cm}×${values.height_cm} cm` : "—"}
              {canEdit ? <button type="button" className="scost__edit" onClick={() => openEdit("dimensions", { length_cm: String(values.length_cm ?? 0), width_cm: String(values.width_cm ?? 0), height_cm: String(values.height_cm ?? 0) })}>Edit</button> : null}
            </>}
          </dd>
          {editing === "dimensions" ? (
            <div className="scost__editwrap">
              {editForm(() => save({ length_cm: Number(draft.length_cm), width_cm: Number(draft.width_cm), height_cm: Number(draft.height_cm) }), false, (
                <span className="scost-edit__dims">
                  <input type="number" step="0.1" min="0" value={draft.length_cm ?? ""} onChange={(e) => setDraft((d) => ({ ...d, length_cm: e.target.value }))} aria-label="Length cm" placeholder="L" />
                  <input type="number" step="0.1" min="0" value={draft.width_cm ?? ""} onChange={(e) => setDraft((d) => ({ ...d, width_cm: e.target.value }))} aria-label="Width cm" placeholder="W" />
                  <input type="number" step="0.1" min="0" value={draft.height_cm ?? ""} onChange={(e) => setDraft((d) => ({ ...d, height_cm: e.target.value }))} aria-label="Height cm" placeholder="H" />
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {pending ? <div className="scost__refresh"><span className="ff-refreshing">refreshing…</span></div> : null}
    </dl>
  );
}
