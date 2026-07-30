"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CategoryRow } from "@/services/categoryAdminService";

const GST = [0, 5, 12, 18, 28];
const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
type Form = { name: string; slug: string; description: string; skuPrefix: string; defaultHsnCode: string; defaultGstRate: number; isActive: boolean };
const emptyForm = (): Form => ({ name: "", slug: "", description: "", skuPrefix: "", defaultHsnCode: "3406", defaultGstRate: 12, isActive: true });
const toForm = (c: CategoryRow): Form => ({ name: c.name, slug: c.slug, description: c.description ?? "", skuPrefix: c.skuPrefix, defaultHsnCode: c.defaultHsnCode, defaultGstRate: c.defaultGstRate, isActive: c.isActive });

/**
 * Category CMS (review point 10). List + create/edit modal + reorder (↑↓) + activate toggle + guarded
 * delete. Posts to /api/admin/categories; each save refreshes the server list. Mirrors the Collections
 * manager's shape so the admin feels consistent. Delete is blocked server-side while products use it.
 */
export function CategoryManager({ categories }: { categories: CategoryRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState<CategoryRow | null>(null); // the row being edited
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm());
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const refresh = () => startTransition(() => router.refresh());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const post = async (body: Record<string, unknown>): Promise<any> => {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/admin/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json(); setBusy(false);
      if (!res.ok || d.ok === false) { setErr(d.error ?? d.reason ?? "Failed"); return null; }
      return d;
    } catch { setBusy(false); setErr("Network error"); return null; }
  };

  const openCreate = () => { setForm(emptyForm()); setEditing(null); setCreating(true); setErr(""); };
  const openEdit = (c: CategoryRow) => { setForm(toForm(c)); setEditing(c); setCreating(false); setErr(""); };
  const close = () => { setCreating(false); setEditing(null); setErr(""); };

  const save = async () => {
    const category = { ...form, slug: form.slug.trim() || slugify(form.name) };
    const d = editing
      ? await post({ action: "update", id: editing.id, category })
      : await post({ action: "create", category });
    if (d?.ok) { close(); refresh(); }
  };
  const toggleStatus = async (c: CategoryRow) => { if (await post({ action: "status", id: c.id, isActive: !c.isActive })) refresh(); };
  const move = async (c: CategoryRow, direction: "up" | "down") => { if (await post({ action: "reorder", id: c.id, direction })) refresh(); };
  const del = async (id: string) => { const d = await post({ action: "delete", id }); if (d?.ok) { setConfirmDel(null); refresh(); } };

  return (
    <div className="cfg">
      <div className="adm-filters" style={{ marginBottom: 12 }}>
        <button type="button" className="ff-btn ff-btn--primary" onClick={openCreate}>New category</button>
        {pending || busy ? <span className="ff-refreshing">working…</span> : null}
        {err && !creating && !editing ? <span className="ff-err">{err}</span> : null}
      </div>

      <div className="admin__table-wrap">
        <table className="admin__table admin__table--board">
          <thead><tr><th>Order</th><th>Category</th><th>SKU prefix</th><th>HSN</th><th>GST</th><th>Products</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {categories.map((c, i) => (
              <tr key={c.id}>
                <td className="ff-actions">
                  <button type="button" className="pe-icon-btn" disabled={busy || i === 0} onClick={() => move(c, "up")} aria-label="Move up" title="Move up">↑</button>
                  <button type="button" className="pe-icon-btn" disabled={busy || i === categories.length - 1} onClick={() => move(c, "down")} aria-label="Move down" title="Move down">↓</button>
                </td>
                <td>{c.name}<div className="admin__muted admin__mono">{c.slug}</div></td>
                <td className="admin__mono">{c.skuPrefix}</td>
                <td className="admin__mono">{c.defaultHsnCode}</td>
                <td className="admin__mono">{c.defaultGstRate}%</td>
                <td className="admin__mono">{c.productCount}</td>
                <td><button type="button" className="cfg-toggle" data-on={c.isActive ? "1" : "0"} disabled={busy} onClick={() => toggleStatus(c)} data-tone={c.isActive ? "paid" : "refunded"}>{c.isActive ? "active" : "inactive"}</button></td>
                <td className="ff-actions">
                  {confirmDel === c.id ? (
                    <>
                      <span className="admin__muted" style={{ marginRight: 4 }}>Delete?</span>
                      <button type="button" className="ff-btn ff-btn--mini ff-btn--danger" disabled={busy} onClick={() => del(c.id)}>Yes</button>
                      <button type="button" className="ff-btn ff-btn--mini" disabled={busy} onClick={() => setConfirmDel(null)}>No</button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="ff-btn" onClick={() => openEdit(c)}>Edit</button>
                      <button type="button" className="ff-btn ff-btn--mini ff-btn--danger" disabled={busy || c.productCount > 0} title={c.productCount > 0 ? "Reassign its products first" : "Delete"} onClick={() => setConfirmDel(c.id)}>🗑</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {categories.length === 0 ? <tr><td colSpan={8} className="admin__empty">No categories yet.</td></tr> : null}
          </tbody>
        </table>
      </div>

      {creating || editing ? (
        <div className="om-modal" role="dialog" aria-modal="true" onClick={() => !busy && close()}>
          <div className="om-modal__card om-modal__card--wide" onClick={(e) => e.stopPropagation()}>
            <h2 className="om-modal__title">{editing ? `Edit ${editing.name}` : "New category"}</h2>
            <p className="om-modal__note">Seeds SKU prefix, HSN and GST defaults for products created in this category.</p>
            <div className="cfg-grid">
              <label className="cfg-field"><span>Name</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, slug: (!editing && (form.slug === "" || form.slug === slugify(form.name))) ? slugify(e.target.value) : form.slug })} /></label>
              <label className="cfg-field"><span>Slug</span><input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="candles" /></label>
              <label className="cfg-field"><span>SKU prefix</span><input value={form.skuPrefix} onChange={(e) => setForm({ ...form, skuPrefix: e.target.value.toUpperCase() })} placeholder="SAM-CAN" /></label>
              <label className="cfg-field"><span>Default HSN</span><input value={form.defaultHsnCode} onChange={(e) => setForm({ ...form, defaultHsnCode: e.target.value })} placeholder="3406" /></label>
              <label className="cfg-field"><span>Default GST %</span><select value={form.defaultGstRate} onChange={(e) => setForm({ ...form, defaultGstRate: Number(e.target.value) })}>{GST.map((g) => <option key={g} value={g}>{g}%</option>)}</select></label>
              <label className="om-check" style={{ alignSelf: "end" }}><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /><span>Active</span></label>
            </div>
            <label className="cfg-field"><span>Description</span><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></label>
            {err ? <p className="ff-err">{err}</p> : null}
            <div className="om-modal__actions">
              <button type="button" className="ff-btn" disabled={busy} onClick={close}>Cancel</button>
              <button type="button" className="ff-btn ff-btn--primary" disabled={busy || !form.name.trim() || !form.skuPrefix.trim() || !form.defaultHsnCode.trim()} onClick={save}>{busy ? "Saving…" : editing ? "Save" : "Create"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
