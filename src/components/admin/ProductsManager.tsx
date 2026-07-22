"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProductRow, ProductStatus } from "@/services/productAdminService";
import { ProductEditor } from "@/components/admin/ProductEditor";

const STATUSES: ProductStatus[] = ["draft", "active", "out_of_stock", "archived"];
const GST = [0, 5, 12, 18, 28];
const STATUS_TONE: Record<string, string> = { active: "paid", draft: "pending", out_of_stock: "refundprog", archived: "refunded" };
const money = (v: number) => `₹${v.toLocaleString("en-IN")}`;
const shortDate = (v: string | null) => (v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—");

const SORTS = [
  { v: "updated", l: "Recently updated" }, { v: "az", l: "A–Z" }, { v: "za", l: "Z–A" },
  { v: "sales", l: "Best selling" }, { v: "priceHigh", l: "Price high→low" }, { v: "priceLow", l: "Price low→high" }, { v: "stock", l: "Stock low→high" },
];

export function ProductsManager({ products, categories, collections }: {
  products: ProductRow[]; categories: { id: string; name: string }[]; collections: { id: string; name: string; volume: string | null; slug?: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [fStatus, setFStatus] = useState(""); const [fCollection, setFCollection] = useState(""); const [fFamily, setFFamily] = useState(""); const [fFlag, setFFlag] = useState("");
  const [sort, setSort] = useState("updated");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const post = async (body: Record<string, unknown>): Promise<any> => {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/admin/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json(); setBusy(false);
      if (!res.ok || d.ok === false) { setErr(d.error ?? d.reason ?? "Failed"); return null; }
      return d;
    } catch { setBusy(false); setErr("Network error"); return null; }
  };
  const refresh = () => startTransition(() => router.refresh());

  const counts = useMemo(() => ({
    total: products.length,
    active: products.filter((p) => p.status === "active").length,
    draft: products.filter((p) => p.status === "draft").length,
    outOfStock: products.filter((p) => p.status === "out_of_stock" || p.totalStock === 0).length,
    featured: products.filter((p) => p.isFeatured).length,
    bestseller: products.filter((p) => p.isBestseller).length,
    newArrival: products.filter((p) => p.isNewArrival).length,
    lowStock: products.filter((p) => p.lowStock).length,
  }), [products]);

  const families = useMemo(() => [...new Set(products.map((p) => p.fragranceFamily).filter(Boolean))] as string[], [products]);

  const rows = useMemo(() => {
    let r = [...products];
    if (search) { const q = search.toLowerCase(); r = r.filter((p) => [p.name, p.baseSku, p.slug, p.collectionName, p.fragranceFamily, p.scentGroup].some((v) => (v ?? "").toLowerCase().includes(q))); }
    if (fStatus) r = r.filter((p) => p.status === fStatus);
    if (fCollection) r = r.filter((p) => p.collectionName === fCollection);
    if (fFamily) r = r.filter((p) => p.fragranceFamily === fFamily);
    if (fFlag === "featured") r = r.filter((p) => p.isFeatured);
    else if (fFlag === "bestseller") r = r.filter((p) => p.isBestseller);
    else if (fFlag === "new") r = r.filter((p) => p.isNewArrival);
    else if (fFlag === "low") r = r.filter((p) => p.lowStock);
    const s = sort;
    r.sort((a, b) => s === "az" ? a.name.localeCompare(b.name) : s === "za" ? b.name.localeCompare(a.name)
      : s === "sales" ? b.salesCount - a.salesCount : s === "priceHigh" ? b.price - a.price : s === "priceLow" ? a.price - b.price
      : s === "stock" ? a.totalStock - b.totalStock : (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    return r;
  }, [products, search, fStatus, fCollection, fFamily, fFlag, sort]);

  const anyFilter = search || fStatus || fCollection || fFamily || fFlag;
  const collectionNames = useMemo(() => [...new Set(products.map((p) => p.collectionName).filter(Boolean))] as string[], [products]);

  return (
    <div className="cfg">
      <div className="oms-strip">
        <div className="oms-stat"><span className="oms-stat__n">{counts.total}</span><span className="oms-stat__l">Total</span></div>
        <div className="oms-stat"><span className="oms-stat__n">{counts.active}</span><span className="oms-stat__l">Active</span></div>
        <div className="oms-stat"><span className="oms-stat__n">{counts.draft}</span><span className="oms-stat__l">Draft</span></div>
        <div className="oms-stat" data-tone={counts.outOfStock ? "over" : undefined}><span className="oms-stat__n">{counts.outOfStock}</span><span className="oms-stat__l">Out of stock</span></div>
        <div className="oms-stat"><span className="oms-stat__n">{counts.featured}</span><span className="oms-stat__l">Featured</span></div>
        <div className="oms-stat"><span className="oms-stat__n">{counts.bestseller}</span><span className="oms-stat__l">Best sellers</span></div>
        <div className="oms-stat"><span className="oms-stat__n">{counts.newArrival}</span><span className="oms-stat__l">New</span></div>
        <div className="oms-stat" data-tone={counts.lowStock ? "warn" : undefined}><span className="oms-stat__n">{counts.lowStock}</span><span className="oms-stat__l">Low stock</span></div>
      </div>

      <form className="adm-filters" onSubmit={(e) => e.preventDefault()}>
        <input className="adm-filters__search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, SKU, slug, collection, fragrance…" />
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="Status"><option value="">Any status</option>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <select value={fCollection} onChange={(e) => setFCollection(e.target.value)} aria-label="Collection"><option value="">Any collection</option>{collectionNames.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <select value={fFamily} onChange={(e) => setFFamily(e.target.value)} aria-label="Fragrance family"><option value="">Any fragrance</option>{families.map((f) => <option key={f} value={f}>{f}</option>)}</select>
        <select value={fFlag} onChange={(e) => setFFlag(e.target.value)} aria-label="Flag"><option value="">Any flag</option><option value="featured">Featured</option><option value="bestseller">Best seller</option><option value="new">New arrival</option><option value="low">Low stock</option></select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">{SORTS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}</select>
        {anyFilter ? <button type="button" className="ff-btn" onClick={() => { setSearch(""); setFStatus(""); setFCollection(""); setFFamily(""); setFFlag(""); }}>Clear</button> : null}
        <button type="button" className="ff-btn ff-btn--primary" onClick={() => { setErr(""); setCreating(true); }}>New product</button>
        {pending ? <span className="ff-refreshing">updating…</span> : null}
        {err && !creating && !editId ? <span className="ff-err">{err}</span> : null}
      </form>

      <div className="admin__table-wrap">
        <table className="admin__table admin__table--board">
          <thead><tr><th></th><th>Product</th><th>Collection</th><th>Price</th><th>Stock</th><th>Sales</th><th>Flags</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.imageUrl ? (/* eslint-disable-next-line @next/next/no-img-element */ <img className="pl-thumb" src={p.imageUrl} alt="" />) : <span className="pl-thumb pl-thumb--empty" />}</td>
                <td>{p.name}<div className="admin__muted admin__mono">{p.baseSku}{p.fragranceFamily ? ` · ${p.fragranceFamily}` : ""}</div></td>
                <td className="admin__muted">{p.collectionName ?? "—"}</td>
                <td className="admin__mono">{money(p.price)}{p.salePrice != null ? <span className="admin__muted"> ({money(p.salePrice)})</span> : null}</td>
                <td className="admin__mono"><span className="stock-dot" data-s={p.totalStock === 0 ? "out" : p.lowStock ? "low" : "ok"}>{p.totalStock === 0 ? "🔴" : p.lowStock ? "🟡" : "🟢"}</span> {p.totalStock}<div className="admin__muted">{p.variantCount} var</div></td>
                <td className="admin__mono">{p.salesCount ? <>{p.salesCount} sold<div className="admin__muted">{money(p.salesRevenue)}</div></> : <span className="admin__muted">—</span>}</td>
                <td><div className="pl-flags">
                  <button type="button" className="cfg-toggle" data-on={p.isFeatured ? "1" : "0"} disabled={busy} onClick={async () => { if (await post({ action: "featured", id: p.id, isFeatured: !p.isFeatured })) refresh(); }} title="Featured">★</button>
                  {p.isHero ? <span className="pl-flag" title="Hero">H</span> : null}
                  {p.isBestseller ? <span className="pl-flag" title="Best seller">BS</span> : null}
                  {p.isNewArrival ? <span className="pl-flag" title="New">NEW</span> : null}
                </div></td>
                <td>
                  <select className="cfg-toggle" value={p.status} disabled={busy} onChange={async (e) => { if (await post({ action: "status", id: p.id, status: e.target.value })) refresh(); }} data-tone={STATUS_TONE[p.status]}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="admin__muted">{shortDate(p.updatedAt)}</td>
                <td className="ff-actions">
                  <button type="button" className="ff-btn" onClick={() => setEditId(p.id)}>Edit</button>
                  <button type="button" className="ff-btn ff-btn--mini" disabled={busy} title="Duplicate" onClick={async () => { const d = await post({ action: "duplicate", id: p.id }); if (d?.ok) { refresh(); setEditId(d.id); } }}>⧉</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={10} className="admin__empty">No products{anyFilter ? " match these filters" : " yet"}.</td></tr> : null}
          </tbody>
        </table>
      </div>

      {creating ? <CreateModal categories={categories} busy={busy} err={err} onClose={() => setCreating(false)} onCreate={async (c) => { const d = await post({ action: "create", product: c }); if (d?.ok) { setCreating(false); refresh(); } }} /> : null}
      {editId ? <ProductEditor productId={editId} collections={collections} categories={categories} onClose={() => setEditId(null)} onSaved={refresh} /> : null}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
