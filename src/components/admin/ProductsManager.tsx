"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProductRow, VariantRow, VesselType, ProductStatus } from "@/services/productAdminService";

const STATUSES: ProductStatus[] = ["draft", "active", "out_of_stock", "archived"];
const VESSELS: VesselType[] = ["glass", "ceramic", "terracotta"];
const GST = [0, 5, 12, 18, 28];
const STATUS_TONE: Record<string, string> = { active: "paid", draft: "pending", out_of_stock: "refundprog", archived: "refunded" };

type Core = {
  name: string; slug: string; tagline: string; scentGroup: string; fragranceFamily: string; story: string; burnTime: string;
  price: number; salePrice: string; hsnCode: string; gstRate: number; weightGrams: string; status: ProductStatus; isFeatured: boolean;
};

export function ProductsManager({ products, categories }: { products: ProductRow[]; categories: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [core, setCore] = useState<Core | null>(null);
  const [variants, setVariants] = useState<VariantRow[]>([]);

  const post = async (body: Record<string, unknown>): Promise<any> => {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/admin/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      setBusy(false);
      if (!res.ok || d.ok === false) { setErr(d.error ?? d.reason ?? "Failed"); return null; }
      return d;
    } catch { setBusy(false); setErr("Network error"); return null; }
  };
  const refresh = () => startTransition(() => router.refresh());
  const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

  const openEdit = async (id: string) => {
    setErr(""); setEditId(id); setCore(null); setVariants([]);
    const d = await post({ action: "get", id });
    if (d?.product) {
      const p = d.product;
      setCore({ name: p.name ?? "", slug: p.slug ?? "", tagline: p.tagline ?? "", scentGroup: p.scent_group ?? "", fragranceFamily: p.fragrance_family ?? "", story: p.story ?? "", burnTime: p.burn_time ?? "", price: Number(p.price), salePrice: p.sale_price != null ? String(p.sale_price) : "", hsnCode: p.hsn_code ?? "", gstRate: Number(p.gst_rate), weightGrams: p.weight_grams != null ? String(p.weight_grams) : "", status: p.status, isFeatured: Boolean(p.is_featured) });
      setVariants(d.variants ?? []);
    }
  };
  const saveCore = async () => {
    if (!core || !editId) return;
    const product = { ...core, salePrice: numOrNull(core.salePrice), weightGrams: numOrNull(core.weightGrams) };
    if (await post({ action: "update", id: editId, product })) { setEditId(null); refresh(); }
  };
  const saveVariant = async (v: VariantRow) => {
    if (!editId) return;
    const d = await post({ action: "variant.upsert", variant: { id: v.id || undefined, productId: editId, sku: v.sku, variantName: v.variantName, vesselType: v.vesselType, sizeLabel: v.sizeLabel, price: v.price, salePrice: v.salePrice, stock: v.stock, isActive: v.isActive, sortOrder: v.sortOrder } });
    if (d) { await openEdit(editId); refresh(); }
  };
  const delVariant = async (v: VariantRow) => { if (v.id && editId && await post({ action: "variant.delete", id: v.id, productId: editId })) { await openEdit(editId); refresh(); } };
  const addVariant = () => setVariants((vs) => [...vs, { id: "", sku: "", variantName: "", vesselType: null, sizeLabel: "", price: core?.price ?? 0, salePrice: null, stock: 0, isActive: true, sortOrder: vs.length }]);
  const setV = (i: number, patch: Partial<VariantRow>) => setVariants((vs) => vs.map((v, j) => (j === i ? { ...v, ...patch } : v)));

  return (
    <div className="cfg">
      <div className="cfg-actions">
        <button type="button" className="ff-btn ff-btn--primary" onClick={() => { setErr(""); setCreating(true); }}>New product</button>
        {pending ? <span className="ff-refreshing">updating…</span> : null}
        {err && !creating && !editId ? <span className="ff-err">{err}</span> : null}
      </div>

      <table className="admin__table admin__table--board">
        <thead><tr><th>Product</th><th>SKU</th><th>Price</th><th>Variants / Stock</th><th>Featured</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id}>
              <td>{p.name}<div className="admin__muted">{p.fragranceFamily ?? "—"}</div></td>
              <td className="admin__mono">{p.baseSku}</td>
              <td className="admin__mono">₹{p.price}{p.salePrice != null ? <span className="admin__muted"> (₹{p.salePrice})</span> : null}</td>
              <td className="admin__mono">{p.variantCount} · {p.totalStock} in stock</td>
              <td><button type="button" className="cfg-toggle" data-on={p.isFeatured ? "1" : "0"} disabled={busy} onClick={async () => { if (await post({ action: "featured", id: p.id, isFeatured: !p.isFeatured })) refresh(); }}>{p.isFeatured ? "★" : "☆"}</button></td>
              <td>
                <select className="cfg-toggle" value={p.status} disabled={busy} onChange={async (e) => { if (await post({ action: "status", id: p.id, status: e.target.value })) refresh(); }} data-tone={STATUS_TONE[p.status]}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </td>
              <td><button type="button" className="ff-btn" onClick={() => openEdit(p.id)}>Edit</button></td>
            </tr>
          ))}
          {products.length === 0 ? <tr><td colSpan={7} className="admin__empty">No products yet.</td></tr> : null}
        </tbody>
      </table>

      {/* Create */}
      {creating ? <CreateModal categories={categories} busy={busy} err={err} onClose={() => setCreating(false)} onCreate={async (c) => { const d = await post({ action: "create", product: c }); if (d?.ok) { setCreating(false); refresh(); } }} /> : null}

      {/* Edit */}
      {editId && core ? (
        <div className="om-modal" role="dialog" aria-modal="true" onClick={() => !busy && setEditId(null)}>
          <div className="om-modal__card om-modal__card--wide" onClick={(e) => e.stopPropagation()}>
            <h2 className="om-modal__title">Edit {core.name}</h2>
            <div className="cfg-grid">
              <label className="cfg-field"><span>Name</span><input value={core.name} onChange={(e) => setCore({ ...core, name: e.target.value })} /></label>
              <label className="cfg-field"><span>Slug</span><input value={core.slug} onChange={(e) => setCore({ ...core, slug: e.target.value })} /></label>
              <label className="cfg-field"><span>Fragrance family</span><input value={core.fragranceFamily} onChange={(e) => setCore({ ...core, fragranceFamily: e.target.value })} /></label>
              <label className="cfg-field"><span>Scent group</span><input value={core.scentGroup} onChange={(e) => setCore({ ...core, scentGroup: e.target.value })} /></label>
              <label className="cfg-field"><span>Price (₹)</span><input type="number" value={core.price} onChange={(e) => setCore({ ...core, price: Number(e.target.value) })} /></label>
              <label className="cfg-field"><span>Sale price (₹)</span><input type="number" value={core.salePrice} onChange={(e) => setCore({ ...core, salePrice: e.target.value })} placeholder="none" /></label>
              <label className="cfg-field"><span>HSN</span><input value={core.hsnCode} onChange={(e) => setCore({ ...core, hsnCode: e.target.value })} /></label>
              <label className="cfg-field"><span>GST %</span><select value={core.gstRate} onChange={(e) => setCore({ ...core, gstRate: Number(e.target.value) })}>{GST.map((g) => <option key={g} value={g}>{g}%</option>)}</select></label>
              <label className="cfg-field"><span>Burn time</span><input value={core.burnTime} onChange={(e) => setCore({ ...core, burnTime: e.target.value })} /></label>
              <label className="cfg-field"><span>Weight (g)</span><input type="number" value={core.weightGrams} onChange={(e) => setCore({ ...core, weightGrams: e.target.value })} /></label>
              <label className="cfg-field"><span>Status</span><select value={core.status} onChange={(e) => setCore({ ...core, status: e.target.value as ProductStatus })}>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
            </div>
            <label className="cfg-field"><span>Tagline</span><input value={core.tagline} onChange={(e) => setCore({ ...core, tagline: e.target.value })} /></label>
            <label className="cfg-field"><span>Story</span><textarea value={core.story} onChange={(e) => setCore({ ...core, story: e.target.value })} rows={2} /></label>
            <label className="om-check"><input type="checkbox" checked={core.isFeatured} onChange={(e) => setCore({ ...core, isFeatured: e.target.checked })} /><span>Homepage featured</span></label>

            <p className="cfg-sub">Variants</p>
            {variants.map((v, i) => (
              <div key={v.id || `new${i}`} className="cfg-row" style={{ gridTemplateColumns: "1.3fr 0.9fr 0.7fr 0.7fr 0.7fr auto auto" }}>
                <input value={v.sku} onChange={(e) => setV(i, { sku: e.target.value })} placeholder="SKU" />
                <select value={v.vesselType ?? ""} onChange={(e) => setV(i, { vesselType: (e.target.value || null) as VesselType | null })}><option value="">vessel</option>{VESSELS.map((x) => <option key={x} value={x}>{x}</option>)}</select>
                <input value={v.sizeLabel ?? ""} onChange={(e) => setV(i, { sizeLabel: e.target.value })} placeholder="size" />
                <input type="number" value={v.price} onChange={(e) => setV(i, { price: Number(e.target.value) })} placeholder="₹" />
                <input type="number" value={v.stock} onChange={(e) => setV(i, { stock: Number(e.target.value) })} placeholder="stock" />
                <button type="button" className="cfg-toggle" data-on={v.isActive ? "1" : "0"} onClick={() => setV(i, { isActive: !v.isActive })}>{v.isActive ? "On" : "Off"}</button>
                <span className="ff-actions"><button type="button" className="ff-btn" disabled={busy} onClick={() => saveVariant(v)}>Save</button>{v.id ? <button type="button" className="ff-btn ff-btn--danger" disabled={busy} onClick={() => delVariant(v)}>×</button> : null}</span>
              </div>
            ))}
            <button type="button" className="ff-btn" onClick={addVariant}>+ variant</button>

            {err ? <p className="ff-err">{err}</p> : null}
            <div className="om-modal__actions"><button type="button" className="ff-btn" disabled={busy} onClick={() => setEditId(null)}>Close</button><button type="button" className="ff-btn ff-btn--primary" disabled={busy} onClick={saveCore}>{busy ? "Saving…" : "Save product"}</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CreateModal({ categories, busy, err, onClose, onCreate }: { categories: { id: string; name: string }[]; busy: boolean; err: string; onClose: () => void; onCreate: (c: any) => void }) {
  const [f, setF] = useState({ name: "", slug: "", baseSku: "", categoryId: categories[0]?.id ?? "", price: 0, hsnCode: "33074100", gstRate: 12, fragranceFamily: "", tagline: "" });
  return (
    <div className="om-modal" role="dialog" aria-modal="true" onClick={() => !busy && onClose()}>
      <div className="om-modal__card om-modal__card--wide" onClick={(e) => e.stopPropagation()}>
        <h2 className="om-modal__title">New product</h2>
        <p className="om-modal__note">Creates a draft. Add variants + editorial detail after saving.</p>
        <div className="cfg-grid">
          <label className="cfg-field"><span>Name</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="cfg-field"><span>Slug</span><input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} placeholder="kashmiri-chai" /></label>
          <label className="cfg-field"><span>Base SKU</span><input value={f.baseSku} onChange={(e) => setF({ ...f, baseSku: e.target.value.toUpperCase() })} placeholder="SAM-CAN-010" /></label>
          <label className="cfg-field"><span>Category</span><select value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="cfg-field"><span>Price (₹)</span><input type="number" value={f.price} onChange={(e) => setF({ ...f, price: Number(e.target.value) })} /></label>
          <label className="cfg-field"><span>HSN</span><input value={f.hsnCode} onChange={(e) => setF({ ...f, hsnCode: e.target.value })} /></label>
          <label className="cfg-field"><span>GST %</span><select value={f.gstRate} onChange={(e) => setF({ ...f, gstRate: Number(e.target.value) })}>{GST.map((g) => <option key={g} value={g}>{g}%</option>)}</select></label>
          <label className="cfg-field"><span>Fragrance family</span><input value={f.fragranceFamily} onChange={(e) => setF({ ...f, fragranceFamily: e.target.value })} /></label>
        </div>
        <label className="cfg-field"><span>Tagline</span><input value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} /></label>
        {err ? <p className="ff-err">{err}</p> : null}
        <div className="om-modal__actions"><button type="button" className="ff-btn" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="ff-btn ff-btn--primary" disabled={busy || !f.name.trim() || !f.slug.trim() || !f.baseSku.trim() || !f.categoryId} onClick={() => onCreate(f)}>{busy ? "Creating…" : "Create draft"}</button></div>
      </div>
    </div>
  );
}
