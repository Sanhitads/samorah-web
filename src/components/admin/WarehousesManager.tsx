"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Warehouse } from "@/services/warehouseService";

type Form = {
  id: string; name: string; line1?: string; line2?: string; city?: string; state?: string; pincode?: string; country?: string;
  gstin?: string; manager?: string; phone?: string; workingHours?: string; priority: number; active: boolean; servesStates: string[];
};

export function WarehousesManager({ warehouses, defaultWarehouseId }: { warehouses: Warehouse[]; defaultWarehouseId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState<Form | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [previewState, setPreviewState] = useState("");
  const [preview, setPreview] = useState<{ id: string; name: string; reason: string } | null>(null);

  const post = async (body: Record<string, unknown>): Promise<any> => {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/admin/warehouses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      setBusy(false);
      if (!res.ok || d.ok === false) { setErr(d.error ?? d.reason ?? "Failed"); return null; }
      return d;
    } catch { setBusy(false); setErr("Network error"); return null; }
  };
  const refresh = () => startTransition(() => router.refresh());

  const blank: Form = { id: "", name: "", country: "India", priority: 100, active: true, servesStates: [] };
  const toForm = (w: Warehouse): Form => ({
    id: w.id, name: w.name, line1: w.address.line1, line2: w.address.line2, city: w.address.city, state: w.address.state,
    pincode: w.address.pincode, country: w.address.country, gstin: w.gstin, manager: w.manager, phone: w.phone,
    workingHours: w.workingHours, priority: w.priority, active: w.active, servesStates: w.servesStates ?? [],
  });

  const save = async (f: Form) => {
    const warehouse = { ...f };
    const d = await post(isNew ? { action: "create", warehouse } : { action: "update", id: f.id, warehouse });
    if (d) { setEdit(null); refresh(); }
  };
  const act = async (action: string, id: string) => { if (await post({ action, id })) refresh(); };
  const runPreview = async () => { const d = await post({ action: "preview", state: previewState }); if (d) setPreview(d.route); };

  return (
    <div className="cfg">
      <div className="cfg-actions">
        <button type="button" className="ff-btn ff-btn--primary" onClick={() => { setErr(""); setIsNew(true); setEdit({ ...blank }); }}>New warehouse</button>
        {pending ? <span className="ff-refreshing">updating…</span> : null}
        {err && !edit ? <span className="ff-err">{err}</span> : null}
      </div>

      <table className="admin__table admin__table--board">
        <thead><tr><th>ID / Name</th><th>Location</th><th>Serves</th><th>Priority</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {warehouses.map((w) => (
            <tr key={w.id}>
              <td><span className="admin__mono">{w.id}</span>{w.id === defaultWarehouseId ? <span className="bc-tag" data-derived="0"> default</span> : null}<div>{w.name}</div></td>
              <td className="admin__muted">{[w.address.city, w.address.state, w.address.pincode].filter(Boolean).join(", ") || "—"}</td>
              <td className="admin__muted">{w.servesStates.length ? w.servesStates.join(", ") : "anywhere"}</td>
              <td className="admin__mono">{w.priority}</td>
              <td>{w.active ? <span className="om-pay" data-tone="paid">Active</span> : <span className="om-pay" data-tone="pending">Inactive</span>}</td>
              <td><div className="ff-actions">
                <button type="button" className="ff-btn" onClick={() => { setErr(""); setIsNew(false); setEdit(toForm(w)); }}>Edit</button>
                {w.id !== defaultWarehouseId && w.active ? <button type="button" className="ff-btn" disabled={busy} onClick={() => act("setDefault", w.id)}>Make default</button> : null}
                <button type="button" className="ff-btn ff-btn--danger" disabled={busy} onClick={() => act("delete", w.id)}>Delete</button>
              </div></td>
            </tr>
          ))}
          {warehouses.length === 0 ? <tr><td colSpan={6} className="admin__empty">No warehouses yet.</td></tr> : null}
        </tbody>
      </table>

      {/* Routing preview */}
      <section className="cfg-test">
        <h3 className="cfg-section__title">Routing preview</h3>
        <p className="admin__muted">Which warehouse fulfils an order delivering to a given state.</p>
        <div className="cfg-actions">
          <input value={previewState} onChange={(e) => setPreviewState(e.target.value)} placeholder="Delivery state, e.g. Delhi" style={{ padding: "8px 10px", border: "1px solid var(--ad-hair)", borderRadius: 3 }} />
          <button type="button" className="ff-btn" disabled={busy || !previewState.trim()} onClick={runPreview}>Preview route</button>
          {preview ? <span className="cfg-msg cfg-msg--ok">→ {preview.name} ({preview.id}) · {preview.reason}</span> : null}
        </div>
      </section>

      {edit ? (
        <div className="om-modal" role="dialog" aria-modal="true" onClick={() => !busy && setEdit(null)}>
          <div className="om-modal__card om-modal__card--wide" onClick={(e) => e.stopPropagation()}>
            <h2 className="om-modal__title">{isNew ? "New warehouse" : `Edit ${edit.id}`}</h2>
            <div className="cfg-grid">
              <label className="cfg-field"><span>ID (slug)</span><input value={edit.id} disabled={!isNew} onChange={(e) => setEdit({ ...edit, id: e.target.value })} placeholder="wh_del" /></label>
              <label className="cfg-field"><span>Name</span><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
              <label className="cfg-field"><span>Priority</span><input type="number" value={edit.priority} onChange={(e) => setEdit({ ...edit, priority: Number(e.target.value) })} /></label>
              <label className="cfg-field"><span>Line 1</span><input value={edit.line1 ?? ""} onChange={(e) => setEdit({ ...edit, line1: e.target.value })} /></label>
              <label className="cfg-field"><span>Line 2</span><input value={edit.line2 ?? ""} onChange={(e) => setEdit({ ...edit, line2: e.target.value })} /></label>
              <label className="cfg-field"><span>City</span><input value={edit.city ?? ""} onChange={(e) => setEdit({ ...edit, city: e.target.value })} /></label>
              <label className="cfg-field"><span>State</span><input value={edit.state ?? ""} onChange={(e) => setEdit({ ...edit, state: e.target.value })} /></label>
              <label className="cfg-field"><span>Pincode</span><input value={edit.pincode ?? ""} onChange={(e) => setEdit({ ...edit, pincode: e.target.value })} /></label>
              <label className="cfg-field"><span>GSTIN</span><input value={edit.gstin ?? ""} onChange={(e) => setEdit({ ...edit, gstin: e.target.value })} /></label>
              <label className="cfg-field"><span>Manager</span><input value={edit.manager ?? ""} onChange={(e) => setEdit({ ...edit, manager: e.target.value })} /></label>
              <label className="cfg-field"><span>Phone</span><input value={edit.phone ?? ""} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></label>
              <label className="cfg-field"><span>Working hours</span><input value={edit.workingHours ?? ""} onChange={(e) => setEdit({ ...edit, workingHours: e.target.value })} placeholder="Mon–Sat 10–6" /></label>
            </div>
            <label className="cfg-field"><span>Serves states (comma-separated; blank = anywhere)</span>
              <input value={edit.servesStates.join(", ")} onChange={(e) => setEdit({ ...edit, servesStates: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="Delhi, Haryana, Punjab" />
            </label>
            <label className="om-check"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /><span>Active</span></label>
            {err ? <p className="ff-err">{err}</p> : null}
            <div className="om-modal__actions">
              <button type="button" className="ff-btn" disabled={busy} onClick={() => setEdit(null)}>Cancel</button>
              <button type="button" className="ff-btn ff-btn--primary" disabled={busy || !edit.id.trim() || !edit.name.trim()} onClick={() => save(edit)}>{busy ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
