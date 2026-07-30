"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProductRow, ProductStatus } from "@/services/productAdminService";
import { ProductEditor } from "@/components/admin/ProductEditor";

const PAGE_SIZE = 12;
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
  const [page, setPage] = useState(0);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  // Pagination — reset to page 1 whenever the filtered set changes.
  useEffect(() => { setPage(0); }, [search, fStatus, fCollection, fFamily, fFlag, sort]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  // ── Bulk selection (Batch B · point 12) ──────────────────────────────────────────────────────────
  const toggleOne = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pageIds = pageRows.map((p) => p.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const togglePage = () => setSelected((s) => { const n = new Set(s); if (allPageSelected) pageIds.forEach((id) => n.delete(id)); else pageIds.forEach((id) => n.add(id)); return n; });
  const selectAllFiltered = () => setSelected(new Set(rows.map((r) => r.id)));
  const clearSel = () => setSelected(new Set());
  const bulk = async (bulkAction: string, value: unknown) => {
    const ids = [...selected]; if (!ids.length) return;
    const d = await post({ action: "bulk", ids, bulkAction, value });
    if (d?.ok) { clearSel(); refresh(); }
  };
  const exportCsv = () => {
    const chosen = selected.size ? rows.filter((r) => selected.has(r.id)) : rows;
    const cols: (keyof ProductRow)[] = ["name", "baseSku", "slug", "collectionName", "fragranceFamily", "price", "salePrice", "totalStock", "salesCount", "salesRevenue", "status"];
    const esc = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [cols.join(","), ...chosen.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `products-${chosen.length}.csv`; a.click(); URL.revokeObjectURL(url);
  };

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

      {selected.size > 0 ? (
        <div className="pl-bulk" role="region" aria-label="Bulk actions">
          <span className="pl-bulk__count">{selected.size} selected</span>
          {selected.size < rows.length ? <button type="button" className="ff-btn ff-btn--mini" onClick={selectAllFiltered}>Select all {rows.length}</button> : null}
          <span className="pl-bulk__sep" />
          <select className="cfg-toggle" defaultValue="" disabled={busy} onChange={(e) => { if (e.target.value) { bulk("status", e.target.value); e.target.value = ""; } }} aria-label="Set status">
            <option value="">Set status…</option>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="cfg-toggle" defaultValue="" disabled={busy} onChange={(e) => { const v = e.target.value; if (v) { bulk("collection", v === "__none__" ? "" : v); e.target.value = ""; } }} aria-label="Assign chapter">
            <option value="">Assign chapter…</option><option value="__none__">— remove from chapter —</option>
            {collections.map((c) => <option key={c.id} value={c.id}>{c.volume ? `${c.volume} — ${c.name}` : c.name}</option>)}
          </select>
          <button type="button" className="ff-btn ff-btn--mini" disabled={busy} onClick={() => bulk("featured", true)}>★ Feature</button>
          <button type="button" className="ff-btn ff-btn--mini" disabled={busy} onClick={() => bulk("featured", false)}>☆ Unfeature</button>
          <button type="button" className="ff-btn ff-btn--mini" disabled={busy} onClick={() => bulk("bestseller", true)}>Best seller</button>
          <button type="button" className="ff-btn ff-btn--mini" disabled={busy} onClick={() => bulk("newArrival", true)}>New</button>
          <span className="pl-bulk__sep" />
          <button type="button" className="ff-btn ff-btn--mini" disabled={busy} onClick={exportCsv}>⤓ Export CSV</button>
          <button type="button" className="ff-btn ff-btn--mini" onClick={clearSel}>Clear</button>
        </div>
      ) : null}

      <div className="admin__table-wrap">
        <table className="admin__table admin__table--board">
          <thead><tr><th><input type="checkbox" checked={allPageSelected} onChange={togglePage} aria-label="Select all on page" /></th><th></th><th>Product</th><th>Collection</th><th>Price</th><th>Stock</th><th>Sales</th><th>Flags</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead>
          <tbody>
            {pageRows.map((p) => (
              <tr key={p.id} data-selected={selected.has(p.id) ? "1" : undefined}>
                <td><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} aria-label={`Select ${p.name}`} /></td>
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
                  {confirmDel === p.id ? (
                    <>
                      <span className="admin__muted" style={{ marginRight: 4 }}>Delete?</span>
                      <button type="button" className="ff-btn ff-btn--mini ff-btn--danger" disabled={busy} onClick={async () => { if (await post({ action: "delete", id: p.id })) { setConfirmDel(null); refresh(); } }}>Yes, delete</button>
                      <button type="button" className="ff-btn ff-btn--mini" disabled={busy} onClick={() => setConfirmDel(null)}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="ff-btn" onClick={() => setEditId(p.id)}>Edit</button>
                      <button type="button" className="ff-btn ff-btn--mini" disabled={busy} title="Duplicate" onClick={async () => { const d = await post({ action: "duplicate", id: p.id }); if (d?.ok) { refresh(); setEditId(d.id); } }}>⧉</button>
                      <button type="button" className="ff-btn ff-btn--mini ff-btn--danger" disabled={busy} title="Delete" onClick={() => setConfirmDel(p.id)}>🗑</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={11} className="admin__empty">No products{anyFilter ? " match these filters" : " yet"}.</td></tr> : null}
          </tbody>
        </table>
      </div>

      <div className="adm-pager">
        <span className="adm-pager__info">
          {rows.length === 0 ? "No products" : `Showing ${safePage * PAGE_SIZE + 1}–${Math.min(rows.length, (safePage + 1) * PAGE_SIZE)} of ${rows.length}`}
        </span>
        {totalPages > 1 ? (
          <div className="adm-pager__nav">
            <button type="button" className="ff-btn ff-btn--mini" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>← Prev</button>
            <span className="adm-pager__pages">Page {safePage + 1} of {totalPages}</span>
            <button type="button" className="ff-btn ff-btn--mini" disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)}>Next →</button>
          </div>
        ) : null}
      </div>

      {creating ? <CreateModal categories={categories} busy={busy} err={err} onClose={() => setCreating(false)} onCreate={async (c) => { const d = await post({ action: "create", product: c }); if (d?.ok) { setCreating(false); refresh(); } }} /> : null}
      {editId ? <ProductEditor productId={editId} collections={collections} categories={categories} allProducts={products.map((p) => ({ id: p.id, name: p.name, slug: p.slug, imageUrl: p.imageUrl }))} onClose={() => setEditId(null)} onSaved={refresh} /> : null}
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
