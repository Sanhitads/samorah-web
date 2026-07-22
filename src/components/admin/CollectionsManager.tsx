"use client";

import { useEffect, useMemo, useState, useTransition, type FocusEvent } from "react";
import { useRouter } from "next/navigation";
import type { CollectionRow } from "@/services/collectionAdminService";
import { LivePreviewPanel } from "@/components/admin/LivePreviewPanel";

/** Assemble the air_chapter config from the editor fields — used by BOTH save and the live preview. */
function assembleAirChapter(c: CEdit) {
  return {
    heroEyebrow: c.airHeroEyebrow || undefined,
    room: { label: c.airRoomLabel || undefined, title: c.airRoomTitle || undefined, note: c.airRoomNote || undefined },
    linen: { label: c.airLinenLabel || undefined, title: c.airLinenTitle || undefined, note: c.airLinenNote || undefined },
    teaser: { closing: c.airTeaserClosing || undefined, cta: c.airTeaserCta || undefined },
  };
}

/**
 * Chapter CMS (review: the biggest architectural gap). List + create + a full chapter editor —
 * hero + editorial + SEO + visibility + product ordering within the chapter. Mirrors the product
 * editor's collapsible pattern; posts to /api/admin/collections. Launching "Monsoon Library" is now
 * an admin task, not a code change.
 */
const sv = (v: unknown) => (v == null ? "" : String(v));

export function CollectionsManager({ collections }: { collections: CollectionRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const post = async (body: Record<string, unknown>): Promise<any> => {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/admin/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json(); setBusy(false);
      if (!res.ok || d.ok === false) { setErr(d.error ?? d.reason ?? "Failed"); return null; }
      return d;
    } catch { setBusy(false); setErr("Network error"); return null; }
  };
  const refresh = () => startTransition(() => router.refresh());

  return (
    <div className="cfg">
      <div className="cfg-actions">
        <button type="button" className="ff-btn ff-btn--primary" onClick={() => { setErr(""); setCreating(true); }}>New chapter</button>
        {pending ? <span className="ff-refreshing">updating…</span> : null}
        {err && !creating && !editId ? <span className="ff-err">{err}</span> : null}
      </div>

      <div className="admin__table-wrap">
        <table className="admin__table admin__table--board">
          <thead><tr><th></th><th>Chapter</th><th>Volume</th><th>Products</th><th>Order</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {collections.map((c) => (
              <tr key={c.id}>
                <td>{c.coverImageUrl ? (/* eslint-disable-next-line @next/next/no-img-element */ <img className="pl-thumb" src={c.coverImageUrl} alt="" />) : <span className="pl-thumb pl-thumb--empty" />}</td>
                <td>{c.name}<div className="admin__muted admin__mono">/chapters/{c.slug}</div></td>
                <td className="admin__muted">{c.volume ?? "—"}</td>
                <td className="admin__mono">{c.productCount}</td>
                <td className="admin__mono">{c.sortOrder}</td>
                <td>{c.isComingSoon ? <span className="pending-badge">coming soon</span> : <span className="om-pay" data-tone={c.isActive ? "paid" : "pending"}>{c.isActive ? "active" : "draft"}</span>}</td>
                <td className="ff-actions">
                  <button type="button" className="ff-btn" onClick={() => setEditId(c.id)}>Edit</button>
                  <button type="button" className="ff-btn" disabled={busy} onClick={async () => { if (await post({ action: "status", id: c.id, isActive: !c.isActive })) refresh(); }}>{c.isActive ? "Archive" : "Activate"}</button>
                </td>
              </tr>
            ))}
            {collections.length === 0 ? <tr><td colSpan={7} className="admin__empty">No chapters yet.</td></tr> : null}
          </tbody>
        </table>
      </div>

      {creating ? <CreateModal busy={busy} err={err} onClose={() => setCreating(false)} onCreate={async (c) => { const d = await post({ action: "create", collection: c }); if (d?.ok) { setCreating(false); refresh(); setEditId(d.id); } }} /> : null}
      {editId ? <CollectionEditor id={editId} onClose={() => setEditId(null)} onSaved={refresh} /> : null}
    </div>
  );
}

type CEdit = {
  name: string; slug: string; volume: string; tagline: string; poeticLine: string; description: string; intro: string; storyLong: string;
  coverImageUrl: string; heroMobileUrl: string; heroProductId: string; seoTitle: string; seoDescription: string; seoOgImage: string;
  sortOrder: string; isActive: boolean; isComingSoon: boolean;
  // Air chapter CMS (Room / Linen sprays) — blanks use the house wording.
  airHeroEyebrow: string;
  airRoomLabel: string; airRoomTitle: string; airRoomNote: string;
  airLinenLabel: string; airLinenTitle: string; airLinenNote: string;
  airTeaserClosing: string; airTeaserCta: string;
};

function CollectionEditor({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved: () => void }) {
  const [c, setC] = useState<CEdit | null>(null);
  const [products, setProducts] = useState<{ id: string; name: string; displayOrder: number; heroProduct: boolean }[]>([]);
  const [allProducts, setAllProducts] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const [previewOn, setPreviewOn] = useState(true);
  const [focusId, setFocusId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [airProducts, setAirProducts] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [nextCol, setNextCol] = useState<any>(undefined);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const post = async (body: Record<string, unknown>): Promise<any> => {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/admin/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json(); setBusy(false);
      if (!res.ok || d.ok === false) { setErr(d.error ?? d.reason ?? "Failed"); return null; }
      return d;
    } catch { setBusy(false); setErr("Network error"); return null; }
  };

  const load = async () => {
    const d = await post({ action: "get", id });
    if (!d?.collection) return;
    const x = d.collection;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ch = (x.air_chapter ?? {}) as any;
    setC({
      name: sv(x.name), slug: sv(x.slug), volume: sv(x.volume), tagline: sv(x.tagline), poeticLine: sv(x.poetic_line), description: sv(x.description),
      intro: sv(x.intro), storyLong: sv(x.story_long), coverImageUrl: sv(x.cover_image_url), heroMobileUrl: sv(x.hero_mobile_url), heroProductId: sv(x.hero_product_id),
      seoTitle: sv(x.seo_title), seoDescription: sv(x.seo_description), seoOgImage: sv(x.seo_og_image),
      sortOrder: x.sort_order != null ? String(x.sort_order) : "0", isActive: Boolean(x.is_active), isComingSoon: Boolean(x.is_coming_soon),
      airHeroEyebrow: sv(ch.heroEyebrow),
      airRoomLabel: sv(ch.room?.label), airRoomTitle: sv(ch.room?.title), airRoomNote: sv(ch.room?.note),
      airLinenLabel: sv(ch.linen?.label), airLinenTitle: sv(ch.linen?.title), airLinenNote: sv(ch.linen?.note),
      airTeaserClosing: sv(ch.teaser?.closing), airTeaserCta: sv(ch.teaser?.cta),
    });
    setProducts(d.products ?? []); setAllProducts(d.allProducts ?? []);
    // Air products + next volume for the live preview (empty for non-air chapters → no preview shown).
    const ad = await post({ action: "air.data", id });
    setAirProducts(ad?.products ?? []); setNextCol(ad?.nextCol);
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const set = (patch: Partial<CEdit>) => setC((v) => (v ? { ...v, ...patch } : v));

  // Live preview draft — a collection row + its air products + next volume, so /chapter-preview renders
  // the REAL chapter page from the current (unsaved) form.
  const draft = useMemo(() => {
    if (!c) return null;
    return {
      col: { slug: c.slug, volume: c.volume, name: c.name, tagline: c.tagline, cover_image_url: c.coverImageUrl, is_coming_soon: c.isComingSoon, air_chapter: assembleAirChapter(c) },
      products: airProducts,
      nextCol,
    };
  }, [c, airProducts, nextCol]);
  const onFieldFocus = (e: FocusEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement).closest?.("[data-anchor]")?.getAttribute("data-anchor");
    if (anchor) setFocusId(anchor);
  };
  const save = async () => {
    if (!c) return;
    const collection = { ...c, heroProductId: c.heroProductId || null, sortOrder: Number(c.sortOrder || 0), airChapter: assembleAirChapter(c) };
    if (await post({ action: "update", id, collection })) { setMsg("Saved"); onSaved(); setTimeout(() => setMsg(""), 1500); }
  };
  const moveProduct = async (pid: string, dir: number) => {
    const sorted = [...products].sort((a, b) => a.displayOrder - b.displayOrder);
    const i = sorted.findIndex((p) => p.id === pid); const j = i + dir;
    if (j < 0 || j >= sorted.length) return;
    await post({ action: "product.order", productId: sorted[i].id, displayOrder: sorted[j].displayOrder });
    await post({ action: "product.order", productId: sorted[j].id, displayOrder: sorted[i].displayOrder });
    await load(); onSaved();
  };

  if (!c) return <div className="om-modal" role="dialog" aria-modal="true" onClick={onClose}><div className="om-modal__card om-modal__card--wide" onClick={(e) => e.stopPropagation()}><p className="admin__muted">Loading…</p></div></div>;

  const isAirChapter = airProducts.length > 0;
  const showPreview = isAirChapter && previewOn;
  const formCol = (
    <div className={`om-modal__card om-modal__card--wide${showPreview ? " pe-live__card" : ""}`} onClick={(e) => e.stopPropagation()} onFocusCapture={onFieldFocus}>
      <div className="pe-live__cardhead">
        <h2 className="om-modal__title">Edit {c.name}</h2>
        {isAirChapter ? <button type="button" className="ff-btn ff-btn--mini" onClick={() => setPreviewOn((v) => !v)}>{previewOn ? "Hide live preview" : "Live preview"}</button> : null}
      </div>

        <details className="pe-sec" open data-anchor="hero">
          <summary>Basic</summary>
          <div className="cfg-grid">
            <label className="cfg-field"><span>Name</span><input value={c.name} onChange={(e) => set({ name: e.target.value })} /></label>
            <label className="cfg-field"><span>Slug</span><input value={c.slug} onChange={(e) => set({ slug: e.target.value })} /></label>
            <label className="cfg-field"><span>Volume</span><input value={c.volume} onChange={(e) => set({ volume: e.target.value })} placeholder="Vol. I" /></label>
            <label className="cfg-field"><span>Display order</span><input type="number" value={c.sortOrder} onChange={(e) => set({ sortOrder: e.target.value })} /></label>
          </div>
          <label className="cfg-field"><span>Tagline</span><input value={c.tagline} onChange={(e) => set({ tagline: e.target.value })} /></label>
          <label className="cfg-field"><span>Poetic line</span><input value={c.poeticLine} onChange={(e) => set({ poeticLine: e.target.value })} placeholder="A warmth that gathers…" /></label>
        </details>

        <details className="pe-sec">
          <summary>Editorial content</summary>
          <label className="cfg-field"><span>Introduction</span><textarea value={c.intro} onChange={(e) => set({ intro: e.target.value })} rows={2} /></label>
          <label className="cfg-field"><span>Description</span><textarea value={c.description} onChange={(e) => set({ description: e.target.value })} rows={3} /></label>
          <label className="cfg-field"><span>Long story</span><textarea value={c.storyLong} onChange={(e) => set({ storyLong: e.target.value })} rows={4} /></label>
        </details>

        <details className="pe-sec">
          <summary>Hero &amp; media</summary>
          <div className="cfg-grid">
            <label className="cfg-field"><span>Hero image URL (desktop)</span><input value={c.coverImageUrl} onChange={(e) => set({ coverImageUrl: e.target.value })} /></label>
            <label className="cfg-field"><span>Hero image URL (mobile)</span><input value={c.heroMobileUrl} onChange={(e) => set({ heroMobileUrl: e.target.value })} /></label>
            <label className="cfg-field"><span>Hero (signature) product</span><select value={c.heroProductId} onChange={(e) => set({ heroProductId: e.target.value })}><option value="">— none —</option>{allProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          </div>
        </details>

        <details className="pe-sec" open>
          <summary>Air chapter (Room / Linen sprays)</summary>
          <p className="om-field__hint" style={{ margin: "0 0 8px" }}>The group headings + next-volume teaser for the air chapter page. Blank uses the house wording (shown as the placeholder). Applies when this collection holds Room / Linen sprays.</p>
          <label className="cfg-field" data-anchor="hero"><span>Hero eyebrow</span><input value={c.airHeroEyebrow} onChange={(e) => set({ airHeroEyebrow: e.target.value })} placeholder="The Hours Collection" /></label>
          <p className="om-field__hint" style={{ margin: "10px 0 4px", fontWeight: 600 }}>The Room — room sprays</p>
          <div className="cfg-grid" data-anchor="hours-room">
            <label className="cfg-field"><span>Eyebrow</span><input value={c.airRoomLabel} onChange={(e) => set({ airRoomLabel: e.target.value })} placeholder="Shared Hours" /></label>
            <label className="cfg-field"><span>Title</span><input value={c.airRoomTitle} onChange={(e) => set({ airRoomTitle: e.target.value })} placeholder="The Room" /></label>
          </div>
          <label className="cfg-field" data-anchor="hours-room"><span>Note</span><input value={c.airRoomNote} onChange={(e) => set({ airRoomNote: e.target.value })} placeholder="The atmosphere a room makes for itself." /></label>
          <p className="om-field__hint" style={{ margin: "10px 0 4px", fontWeight: 600 }}>The Linen — linen sprays</p>
          <div className="cfg-grid" data-anchor="hours-linen">
            <label className="cfg-field"><span>Eyebrow</span><input value={c.airLinenLabel} onChange={(e) => set({ airLinenLabel: e.target.value })} placeholder="Private Hours" /></label>
            <label className="cfg-field"><span>Title</span><input value={c.airLinenTitle} onChange={(e) => set({ airLinenTitle: e.target.value })} placeholder="The Linen" /></label>
          </div>
          <label className="cfg-field" data-anchor="hours-linen"><span>Note</span><input value={c.airLinenNote} onChange={(e) => set({ airLinenNote: e.target.value })} placeholder="For linen, for fabric, for the hours that ask for nothing." /></label>
          <p className="om-field__hint" style={{ margin: "10px 0 4px", fontWeight: 600 }}>Next-volume teaser</p>
          <div className="cfg-grid" data-anchor="future-volume">
            <label className="cfg-field"><span>Closing line</span><input value={c.airTeaserClosing} onChange={(e) => set({ airTeaserClosing: e.target.value })} placeholder="Coming in the next volume." /></label>
            <label className="cfg-field"><span>CTA</span><input value={c.airTeaserCta} onChange={(e) => set({ airTeaserCta: e.target.value })} placeholder="Available Soon" /></label>
          </div>
          <p className="om-field__hint" style={{ margin: "8px 0 0" }}>The teaser shows the next collection marked “Coming soon” (by display order); its volume, title and story come from that collection.</p>
        </details>

        <details className="pe-sec">
          <summary>SEO</summary>
          <div className="cfg-grid">
            <label className="cfg-field"><span>SEO title</span><input value={c.seoTitle} onChange={(e) => set({ seoTitle: e.target.value })} maxLength={70} /></label>
            <label className="cfg-field"><span>OG image URL</span><input value={c.seoOgImage} onChange={(e) => set({ seoOgImage: e.target.value })} /></label>
          </div>
          <label className="cfg-field"><span>Meta description</span><textarea value={c.seoDescription} onChange={(e) => set({ seoDescription: e.target.value })} rows={2} maxLength={200} /></label>
          <div className="pe-preview"><span className="pe-preview__title">{c.seoTitle || c.name}</span><span className="pe-preview__url">samorah.in/chapters/{c.slug}</span><span className="pe-preview__desc">{c.seoDescription || c.tagline || "—"}</span></div>
        </details>

        <details className="pe-sec">
          <summary>Visibility</summary>
          <div className="pe-flags">
            <label className="om-check"><input type="checkbox" checked={c.isActive} onChange={(e) => set({ isActive: e.target.checked })} /><span>Active (published)</span></label>
            <label className="om-check"><input type="checkbox" checked={c.isComingSoon} onChange={(e) => set({ isComingSoon: e.target.checked })} /><span>Coming soon</span></label>
          </div>
        </details>

        <details className="pe-sec" open>
          <summary>Products in this chapter ({products.length})</summary>
          {products.length ? [...products].sort((a, b) => a.displayOrder - b.displayOrder).map((p) => (
            <div key={p.id} className="cfg-row" style={{ gridTemplateColumns: "1fr auto auto auto" }}>
              <span>{p.name}{p.heroProduct ? <span className="pl-flag" style={{ marginLeft: 6 }}>HERO</span> : null}</span>
              <span className="admin__muted admin__mono">#{p.displayOrder}</span>
              <button type="button" className="ff-btn ff-btn--mini" onClick={() => moveProduct(p.id, -1)}>↑</button>
              <button type="button" className="ff-btn ff-btn--mini" onClick={() => moveProduct(p.id, 1)}>↓</button>
            </div>
          )) : <p className="admin__muted">No products assigned. Assign products to this chapter from the product editor (Collection &amp; chapter).</p>}
        </details>

        {err ? <p className="ff-err">{err}</p> : null}
        <div className="om-modal__actions">
          <button type="button" className="ff-btn" disabled={busy} onClick={onClose}>Close</button>
          {msg ? <span className="ff-done">{msg}</span> : null}
          <button type="button" className="ff-btn ff-btn--primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save chapter"}</button>
        </div>
    </div>
  );

  if (showPreview) {
    return (
      <div className="pe-live" role="dialog" aria-modal="true">
        <div className="pe-live__form">{formCol}</div>
        <LivePreviewPanel src="/chapter-preview" draft={draft} focusId={focusId} onRefresh={load} />
      </div>
    );
  }
  return (
    <div className="om-modal" role="dialog" aria-modal="true" onClick={() => !busy && onClose()}>
      {formCol}
    </div>
  );
}

function CreateModal({ busy, err, onClose, onCreate }: { busy: boolean; err: string; onClose: () => void; onCreate: (c: { name: string; slug: string; volume: string }) => void }) {
  const [f, setF] = useState({ name: "", slug: "", volume: "" });
  return (
    <div className="om-modal" role="dialog" aria-modal="true" onClick={() => !busy && onClose()}>
      <div className="om-modal__card" onClick={(e) => e.stopPropagation()}>
        <h2 className="om-modal__title">New chapter</h2>
        <p className="om-modal__note">Creates a draft (coming soon). Add hero, story, SEO, and products after saving.</p>
        <label className="cfg-field"><span>Name</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Monsoon Library" /></label>
        <label className="cfg-field"><span>Slug</span><input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} placeholder="monsoon-library" /></label>
        <label className="cfg-field"><span>Volume</span><input value={f.volume} onChange={(e) => setF({ ...f, volume: e.target.value })} placeholder="Vol. V" /></label>
        {err ? <p className="ff-err">{err}</p> : null}
        <div className="om-modal__actions"><button type="button" className="ff-btn" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="ff-btn ff-btn--primary" disabled={busy || !f.name.trim() || !f.slug.trim()} onClick={() => onCreate(f)}>{busy ? "Creating…" : "Create chapter"}</button></div>
      </div>
    </div>
  );
}
