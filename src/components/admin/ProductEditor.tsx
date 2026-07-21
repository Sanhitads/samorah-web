"use client";

import { useEffect, useState } from "react";
import type { VariantRow, NoteRow, ImageRow, VesselType, ProductStatus } from "@/services/productAdminService";

/**
 * Full editorial product editor (review: Products CMS). Collapsible sections so the long form doesn't
 * overwhelm — Basic & SEO, Collection & chapter, Merchandising, Visibility, Editorial content,
 * Fragrance Journey, Ingredients, Images, Variants. Everything maps to existing product columns +
 * the fragrance_notes / product_images tables; each save is audited server-side. Self-contained:
 * loads the product on mount, posts to /api/admin/products, and calls onSaved to refresh the list.
 */
const STATUSES: ProductStatus[] = ["draft", "active", "out_of_stock", "archived"];
const VESSELS: VesselType[] = ["glass", "ceramic", "terracotta"];
const GST = [0, 5, 12, 18, 28];
const PRODUCT_TYPES = [
  { v: "candle", l: "Candle" }, { v: "room_spray", l: "Room Freshener" }, { v: "linen_spray", l: "Linen Freshener" },
  { v: "wax_tablet", l: "Wax Tablet" }, { v: "reed_diffuser", l: "Reed Diffuser" }, { v: "other", l: "Other" },
];
const LAYERS = [{ k: "top", l: "Top notes" }, { k: "heart", l: "Heart notes" }, { k: "base", l: "Base notes" }];
const FLAGS: { k: keyof Core; l: string }[] = [
  { k: "isFeatured", l: "Featured" }, { k: "isHero", l: "Hero" }, { k: "isBestseller", l: "Best Seller" }, { k: "isNewArrival", l: "New Arrival" },
  { k: "isLimitedEdition", l: "Limited Edition" }, { k: "isSeasonal", l: "Seasonal" }, { k: "isStaffPick", l: "Staff Pick" }, { k: "isComingSoon", l: "Coming Soon" },
];
const VIS: { k: keyof Core; l: string }[] = [
  { k: "visibleWebsite", l: "Website" }, { k: "visibleSearch", l: "Search" }, { k: "visibleHomepage", l: "Homepage" }, { k: "visibleChapter", l: "Chapter listing" }, { k: "visibleBundles", l: "Bundles" },
];

type Core = {
  productType: string; categoryId: string;
  name: string; slug: string; tagline: string; scentGroup: string; fragranceFamily: string; story: string; storyLong: string; burnTime: string;
  flamePersona: string; moodTags: string; lifestyleUse: string; culturalReference: string; waxBlend: string; wick: string;
  seoTitle: string; seoDescription: string; seoOgImage: string; seoCanonical: string;
  price: number; salePrice: string; hsnCode: string; gstRate: number; weightGrams: string;
  status: ProductStatus; collectionId: string; chapterPosition: string; displayOrder: string; publishAt: string;
  isFeatured: boolean; isHero: boolean; isBestseller: boolean; isNewArrival: boolean; isLimitedEdition: boolean; isSeasonal: boolean; isStaffPick: boolean; isComingSoon: boolean;
  visibleWebsite: boolean; visibleSearch: boolean; visibleHomepage: boolean; visibleChapter: boolean; visibleBundles: boolean; allowBackorder: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const bv = (v: any) => Boolean(v);
const sv = (v: unknown) => (v == null ? "" : String(v));

export function ProductEditor({ productId, collections, categories, onClose, onSaved }: {
  productId: string; collections: { id: string; name: string; volume: string | null }[]; categories: { id: string; name: string }[]; onClose: () => void; onSaved: () => void;
}) {
  const [core, setCore] = useState<Core | null>(null);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [images, setImages] = useState<ImageRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [imgUrl, setImgUrl] = useState(""); const [imgAlt, setImgAlt] = useState("");

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

  const load = async () => {
    const d = await post({ action: "get", id: productId });
    if (!d?.product) return;
    const p = d.product;
    setCore({
      productType: sv(p.product_type) || "candle", categoryId: sv(p.category_id),
      name: sv(p.name), slug: sv(p.slug), tagline: sv(p.tagline), scentGroup: sv(p.scent_group), fragranceFamily: sv(p.fragrance_family),
      story: sv(p.story), storyLong: sv(p.story_long), burnTime: sv(p.burn_time), flamePersona: sv(p.flame_persona),
      moodTags: Array.isArray(p.mood_tags) ? p.mood_tags.join(", ") : "", lifestyleUse: sv(p.lifestyle_use), culturalReference: sv(p.cultural_reference),
      waxBlend: sv(p.wax_blend), wick: sv(p.wick), seoTitle: sv(p.seo_title), seoDescription: sv(p.seo_description), seoOgImage: sv(p.seo_og_image), seoCanonical: sv(p.seo_canonical),
      price: Number(p.price), salePrice: p.sale_price != null ? String(p.sale_price) : "", hsnCode: sv(p.hsn_code), gstRate: Number(p.gst_rate),
      weightGrams: p.weight_grams != null ? String(p.weight_grams) : "", status: p.status, collectionId: sv(p.collection_id),
      chapterPosition: sv(p.chapter_position), displayOrder: p.display_order != null ? String(p.display_order) : "0", publishAt: p.publish_at ? String(p.publish_at).slice(0, 16) : "",
      isFeatured: bv(p.is_featured), isHero: bv(p.is_hero), isBestseller: bv(p.is_bestseller), isNewArrival: bv(p.is_new_arrival),
      isLimitedEdition: bv(p.is_limited_edition), isSeasonal: bv(p.is_seasonal), isStaffPick: bv(p.is_staff_pick), isComingSoon: bv(p.is_coming_soon),
      visibleWebsite: p.visible_website == null ? true : bv(p.visible_website), visibleSearch: p.visible_search == null ? true : bv(p.visible_search),
      visibleHomepage: p.visible_homepage == null ? true : bv(p.visible_homepage), visibleChapter: p.visible_chapter == null ? true : bv(p.visible_chapter),
      visibleBundles: p.visible_bundles == null ? true : bv(p.visible_bundles), allowBackorder: bv(p.allow_backorder),
    });
    setVariants(d.variants ?? []); setNotes(d.notes ?? []); setImages(d.images ?? []);
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const set = (patch: Partial<Core>) => setCore((c) => (c ? { ...c, ...patch } : c));
  const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

  const saveCore = async () => {
    if (!core) return;
    const product = {
      ...core, salePrice: numOrNull(core.salePrice), weightGrams: numOrNull(core.weightGrams),
      moodTags: core.moodTags.split(",").map((t) => t.trim()).filter(Boolean),
      collectionId: core.collectionId || null, displayOrder: Number(core.displayOrder || 0), publishAt: core.publishAt || null,
    };
    if (await post({ action: "update", id: productId, product })) { setMsg("Saved"); onSaved(); setTimeout(() => setMsg(""), 1500); }
  };

  // Variants
  const saveVariant = async (v: VariantRow) => {
    if (await post({ action: "variant.upsert", variant: { id: v.id || undefined, productId, sku: v.sku, variantName: v.variantName, vesselType: v.vesselType, sizeLabel: v.sizeLabel, price: v.price, salePrice: v.salePrice, costPrice: v.costPrice, stock: v.stock, isActive: v.isActive, sortOrder: v.sortOrder, barcode: v.barcode, weightGrams: v.weightGrams, lowStockThreshold: v.lowStockThreshold } })) { await load(); onSaved(); }
  };
  const delVariant = async (v: VariantRow) => { if (v.id && await post({ action: "variant.delete", id: v.id, productId })) { await load(); onSaved(); } };
  const setV = (i: number, patch: Partial<VariantRow>) => setVariants((vs) => vs.map((v, j) => (j === i ? { ...v, ...patch } : v)));

  // Fragrance notes (replace-all on save)
  const layerNotes = (k: string) => notes.filter((n) => n.layer.toLowerCase() === k);
  const addNote = (k: string) => setNotes((ns) => [...ns, { id: `new-${Date.now()}`, layer: k, note: "", sortOrder: ns.filter((n) => n.layer === k).length }]);
  const setNote = (id: string, note: string) => setNotes((ns) => ns.map((n) => (n.id === id ? { ...n, note } : n)));
  const rmNote = (id: string) => setNotes((ns) => ns.filter((n) => n.id !== id));
  const saveNotes = async () => {
    const payload = LAYERS.flatMap(({ k }) => layerNotes(k).filter((n) => n.note.trim()).map((n, i) => ({ layer: k, note: n.note, sortOrder: i })));
    if (await post({ action: "notes.set", productId, notes: payload })) { setMsg("Notes saved"); setTimeout(() => setMsg(""), 1500); }
  };

  // Images
  const addImage = async () => { if (imgUrl.trim() && await post({ action: "image.add", productId, url: imgUrl, altText: imgAlt })) { setImgUrl(""); setImgAlt(""); await load(); onSaved(); } };
  const primaryImage = async (id: string) => { if (await post({ action: "image.primary", productId, id })) { await load(); onSaved(); } };
  const delImage = async (id: string) => { if (await post({ action: "image.delete", id, productId })) { await load(); onSaved(); } };
  const saveAlt = async (id: string, altText: string) => { await post({ action: "image.update", id, patch: { altText } }); };
  const moveImage = async (id: string, dir: number) => {
    const sorted = [...images].sort((a, b) => a.sortOrder - b.sortOrder);
    const i = sorted.findIndex((x) => x.id === id); const j = i + dir;
    if (j < 0 || j >= sorted.length) return;
    await post({ action: "image.update", id: sorted[i].id, patch: { sortOrder: sorted[j].sortOrder } });
    await post({ action: "image.update", id: sorted[j].id, patch: { sortOrder: sorted[i].sortOrder } });
    await load();
  };

  const addVariant = () => setVariants((vs) => [...vs, { id: "", sku: "", variantName: "", vesselType: null, sizeLabel: "", price: core?.price ?? 0, salePrice: null, costPrice: 0, stock: 0, isActive: true, sortOrder: vs.length, barcode: null, weightGrams: null, lowStockThreshold: null }]);

  if (!core) return (
    <div className="om-modal" role="dialog" aria-modal="true" onClick={onClose}><div className="om-modal__card om-modal__card--wide" onClick={(e) => e.stopPropagation()}><p className="admin__muted">Loading…</p></div></div>
  );

  return (
    <div className="om-modal" role="dialog" aria-modal="true" onClick={() => !busy && onClose()}>
      <div className="om-modal__card om-modal__card--wide" onClick={(e) => e.stopPropagation()}>
        <h2 className="om-modal__title">Edit {core.name}</h2>

        <details className="pe-sec" open>
          <summary>Basic &amp; SEO</summary>
          <div className="cfg-grid">
            <label className="cfg-field"><span>Name</span><input value={core.name} onChange={(e) => set({ name: e.target.value })} /></label>
            <label className="cfg-field"><span>Slug</span><input value={core.slug} onChange={(e) => set({ slug: e.target.value })} /></label>
            <label className="cfg-field"><span>Product type</span><select value={core.productType} onChange={(e) => set({ productType: e.target.value })}>{PRODUCT_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</select></label>
            <label className="cfg-field"><span>Category</span><select value={core.categoryId} onChange={(e) => set({ categoryId: e.target.value })}><option value="">—</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label className="cfg-field"><span>Fragrance family</span><input value={core.fragranceFamily} onChange={(e) => set({ fragranceFamily: e.target.value })} /></label>
            <label className="cfg-field"><span>Scent group</span><input value={core.scentGroup} onChange={(e) => set({ scentGroup: e.target.value })} /></label>
            <label className="cfg-field"><span>Price (₹)</span><input type="number" value={core.price} onChange={(e) => set({ price: Number(e.target.value) })} /></label>
            <label className="cfg-field"><span>Sale price (₹)</span><input type="number" value={core.salePrice} onChange={(e) => set({ salePrice: e.target.value })} placeholder="none" /></label>
            <label className="cfg-field"><span>HSN</span><input value={core.hsnCode} onChange={(e) => set({ hsnCode: e.target.value })} /></label>
            <label className="cfg-field"><span>GST %</span><select value={core.gstRate} onChange={(e) => set({ gstRate: Number(e.target.value) })}>{GST.map((g) => <option key={g} value={g}>{g}%</option>)}</select></label>
            <label className="cfg-field"><span>Weight (g)</span><input type="number" value={core.weightGrams} onChange={(e) => set({ weightGrams: e.target.value })} /></label>
          </div>
          <label className="cfg-field"><span>Tagline</span><input value={core.tagline} onChange={(e) => set({ tagline: e.target.value })} /></label>
          <div className="cfg-grid">
            <label className="cfg-field"><span>SEO title</span><input value={core.seoTitle} onChange={(e) => set({ seoTitle: e.target.value })} maxLength={70} /></label>
            <label className="cfg-field"><span>SEO OG image URL</span><input value={core.seoOgImage} onChange={(e) => set({ seoOgImage: e.target.value })} /></label>
            <label className="cfg-field"><span>Canonical URL</span><input value={core.seoCanonical} onChange={(e) => set({ seoCanonical: e.target.value })} /></label>
          </div>
          <label className="cfg-field"><span>Meta description <em className="om-field__hint">{core.seoDescription.length}/160</em></span><textarea value={core.seoDescription} onChange={(e) => set({ seoDescription: e.target.value })} rows={2} maxLength={200} /></label>
          <div className="pe-preview"><span className="pe-preview__title">{core.seoTitle || core.name}</span><span className="pe-preview__url">samorah.in/shop/{core.slug}</span><span className="pe-preview__desc">{core.seoDescription || core.tagline || "—"}</span></div>
        </details>

        <details className="pe-sec">
          <summary>Collection &amp; chapter</summary>
          <div className="cfg-grid">
            <label className="cfg-field"><span>Collection / Chapter</span><select value={core.collectionId} onChange={(e) => set({ collectionId: e.target.value })}><option value="">— none —</option>{collections.map((c) => <option key={c.id} value={c.id}>{c.volume ? `${c.volume} — ${c.name}` : c.name}</option>)}</select></label>
            <label className="cfg-field"><span>Chapter position <em className="om-field__hint">renders "No. {core.chapterPosition || "1.1"}"</em></span><input value={core.chapterPosition} onChange={(e) => set({ chapterPosition: e.target.value })} placeholder="1.1" /></label>
            <label className="cfg-field"><span>Display order</span><input type="number" value={core.displayOrder} onChange={(e) => set({ displayOrder: e.target.value })} /></label>
          </div>
        </details>

        <details className="pe-sec">
          <summary>Merchandising</summary>
          <div className="pe-flags">{FLAGS.map((f) => <label key={f.k} className="om-check"><input type="checkbox" checked={core[f.k] as boolean} onChange={(e) => set({ [f.k]: e.target.checked } as Partial<Core>)} /><span>{f.l}</span></label>)}</div>
        </details>

        <details className="pe-sec">
          <summary>Visibility &amp; publishing</summary>
          <div className="pe-flags">{VIS.map((v) => <label key={v.k} className="om-check"><input type="checkbox" checked={core[v.k] as boolean} onChange={(e) => set({ [v.k]: e.target.checked } as Partial<Core>)} /><span>{v.l}</span></label>)}</div>
          <div className="cfg-grid">
            <label className="cfg-field"><span>Status</span><select value={core.status} onChange={(e) => set({ status: e.target.value as ProductStatus })}>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
            <label className="cfg-field"><span>Schedule publish</span><input type="datetime-local" value={core.publishAt} onChange={(e) => set({ publishAt: e.target.value })} /></label>
            <label className="om-check"><input type="checkbox" checked={core.allowBackorder} onChange={(e) => set({ allowBackorder: e.target.checked })} /><span>Allow backorder</span></label>
          </div>
        </details>

        <details className="pe-sec">
          <summary>Editorial content</summary>
          <label className="cfg-field"><span>Story (short)</span><textarea value={core.story} onChange={(e) => set({ story: e.target.value })} rows={2} /></label>
          <label className="cfg-field"><span>Story (long — The Story Within)</span><textarea value={core.storyLong} onChange={(e) => set({ storyLong: e.target.value })} rows={4} /></label>
          <div className="cfg-grid">
            <label className="cfg-field"><span>Flame persona</span><input value={core.flamePersona} onChange={(e) => set({ flamePersona: e.target.value })} placeholder="The Storyteller" /></label>
            <label className="cfg-field"><span>Mood tags <em className="om-field__hint">comma-separated</em></span><input value={core.moodTags} onChange={(e) => set({ moodTags: e.target.value })} placeholder="Warm, Comforting, Cozy" /></label>
          </div>
          <label className="cfg-field"><span>Lifestyle (Living With It)</span><textarea value={core.lifestyleUse} onChange={(e) => set({ lifestyleUse: e.target.value })} rows={3} /></label>
          <label className="cfg-field"><span>Centre quote (cultural reference)</span><input value={core.culturalReference} onChange={(e) => set({ culturalReference: e.target.value })} /></label>
        </details>

        <details className="pe-sec">
          <summary>Fragrance Journey ({notes.filter((n) => n.note.trim()).length})</summary>
          <div className="pe-journey">
            {LAYERS.map(({ k, l }) => (
              <div key={k} className="pe-journey__col">
                <div className="pe-journey__head">{l}</div>
                {layerNotes(k).map((n) => (
                  <div key={n.id} className="pe-journey__row"><input value={n.note} onChange={(e) => setNote(n.id, e.target.value)} placeholder="note" /><button type="button" className="ff-link-btn" onClick={() => rmNote(n.id)}>×</button></div>
                ))}
                <button type="button" className="ff-btn ff-btn--mini" onClick={() => addNote(k)}>+ note</button>
              </div>
            ))}
          </div>
          <button type="button" className="ff-btn" disabled={busy} onClick={saveNotes}>Save fragrance journey</button>
        </details>

        <details className="pe-sec">
          <summary>Ingredients</summary>
          <div className="cfg-grid">
            <label className="cfg-field"><span>Wax blend</span><input value={core.waxBlend} onChange={(e) => set({ waxBlend: e.target.value })} /></label>
            <label className="cfg-field"><span>Wick</span><input value={core.wick} onChange={(e) => set({ wick: e.target.value })} /></label>
            <label className="cfg-field"><span>Burn time</span><input value={core.burnTime} onChange={(e) => set({ burnTime: e.target.value })} placeholder="~45 hours" /></label>
          </div>
        </details>

        <details className="pe-sec">
          <summary>Images ({images.length})</summary>
          <div className="pe-imgs">
            {[...images].sort((a, b) => a.sortOrder - b.sortOrder).map((im) => (
              <div key={im.id} className="pe-img">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={im.url} alt={im.altText ?? ""} />
                {im.isPrimary ? <span className="pe-img__hero">Hero</span> : null}
                <input className="pe-img__alt" defaultValue={im.altText ?? ""} placeholder="alt text" onBlur={(e) => saveAlt(im.id, e.target.value)} />
                <div className="pe-img__actions">
                  {!im.isPrimary ? <button type="button" className="ff-btn ff-btn--mini" onClick={() => primaryImage(im.id)}>Set hero</button> : null}
                  <button type="button" className="ff-btn ff-btn--mini" onClick={() => moveImage(im.id, -1)}>↑</button>
                  <button type="button" className="ff-btn ff-btn--mini" onClick={() => moveImage(im.id, 1)}>↓</button>
                  <button type="button" className="ff-btn ff-btn--mini ff-btn--danger" onClick={() => delImage(im.id)}>×</button>
                </div>
              </div>
            ))}
          </div>
          <div className="pe-imgadd">
            <input value={imgUrl} onChange={(e) => setImgUrl(e.target.value)} placeholder="Image URL (Cloudinary)" />
            <input value={imgAlt} onChange={(e) => setImgAlt(e.target.value)} placeholder="Alt text" />
            <button type="button" className="ff-btn" disabled={busy || !imgUrl.trim()} onClick={addImage}>Add image</button>
          </div>
        </details>

        <details className="pe-sec">
          <summary>Variants ({variants.length})</summary>
          <p className="om-field__hint" style={{ margin: "0 0 8px" }}>Size / Volume holds the unit label — e.g. <b>100g</b> for candles, <b>100ml</b> for room / linen fresheners. Barcode, weight, and low-stock alert are per variant.</p>
          {variants.map((v, i) => (
            <div key={v.id || `new${i}`} className="pe-variant">
              <div className="cfg-row" style={{ gridTemplateColumns: "1.2fr 0.8fr 0.7fr 0.6fr 0.6fr 0.6fr auto auto" }}>
                <input value={v.sku} onChange={(e) => setV(i, { sku: e.target.value })} placeholder="SKU" />
                <select value={v.vesselType ?? ""} onChange={(e) => setV(i, { vesselType: (e.target.value || null) as VesselType | null })}><option value="">vessel</option>{VESSELS.map((x) => <option key={x} value={x}>{x}</option>)}</select>
                <input value={v.sizeLabel ?? ""} onChange={(e) => setV(i, { sizeLabel: e.target.value })} placeholder="100g / 100ml" title="Size / Volume" />
                <input type="number" value={v.price} onChange={(e) => setV(i, { price: Number(e.target.value) })} placeholder="price ₹" />
                <input type="number" value={v.costPrice} onChange={(e) => setV(i, { costPrice: Number(e.target.value) })} placeholder="cost ₹" />
                <input type="number" value={v.stock} onChange={(e) => setV(i, { stock: Number(e.target.value) })} placeholder="stock" />
                <button type="button" className="cfg-toggle" data-on={v.isActive ? "1" : "0"} onClick={() => setV(i, { isActive: !v.isActive })}>{v.isActive ? "On" : "Off"}</button>
                <span className="ff-actions"><button type="button" className="ff-btn" disabled={busy} onClick={() => saveVariant(v)}>Save</button>{v.id ? <button type="button" className="ff-btn ff-btn--danger" disabled={busy} onClick={() => delVariant(v)}>×</button> : null}</span>
              </div>
              <div className="cfg-row pe-variant__sub" style={{ gridTemplateColumns: "1.4fr 0.8fr 0.8fr" }}>
                <input value={v.barcode ?? ""} onChange={(e) => setV(i, { barcode: e.target.value })} placeholder="Barcode / EAN" />
                <input type="number" value={v.weightGrams ?? ""} onChange={(e) => setV(i, { weightGrams: e.target.value === "" ? null : Number(e.target.value) })} placeholder="weight g" title="Shipping weight (g)" />
                <input type="number" value={v.lowStockThreshold ?? ""} onChange={(e) => setV(i, { lowStockThreshold: e.target.value === "" ? null : Number(e.target.value) })} placeholder="low-stock alert" title="Low-stock threshold" />
              </div>
            </div>
          ))}
          <button type="button" className="ff-btn" onClick={addVariant}>+ variant</button>
        </details>

        {err ? <p className="ff-err">{err}</p> : null}
        <div className="om-modal__actions">
          <button type="button" className="ff-btn" disabled={busy} onClick={onClose}>Close</button>
          {msg ? <span className="ff-done">{msg}</span> : null}
          <button type="button" className="ff-btn ff-btn--primary" disabled={busy} onClick={saveCore}>{busy ? "Saving…" : "Save product"}</button>
        </div>
      </div>
    </div>
  );
}
