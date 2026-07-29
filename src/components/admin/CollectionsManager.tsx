"use client";

import { useEffect, useMemo, useState, useTransition, type FocusEvent } from "react";
import { useRouter } from "next/navigation";
import type { CollectionRow } from "@/services/collectionAdminService";
import { LivePreviewPanel } from "@/components/admin/LivePreviewPanel";

/** Assemble the air_chapter config from the editor fields — used by BOTH save and the live preview. */
// Assemble the chapter_content JSON from the flat candle-chapter fields — used by BOTH save and the
// live preview draft, so what you preview is exactly what saves. Blank fields → house defaults.
function assembleChapterContent(c: CEdit) {
  const labels = {
    breadcrumb: c.chBreadcrumb || undefined, heroPoeticLine: c.chHeroPoeticLine || undefined, introLine: c.chIntroLine || undefined,
    signatureEyebrow: c.chSignatureEyebrow || undefined, restHeading: c.chRestHeading || undefined, quoteLine: c.chQuoteLine || undefined, nextHeading: c.chNextHeading || undefined,
  };
  const hasLabels = Object.values(labels).some(Boolean);
  const palette: Record<string, string> = {};
  if (c.chPalette === "custom") { palette.surface = c.chCustomSurface; palette.ink = c.chCustomInk; }
  if (c.chAccent) palette.accent = c.chAccent;
  return {
    customPalette: Object.keys(palette).length ? palette : undefined,
    labels: hasLabels ? labels : undefined,
  };
}

function assembleAirChapter(c: CEdit) {
  return {
    heroEyebrow: c.airHeroEyebrow || undefined,
    room: { label: c.airRoomLabel || undefined, title: c.airRoomTitle || undefined, note: c.airRoomNote || undefined },
    linen: { label: c.airLinenLabel || undefined, title: c.airLinenTitle || undefined, note: c.airLinenNote || undefined },
    teaser: { closing: c.airTeaserClosing || undefined, cta: c.airTeaserCta || undefined },
    palette: c.airPalette && c.airPalette !== "custom" ? c.airPalette : undefined,
    customPalette: c.airPalette === "custom" ? { surface: c.airCustomSurface, ink: c.airCustomInk } : undefined,
    heroGradient: c.airHeroGradient || undefined,
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
  airPalette: string; airCustomSurface: string; airCustomInk: string; airHeroGradient: string;
  // Candle chapter CMS (colours + section headings + the three independent poetic lines) — blanks use house wording.
  chPalette: string; chCustomSurface: string; chCustomInk: string; chAccent: string;
  chBreadcrumb: string; chHeroPoeticLine: string; chIntroLine: string; chSignatureEyebrow: string; chRestHeading: string; chQuoteLine: string; chNextHeading: string;
};

const AIR_PALETTES = ["morning-blue", "amber-hour", "sand", "deep-indigo", "monsoon"];
const AIR_GRADIENTS = ["gradient:grad-air", "gradient:grad-chai", "gradient:grad-amethyst", "gradient:grad-blush"];
// WCAG-ish contrast ratio between two hex colours — a readability hint for custom palettes.
const rgbOf = (h: string): [number, number, number] => { const m = h.replace("#", ""); const s = m.length === 3 ? m.split("").map((c) => c + c).join("") : m.slice(0, 6); const n = parseInt(s, 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lum = (rgb: [number, number, number]) => { const a = rgb.map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };
const contrastRatio = (h1: string, h2: string) => { const l1 = lum(rgbOf(h1)), l2 = lum(rgbOf(h2)); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };

function CollectionEditor({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved: () => void }) {
  const [c, setC] = useState<CEdit | null>(null);
  const [products, setProducts] = useState<{ id: string; name: string; displayOrder: number; heroProduct: boolean; productType: string; chapterImage: string; interlude: string; chapterFromPrice: string }[]>([]);
  const [allProducts, setAllProducts] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const [previewOn, setPreviewOn] = useState(true);
  const [focusId, setFocusId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [airProducts, setAirProducts] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [nextCol, setNextCol] = useState<any>(undefined);
  // Candle chapter preview data (the collection's candle products + all chapters) — loaded for non-air chapters.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [candleChapter, setCandleChapter] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [allChapters, setAllChapters] = useState<any[]>([]);

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cc = (x.chapter_content ?? {}) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ccl = (cc.labels ?? {}) as any;
    setC({
      name: sv(x.name), slug: sv(x.slug), volume: sv(x.volume), tagline: sv(x.tagline), poeticLine: sv(x.poetic_line), description: sv(x.description),
      intro: sv(x.intro), storyLong: sv(x.story_long), coverImageUrl: sv(x.cover_image_url), heroMobileUrl: sv(x.hero_mobile_url), heroProductId: sv(x.hero_product_id),
      seoTitle: sv(x.seo_title), seoDescription: sv(x.seo_description), seoOgImage: sv(x.seo_og_image),
      sortOrder: x.sort_order != null ? String(x.sort_order) : "0", isActive: Boolean(x.is_active), isComingSoon: Boolean(x.is_coming_soon),
      airHeroEyebrow: sv(ch.heroEyebrow),
      airRoomLabel: sv(ch.room?.label), airRoomTitle: sv(ch.room?.title), airRoomNote: sv(ch.room?.note),
      airLinenLabel: sv(ch.linen?.label), airLinenTitle: sv(ch.linen?.title), airLinenNote: sv(ch.linen?.note),
      airTeaserClosing: sv(ch.teaser?.closing), airTeaserCta: sv(ch.teaser?.cta),
      airPalette: ch.customPalette ? "custom" : sv(ch.palette), airCustomSurface: sv(ch.customPalette?.surface) || "#e6e9e6", airCustomInk: sv(ch.customPalette?.ink) || "#26302a", airHeroGradient: sv(ch.heroGradient),
      chPalette: cc.customPalette?.surface ? "custom" : "", chCustomSurface: sv(cc.customPalette?.surface) || "#e8e0d4", chCustomInk: sv(cc.customPalette?.ink) || "#2a2018", chAccent: sv(cc.customPalette?.accent),
      chBreadcrumb: sv(ccl.breadcrumb), chHeroPoeticLine: sv(ccl.heroPoeticLine), chIntroLine: sv(ccl.introLine),
      chSignatureEyebrow: sv(ccl.signatureEyebrow), chRestHeading: sv(ccl.restHeading), chQuoteLine: sv(ccl.quoteLine), chNextHeading: sv(ccl.nextHeading),
    });
    setProducts(d.products ?? []); setAllProducts(d.allProducts ?? []);
    // Air products + next volume for the air-chapter live preview (empty for non-air chapters).
    const ad = await post({ action: "air.data", id });
    setAirProducts(ad?.products ?? []); setNextCol(ad?.nextCol);
    // Candle chapter data for the candle-chapter live preview (when it isn't an air chapter).
    if (!(ad?.products ?? []).length) {
      const cd = await post({ action: "chapter.data", id });
      setCandleChapter(cd?.chapter ?? null); setAllChapters(cd?.allChapters ?? []);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const set = (patch: Partial<CEdit>) => setC((v) => (v ? { ...v, ...patch } : v));
  // Upload a file to Cloudinary via the media API → returns its URL (shared by hero + per-product images).
  const uploadFile = async (file: File, folder: string, alt: string): Promise<string | null> => {
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("file", file); fd.append("folder", folder); if (alt) fd.append("alt", alt);
      const res = await fetch("/api/admin/media", { method: "POST", body: fd });
      const d = await res.json(); setBusy(false);
      if (!res.ok || !d.url) { setErr(d.error ?? d.reason ?? "Upload failed"); return null; }
      return d.url as string;
    } catch (e) { setBusy(false); setErr(e instanceof Error ? e.message : "Upload failed"); return null; }
  };
  const setProductChapterImage = async (productId: string, file: File) => {
    const url = await uploadFile(file, "chapters", c?.name || "");
    if (url && await post({ action: "product.chapterImage", productId, url })) { await load(); onSaved(); }
  };
  // Interlude — the quote after a product's card. Edit live (updates the input + the preview draft),
  // persist on blur.
  const editInterlude = (productId: string, value: string) => {
    setProducts((ps) => ps.map((p) => (p.id === productId ? { ...p, interlude: value } : p)));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setAirProducts((aps) => aps.map((p: any) => (p.id === productId ? { ...p, air_content: { ...(p.air_content || {}), interlude: value } } : p)));
  };
  const saveInterlude = (productId: string, value: string) => { void post({ action: "product.interlude", productId, value }); };
  // Chapter-card "From" price — edit live (updates the input + the candle preview draft), persist on blur.
  const editChapterFromPrice = (productId: string, value: string) => {
    setProducts((ps) => ps.map((p) => (p.id === productId ? { ...p, chapterFromPrice: value } : p)));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setCandleChapter((cc: any) => (cc ? { ...cc, products: (cc.products ?? []).map((p: any) => (p.id === productId ? { ...p, chapterFromPrice: value && Number(value) > 0 ? Number(value) : null } : p)) } : cc));
  };
  const saveChapterFromPrice = (productId: string, value: string) => { void post({ action: "product.chapterFromPrice", productId, value }); };

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

  // Candle chapter preview draft — the live collection fields merged with its candle products + all
  // chapters, so /candle-chapter-preview rebuilds the REAL chapter page from the current (unsaved) form.
  const candleDraft = useMemo(() => {
    if (!c || !candleChapter) return null;
    return {
      chapter: {
        id: candleChapter.id, slug: c.slug, name: c.name, volume: c.volume || null,
        tagline: c.tagline || null, poetic_line: c.poeticLine || null, description: c.description || null,
        cover_image_url: c.coverImageUrl || null, is_coming_soon: c.isComingSoon,
        hero_product_id: c.heroProductId || null, created_at: candleChapter.created_at,
        intro: c.intro || null, story_long: c.storyLong || null,
        products: candleChapter.products ?? [],
        chapter_content: assembleChapterContent(c),
      },
      allChapters,
    };
  }, [c, candleChapter, allChapters]);
  const onFieldFocus = (e: FocusEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement).closest?.("[data-anchor]")?.getAttribute("data-anchor");
    if (anchor) setFocusId(anchor);
  };
  const save = async () => {
    if (!c) return;
    const collection = { ...c, heroProductId: c.heroProductId || null, sortOrder: Number(c.sortOrder || 0), airChapter: assembleAirChapter(c), chapterContent: assembleChapterContent(c) };
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
  const isCandleChapter = !isAirChapter && candleChapter != null; // a non-air chapter → candle chapter page
  const showPreview = (isAirChapter || isCandleChapter) && previewOn;
  const formCol = (
    <div className={`om-modal__card om-modal__card--wide${showPreview ? " pe-live__card" : ""}`} onClick={(e) => e.stopPropagation()} onFocusCapture={onFieldFocus}>
      <div className="pe-live__cardhead">
        <h2 className="om-modal__title">Edit {c.name}</h2>
        {isAirChapter || isCandleChapter ? <button type="button" className="ff-btn ff-btn--mini" onClick={() => setPreviewOn((v) => !v)}>{previewOn ? "Hide live preview" : "Live preview"}</button> : null}
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

        <details className="pe-sec" data-anchor="hero">
          <summary>Hero &amp; media</summary>
          <div className="cfg-grid">
            <label className="cfg-field"><span>Hero image URL (desktop)</span><input value={c.coverImageUrl} onChange={(e) => set({ coverImageUrl: e.target.value })} placeholder="Upload below, or paste a URL" /></label>
            <label className="cfg-field"><span>Hero image URL (mobile)</span><input value={c.heroMobileUrl} onChange={(e) => set({ heroMobileUrl: e.target.value })} /></label>
            <label className="cfg-field"><span>Hero (signature) product</span><select value={c.heroProductId} onChange={(e) => set({ heroProductId: e.target.value })}><option value="">— none —</option>{allProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          </div>
          <div className="pe-imgadd" style={{ alignItems: "center" }}>
            {c.coverImageUrl ? (/* eslint-disable-next-line @next/next/no-img-element */ <img className="pl-thumb" src={c.coverImageUrl} alt="" />) : <span className="pl-thumb pl-thumb--empty" />}
            <label className={`ff-btn ff-btn--primary${busy ? " is-disabled" : ""}`} style={{ cursor: busy ? "default" : "pointer" }}>
              {busy ? "Uploading…" : "⬆ Upload hero image"}
              <input type="file" accept="image/*" style={{ display: "none" }} disabled={busy} onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const url = await uploadFile(f, "chapters", c.name); if (url) set({ coverImageUrl: url }); } e.target.value = ""; }} />
            </label>
          </div>
        </details>

        {isAirChapter ? (
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

          <p className="om-field__hint" style={{ margin: "12px 0 4px", fontWeight: 600 }}>Section colours</p>
          <div className="cfg-grid" data-anchor="hours-room">
            <label className="cfg-field"><span>Section palette <em className="om-field__hint">the page colour</em></span>
              <select value={c.airPalette} onChange={(e) => set({ airPalette: e.target.value })}>
                <option value="">Default (monsoon)</option>
                {AIR_PALETTES.map((p) => <option key={p} value={p}>{p}</option>)}
                <option value="custom">Custom…</option>
              </select>
            </label>
            <label className="cfg-field"><span>Hero gradient <em className="om-field__hint">used when no hero image</em></span>
              <select value={c.airHeroGradient} onChange={(e) => set({ airHeroGradient: e.target.value })}>
                <option value="">Default (grad-air)</option>
                {AIR_GRADIENTS.map((g) => <option key={g} value={g}>{g.replace("gradient:", "")}</option>)}
              </select>
            </label>
          </div>
          {c.airPalette === "custom" ? (
            <div className="cfg-grid" data-anchor="hours-room">
              <label className="cfg-field"><span>Section background</span><input type="color" value={c.airCustomSurface} onChange={(e) => set({ airCustomSurface: e.target.value })} /></label>
              <label className="cfg-field"><span>Section text</span><input type="color" value={c.airCustomInk} onChange={(e) => set({ airCustomInk: e.target.value })} /></label>
              <div className="cfg-field"><span>Readability</span><span style={{ fontSize: 13, color: contrastRatio(c.airCustomSurface, c.airCustomInk) >= 4.5 ? "#2e7d4f" : "#b4534b" }}>{contrastRatio(c.airCustomSurface, c.airCustomInk) >= 4.5 ? "Good contrast ✓" : "Low contrast — hard to read"}</span></div>
            </div>
          ) : null}
        </details>
        ) : null}

        {isCandleChapter ? (
        <details className="pe-sec" open data-anchor="hero">
          <summary>Chapter page — colours &amp; headings</summary>
          <p className="om-field__hint" style={{ margin: "0 0 8px" }}>Every field is optional — blank keeps the house wording. Use the live preview to see each change instantly. The three poetic lines (hero, intro, closing quote) are independent.</p>

          <p className="om-field__hint" style={{ margin: "10px 0 6px", fontWeight: 600 }}>Colours</p>
          <div className="cfg-grid" data-anchor="hero">
            <label className="cfg-field"><span>Page palette <em className="om-field__hint">the page colour</em></span>
              <select value={c.chPalette} onChange={(e) => set({ chPalette: e.target.value })}>
                <option value="">Chapter default</option>
                <option value="custom">Custom…</option>
              </select>
            </label>
            <label className="cfg-field"><span>Numbering / accent colour <em className="om-field__hint">the NO. I.2 colour</em></span><input type="color" value={c.chAccent || "#c9a96e"} onChange={(e) => set({ chAccent: e.target.value })} /></label>
          </div>
          {c.chPalette === "custom" ? (
            <div className="cfg-grid" data-anchor="hero">
              <label className="cfg-field"><span>Page background</span><input type="color" value={c.chCustomSurface} onChange={(e) => set({ chCustomSurface: e.target.value })} /></label>
              <label className="cfg-field"><span>Page text</span><input type="color" value={c.chCustomInk} onChange={(e) => set({ chCustomInk: e.target.value })} /></label>
              <div className="cfg-field"><span>Readability</span><span style={{ fontSize: 13, color: contrastRatio(c.chCustomSurface, c.chCustomInk) >= 4.5 ? "#2e7d4f" : "#b4534b" }}>{contrastRatio(c.chCustomSurface, c.chCustomInk) >= 4.5 ? "Good contrast ✓" : "Low contrast — hard to read"}</span></div>
            </div>
          ) : null}
          <p className="om-field__hint" style={{ margin: "0 0 8px" }}>To fix only the hard-to-read numbering, set the accent colour above — no need for a full custom palette.</p>

          <p className="om-field__hint" style={{ margin: "12px 0 6px", fontWeight: 600 }}>Section headings &amp; poetic lines</p>
          <div className="cfg-grid">
            <label className="cfg-field" data-anchor="hero"><span>Hero breadcrumb</span><input value={c.chBreadcrumb} onChange={(e) => set({ chBreadcrumb: e.target.value })} placeholder="The Fragrance Library" /></label>
            <label className="cfg-field" data-anchor="hero"><span>Hero poetic line</span><input value={c.chHeroPoeticLine} onChange={(e) => set({ chHeroPoeticLine: e.target.value })} placeholder={c.poeticLine || "the hero quote"} /></label>
            <label className="cfg-field" data-anchor="story"><span>Intro line</span><input value={c.chIntroLine} onChange={(e) => set({ chIntroLine: e.target.value })} placeholder={c.intro || c.poeticLine || "the opening intro line"} /></label>
            <label className="cfg-field" data-anchor="featured"><span>Signature eyebrow</span><input value={c.chSignatureEyebrow} onChange={(e) => set({ chSignatureEyebrow: e.target.value })} placeholder="The signature of this chapter" /></label>
            <label className="cfg-field" data-anchor="supporting"><span>“Rest of the chapter” heading</span><input value={c.chRestHeading} onChange={(e) => set({ chRestHeading: e.target.value })} placeholder="The rest of the chapter" /></label>
            <label className="cfg-field" data-anchor="quote"><span>Closing quote line</span><input value={c.chQuoteLine} onChange={(e) => set({ chQuoteLine: e.target.value })} placeholder={c.poeticLine || "the closing quote"} /></label>
            <label className="cfg-field" data-anchor="next-chapter"><span>Next-chapter heading</span><input value={c.chNextHeading} onChange={(e) => set({ chNextHeading: e.target.value })} placeholder="Continue to the next chapter" /></label>
          </div>
          <p className="om-field__hint" style={{ margin: "8px 0 0" }}>The “Introduction” &amp; “Long story” in Editorial content now render as the opening line + paragraphs. Custom sections and per-product chapter images are coming next.</p>
        </details>
        ) : null}

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
          <p className="om-field__hint" style={{ margin: "0 0 8px" }}>Product text is edited in the product editor. Here you set the <b>order</b>, the <b>card image</b> (the picture on this chapter page — separate from the PDP), the <b>“From” price</b> for the card (e.g. the 100g price), and (air) the <b>interlude</b>. The <b>SIGNATURE</b> product (the chapter’s hero, set in Hero &amp; media) shows first and larger.</p>
          {products.length ? [...products].sort((a, b) => a.displayOrder - b.displayOrder).map((p) => {
            const isAir = p.productType === "room_spray" || p.productType === "linen_spray";
            const anchor = isAir ? (p.productType === "linen_spray" ? "hours-linen" : "hours-room") : (p.heroProduct ? "featured" : "supporting");
            return (
              <div key={p.id} className="pe-chprod" data-anchor={anchor}>
                <div className="cfg-row" style={{ gridTemplateColumns: "auto 1fr auto auto auto", alignItems: "center", gap: 10 }}>
                  {p.chapterImage ? (/* eslint-disable-next-line @next/next/no-img-element */ <img className="pl-thumb" src={p.chapterImage} alt="" />) : <span className="pl-thumb pl-thumb--empty" />}
                  <span>{p.name}{p.heroProduct ? <span className="pl-flag" style={{ marginLeft: 6 }}>SIGNATURE</span> : null} <span className="admin__muted admin__mono">#{p.displayOrder}</span></span>
                  <label className={`ff-btn ff-btn--mini${busy ? " is-disabled" : ""}`} style={{ cursor: busy ? "default" : "pointer" }} title="A different image for the chapter card (separate from the PDP)">
                    {p.chapterImage ? "Replace card image" : "⬆ Card image"}
                    <input type="file" accept="image/*" style={{ display: "none" }} disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void setProductChapterImage(p.id, f); e.target.value = ""; }} />
                  </label>
                  <button type="button" className="pe-icon-btn" onClick={() => moveProduct(p.id, -1)} aria-label="Move up" title="Move up">↑</button>
                  <button type="button" className="pe-icon-btn" onClick={() => moveProduct(p.id, 1)} aria-label="Move down" title="Move down">↓</button>
                </div>
                {isAir ? (
                  <input className="pe-chprod__interlude" value={p.interlude} onChange={(e) => editInterlude(p.id, e.target.value)} onBlur={(e) => saveInterlude(p.id, e.target.value)} placeholder={`Interlude — the quote after this card, e.g. “The morning arrives quietly.”`} />
                ) : (
                  <input className="pe-chprod__interlude" type="number" min={0} value={p.chapterFromPrice} onChange={(e) => editChapterFromPrice(p.id, e.target.value)} onBlur={(e) => saveChapterFromPrice(p.id, e.target.value)} placeholder={`“From” price for the card — e.g. 580 (the 100g price); blank uses the product price`} />
                )}
              </div>
            );
          }) : <p className="admin__muted">No products assigned. Assign products to this chapter from the product editor (Collection &amp; chapter).</p>}
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
        <LivePreviewPanel
          src={isAirChapter ? "/chapter-preview" : "/candle-chapter-preview"}
          draft={isAirChapter ? draft : candleDraft}
          focusId={focusId}
          onRefresh={load}
        />
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
