"use client";

import { useEffect, useMemo, useRef, useState, type FocusEvent, type TextareaHTMLAttributes } from "react";
import type { VariantRow, NoteRow, ImageRow, VesselType, ProductStatus } from "@/services/productAdminService";
import { AirPdpLivePreview } from "@/components/admin/AirPdpLivePreview";
import { AIR_ACCORDION_DEFAULTS, type CustomSection } from "@/config/theHours";

/** A textarea that grows to fit its content, so long editorial text (the Hour story, etc.) is fully
 *  visible while editing instead of scrolling inside a fixed box. */
function AutoTextarea({ value, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; }
  }, [value]);
  return <textarea ref={ref} value={value} {...rest} />;
}

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
  artistEnabled: boolean; artistName: string; artistRole: string; artistStory: string; artistQuote: string; artistImage: string;
  // Air PDP content (room / linen fresheners) — flat in the form, assembled to JSON on save.
  airTime: string; airMoment: string; airHourReason: string; airHourStory: string; airScentEffect: string;
  airScent: string; airFeels: string; airExperience: string; airPlacement: string; airSignature: string; airComposition: string;
  airPalette: string; airGradient: string; airInterlude: string;
  airCustomSurface: string; airCustomInk: string; // when airPalette === "custom"
  airGradFrom: string; airGradTo: string; airGradAngle: string; // when airGradient === "custom"
  airAccordion: { title: string; body: string }[]; // details accordion rows
  airCustomSections: CustomSection[]; // admin-added extra sections
  airHourEyebrow: string; airFragranceEyebrow: string; airFeelsEyebrow: string; airExperienceEyebrow: string;
  airPlacementEyebrow: string; airPlacementHeading: string; airContinueEyebrow: string; airContinueHeading: string;
};

const AIR_TYPES = ["room_spray", "linen_spray"];
const AIR_PALETTES = ["morning-blue", "amber-hour", "sand", "deep-indigo", "monsoon"]; // section theme (page colour)
const AIR_GRADIENTS = ["gradient:grad-air", "gradient:grad-chai", "gradient:grad-amethyst", "gradient:grad-blush"]; // hero block
// Placement is edited as "label | note" per line.
const placementToText = (arr: { label?: string; note?: string }[]) => (Array.isArray(arr) ? arr.map((p) => `${p.label ?? ""}${p.note ? ` | ${p.note}` : ""}`).join("\n") : "");
const textToPlacement = (t: string) => t.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [label, note] = l.split("|").map((s) => s.trim()); return { label: label ?? "", note: note ?? "" }; });
const linesToArr = (t: string) => t.split("\n").map((s) => s.trim()).filter(Boolean);
// WCAG-ish contrast ratio between two hex colours — a readability hint for custom palettes.
const rgbOf = (h: string): [number, number, number] => { const m = h.replace("#", ""); const s = m.length === 3 ? m.split("").map((c) => c + c).join("") : m.slice(0, 6); const n = parseInt(s, 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lum = (rgb: [number, number, number]) => { const a = rgb.map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };
const contrastRatio = (h1: string, h2: string) => { const l1 = lum(rgbOf(h1)), l2 = lum(rgbOf(h2)); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };

// Assemble the air_content JSON from the flat form fields — used by BOTH save and the live preview
// draft, so what you preview is exactly what saves.
function assembleAirContent(core: Core) {
  return {
    time: core.airTime, moment: core.airMoment, hourReason: core.airHourReason, hourStory: core.airHourStory, scentEffect: core.airScentEffect,
    scent: core.airScent.split(",").map((s) => s.trim()).filter(Boolean), feels: linesToArr(core.airFeels), experience: core.airExperience,
    placement: textToPlacement(core.airPlacement), signature: core.airSignature, composition: core.airComposition,
    heroLine: core.tagline, // hero line mirrors the product tagline (single source)
    palette: core.airPalette && core.airPalette !== "custom" ? core.airPalette : undefined,
    gradient: core.airGradient && core.airGradient !== "custom" ? core.airGradient : undefined,
    interlude: core.airInterlude || undefined,
    customPalette: core.airPalette === "custom" ? { surface: core.airCustomSurface, ink: core.airCustomInk } : undefined,
    customGradient: core.airGradient === "custom" ? { from: core.airGradFrom, to: core.airGradTo, angle: Number(core.airGradAngle) || 135 } : undefined,
    accordion: core.airAccordion.map((r) => ({ title: r.title.trim(), body: r.body.trim() })).filter((r) => r.title || r.body),
    customSections: core.airCustomSections.map((s) => ({
      type: s.type,
      eyebrow: (s.eyebrow ?? "").trim() || undefined, heading: (s.heading ?? "").trim() || undefined, body: (s.body ?? "").trim() || undefined,
      lines: (s.lines ?? []).map((l) => l.trim()).filter(Boolean),
      items: (s.items ?? []).map((x) => ({ label: (x.label ?? "").trim(), note: (x.note ?? "").trim() })).filter((x) => x.label || x.note),
    })).filter((s) => s.body || s.lines.length || s.items.length),
    labels: {
      hourEyebrow: core.airHourEyebrow || undefined, fragranceEyebrow: core.airFragranceEyebrow || undefined, feelsEyebrow: core.airFeelsEyebrow || undefined, experienceEyebrow: core.airExperienceEyebrow || undefined,
      placementEyebrow: core.airPlacementEyebrow || undefined, placementHeading: core.airPlacementHeading || undefined, continueEyebrow: core.airContinueEyebrow || undefined, continueHeading: core.airContinueHeading || undefined,
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const bv = (v: any) => Boolean(v);
const sv = (v: unknown) => (v == null ? "" : String(v));

export function ProductEditor({ productId, collections, categories, onClose, onSaved }: {
  productId: string; collections: { id: string; name: string; volume: string | null; slug?: string }[]; categories: { id: string; name: string }[]; onClose: () => void; onSaved: () => void;
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
      artistEnabled: bv(p.artist_enabled), artistName: sv(p.artist_name), artistRole: sv(p.artist_role), artistStory: sv(p.artist_story), artistQuote: sv(p.artist_quote), artistImage: sv(p.artist_image),
      ...((): Pick<Core,
        "airTime" | "airMoment" | "airHourReason" | "airHourStory" | "airScentEffect" | "airScent" | "airFeels" | "airExperience" | "airPlacement" | "airSignature" | "airComposition" |
        "airPalette" | "airGradient" | "airInterlude" | "airCustomSurface" | "airCustomInk" | "airGradFrom" | "airGradTo" | "airGradAngle" | "airAccordion" | "airCustomSections" |
        "airHourEyebrow" | "airFragranceEyebrow" | "airFeelsEyebrow" | "airExperienceEyebrow" | "airPlacementEyebrow" | "airPlacementHeading" | "airContinueEyebrow" | "airContinueHeading"> => {
        const ac = (p.air_content ?? {}) as Record<string, unknown>;
        const lb = (ac.labels ?? {}) as Record<string, unknown>;
        return {
          airTime: sv(ac.time), airMoment: sv(ac.moment), airHourReason: sv(ac.hourReason), airHourStory: sv(ac.hourStory), airScentEffect: sv(ac.scentEffect),
          airScent: Array.isArray(ac.scent) ? (ac.scent as string[]).join(", ") : "", airFeels: Array.isArray(ac.feels) ? (ac.feels as string[]).join("\n") : "",
          airExperience: sv(ac.experience), airPlacement: placementToText((ac.placement as { label?: string; note?: string }[]) ?? []), airSignature: sv(ac.signature), airComposition: sv(ac.composition),
          airPalette: ac.customPalette ? "custom" : sv(ac.palette), airGradient: ac.customGradient ? "custom" : sv(ac.gradient), airInterlude: sv(ac.interlude),
          airCustomSurface: sv((ac.customPalette as { surface?: string })?.surface) || "#14213a", airCustomInk: sv((ac.customPalette as { ink?: string })?.ink) || "#f5f2ed",
          airGradFrom: sv((ac.customGradient as { from?: string })?.from) || "#6a4090", airGradTo: sv((ac.customGradient as { to?: string })?.to) || "#0a0020", airGradAngle: (ac.customGradient as { angle?: number })?.angle != null ? String((ac.customGradient as { angle?: number }).angle) : "135",
          airAccordion: (() => {
            const rows = Array.isArray(ac.accordion) ? (ac.accordion as { title?: string; body?: string }[]).map((r) => ({ title: sv(r.title), body: sv(r.body) })) : [];
            // No real rows yet → pre-fill the house defaults so Composition / Shipping are editable from the start.
            return rows.some((r) => r.title.trim() || r.body.trim()) ? rows : AIR_ACCORDION_DEFAULTS.map((r) => ({ ...r }));
          })(),
          airCustomSections: Array.isArray(ac.customSections) ? (ac.customSections as CustomSection[]).map((s) => ({
            type: s.type ?? "statement", eyebrow: sv(s.eyebrow), heading: sv(s.heading), body: sv(s.body),
            lines: Array.isArray(s.lines) ? s.lines.map((l) => sv(l)) : [], items: Array.isArray(s.items) ? s.items.map((x) => ({ label: sv(x.label), note: sv(x.note) })) : [],
          })) : [],
          airHourEyebrow: sv(lb.hourEyebrow), airFragranceEyebrow: sv(lb.fragranceEyebrow), airFeelsEyebrow: sv(lb.feelsEyebrow), airExperienceEyebrow: sv(lb.experienceEyebrow),
          airPlacementEyebrow: sv(lb.placementEyebrow), airPlacementHeading: sv(lb.placementHeading), airContinueEyebrow: sv(lb.continueEyebrow), airContinueHeading: sv(lb.continueHeading),
        };
      })(),
    });
    setVariants(d.variants ?? []); setNotes(d.notes ?? []); setImages(d.images ?? []);
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const [previewOn, setPreviewOn] = useState(true);
  const [focusId, setFocusId] = useState<string | null>(null);
  // Other air products in this chapter — fed to the preview so its "Continue" section renders (it fills
  // automatically from the chapter; nothing to set).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [siblings, setSiblings] = useState<any[]>([]);

  // The live preview draft — a product-row shaped object built from the current (unsaved) form, so the
  // /pdp-preview iframe can render the REAL AirProductDetail from it. Rebuilt on every edit.
  const draft = useMemo(() => {
    if (!core) return null;
    const col = collections.find((c) => c.id === core.collectionId);
    return {
      id: productId, name: core.name, slug: core.slug, tagline: core.tagline,
      price: core.price, product_type: core.productType, chapter_position: core.chapterPosition,
      air_content: assembleAirContent(core),
      product_images: [...images].sort((a, b) => a.sortOrder - b.sortOrder).map((im) => ({ url: im.url, is_primary: im.isPrimary, sort_order: im.sortOrder })),
      collection: col ? { id: col.id, name: col.name, slug: col.slug ?? "", volume: col.volume, tagline: "", cover_image_url: "", is_coming_soon: false } : {},
      __siblings: siblings,
    };
  }, [core, images, collections, productId, siblings]);

  // Load the chapter's other air products (the preview's "Continue" section fills automatically).
  useEffect(() => {
    const air = core && AIR_TYPES.includes(core.productType);
    if (!air || !core?.collectionId) { setSiblings([]); return; }
    let cancelled = false;
    fetch("/api/admin/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "air.siblings", collectionId: core.collectionId, excludeId: productId }) })
      .then((r) => r.json()).then((d) => { if (!cancelled && Array.isArray(d?.siblings)) setSiblings(d.siblings); }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [core?.productType, core?.collectionId, productId]);

  const set = (patch: Partial<Core>) => setCore((c) => (c ? { ...c, ...patch } : c));
  const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

  // Details accordion — repeatable rows (functional updates so edits never use a stale core).
  const accUpdate = (i: number, patch: Partial<{ title: string; body: string }>) =>
    setCore((c) => (c ? { ...c, airAccordion: c.airAccordion.map((r, j) => (j === i ? { ...r, ...patch } : r)) } : c));
  const accAdd = () => setCore((c) => (c ? { ...c, airAccordion: [...c.airAccordion, { title: "", body: "" }] } : c));
  const accRemove = (i: number) => setCore((c) => (c ? { ...c, airAccordion: c.airAccordion.filter((_, j) => j !== i) } : c));
  const accMove = (i: number, dir: -1 | 1) =>
    setCore((c) => {
      if (!c) return c;
      const rows = [...c.airAccordion];
      const j = i + dir;
      if (j < 0 || j >= rows.length) return c;
      [rows[i], rows[j]] = [rows[j], rows[i]];
      return { ...c, airAccordion: rows };
    });

  // Custom sections — same repeatable-row pattern (functional updates avoid stale state).
  const csUpdate = (i: number, patch: Partial<CustomSection>) =>
    setCore((c) => (c ? { ...c, airCustomSections: c.airCustomSections.map((s, j) => (j === i ? { ...s, ...patch } : s)) } : c));
  const csAdd = () => setCore((c) => (c ? { ...c, airCustomSections: [...c.airCustomSections, { type: "statement", eyebrow: "", heading: "", body: "", lines: [], items: [] }] } : c));
  const csRemove = (i: number) => setCore((c) => (c ? { ...c, airCustomSections: c.airCustomSections.filter((_, j) => j !== i) } : c));
  const csMove = (i: number, dir: -1 | 1) =>
    setCore((c) => {
      if (!c) return c;
      const rows = [...c.airCustomSections];
      const j = i + dir;
      if (j < 0 || j >= rows.length) return c;
      [rows[i], rows[j]] = [rows[j], rows[i]];
      return { ...c, airCustomSections: rows };
    });

  const saveCore = async () => {
    if (!core) return;
    const isAir = AIR_TYPES.includes(core.productType);
    const airContent = isAir ? assembleAirContent(core) : undefined;
    const product = {
      ...core, salePrice: numOrNull(core.salePrice), weightGrams: numOrNull(core.weightGrams),
      moodTags: core.moodTags.split(",").map((t) => t.trim()).filter(Boolean),
      collectionId: core.collectionId || null, displayOrder: Number(core.displayOrder || 0), publishAt: core.publishAt || null,
      ...(airContent ? { airContent } : {}),
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
  const uploadImage = async (file: File) => {
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      const alt = imgAlt.trim() || core?.name || "";
      fd.append("file", file); fd.append("folder", "products"); if (alt) fd.append("alt", alt);
      const res = await fetch("/api/admin/media", { method: "POST", body: fd });
      const d = await res.json(); setBusy(false);
      if (!res.ok || !d.url) { setErr(d.error ?? d.reason ?? "Upload failed"); return; }
      if (await post({ action: "image.add", productId, url: d.url, altText: alt })) { setImgAlt(""); await load(); onSaved(); }
    } catch (e) { setBusy(false); setErr(e instanceof Error ? e.message : "Upload failed"); }
  };
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

  const isAir = AIR_TYPES.includes(core.productType);
  const showPreview = isAir && previewOn;
  const onFieldFocus = (e: FocusEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement).closest?.("[data-anchor]")?.getAttribute("data-anchor");
    if (anchor) setFocusId(anchor);
  };
  const formCol = (
    <div className={`om-modal__card om-modal__card--wide${showPreview ? " pe-live__card" : ""}`} onClick={(e) => e.stopPropagation()} onFocusCapture={onFieldFocus}>
      <div className="pe-live__cardhead">
        <h2 className="om-modal__title">Edit {core.name}</h2>
        {isAir ? <button type="button" className="ff-btn ff-btn--mini" onClick={() => setPreviewOn((v) => !v)}>{previewOn ? "Hide live preview" : "Live preview"}</button> : null}
      </div>

        <details className="pe-sec" open data-anchor="pdp-top">
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
          <summary>Artist ({core.artistEnabled ? "custom" : "house default"})</summary>
          <label className="om-check" style={{ marginBottom: 8 }}><input type="checkbox" checked={core.artistEnabled} onChange={(e) => set({ artistEnabled: e.target.checked })} /><span>Use a custom artist for this product (otherwise the house artist shows)</span></label>
          <div className="cfg-grid">
            <label className="cfg-field"><span>Artist name</span><input value={core.artistName} onChange={(e) => set({ artistName: e.target.value })} placeholder="The Samorah Artist" disabled={!core.artistEnabled} /></label>
            <label className="cfg-field"><span>Artist role</span><input value={core.artistRole} onChange={(e) => set({ artistRole: e.target.value })} placeholder="Painter · Colourist" disabled={!core.artistEnabled} /></label>
            <label className="cfg-field"><span>Artist image URL</span><input value={core.artistImage} onChange={(e) => set({ artistImage: e.target.value })} disabled={!core.artistEnabled} /></label>
          </div>
          <label className="cfg-field"><span>Artist story <em className="om-field__hint">one paragraph per line</em></span><textarea value={core.artistStory} onChange={(e) => set({ artistStory: e.target.value })} rows={4} disabled={!core.artistEnabled} /></label>
          <label className="cfg-field"><span>Artist quote</span><input value={core.artistQuote} onChange={(e) => set({ artistQuote: e.target.value })} placeholder="Every colour begins with a feeling." disabled={!core.artistEnabled} /></label>
        </details>

        {AIR_TYPES.includes(core.productType) ? (
          <details className="pe-sec" open>
            <summary>Air PDP content (room / linen freshener)</summary>
            <p className="om-field__hint" style={{ margin: "0 0 8px" }}>Room &amp; linen fresheners use the air PDP — The Hour, Fragrance Journey (Opening / Heart / Lingering), Feels Like, The Experience, Placement, Signature. Fill these; they render on the storefront.</p>
            <div className="cfg-grid" data-anchor="pdp-top">
              <label className="cfg-field" data-anchor="the-hour"><span>Hour (time)</span><input value={core.airTime} onChange={(e) => set({ airTime: e.target.value })} placeholder="18:40" /></label>
              <label className="cfg-field" data-anchor="pdp-top"><span>Moment</span><input value={core.airMoment} onChange={(e) => set({ airMoment: e.target.value })} placeholder="The Day Loosens" /></label>
            </div>
            <p className="om-field__hint" style={{ margin: "0 0 8px" }}>The hero line under the name is the <b>Tagline</b> field in “Basic &amp; SEO” above.</p>
            <label className="cfg-field" data-anchor="the-hour"><span>The Hour — reason (short)</span><input value={core.airHourReason} onChange={(e) => set({ airHourReason: e.target.value })} placeholder="The hour the day finally forgets to hurry." /></label>
            <label className="cfg-field" data-anchor="the-hour"><span>The Hour — story <em className="om-field__hint">a blank line starts a new paragraph; each renders in the same editorial style, and the section grows to fit — it won't break the layout</em></span><AutoTextarea value={core.airHourStory} onChange={(e) => set({ airHourStory: e.target.value })} rows={3} /></label>
            <label className="cfg-field" data-anchor="smells-like"><span>Fragrance journey — effect (intro)</span><input value={core.airScentEffect} onChange={(e) => set({ airScentEffect: e.target.value })} placeholder="Soft. Comforting. Slightly indulgent…" /></label>
            <label className="cfg-field" data-anchor="smells-like"><span>Scent — Opening · Heart · Lingering <em className="om-field__hint">comma-separated (3)</em></span><input value={core.airScent} onChange={(e) => set({ airScent: e.target.value })} placeholder="Ripe Fig Flesh, Brown Sugar Warmth, Soft Amber &amp; Sandalwood" /></label>
            <label className="cfg-field" data-anchor="feels-like"><span>Feels like <em className="om-field__hint">one line each</em></span><AutoTextarea value={core.airFeels} onChange={(e) => set({ airFeels: e.target.value })} rows={2} /></label>
            <label className="cfg-field" data-anchor="experience"><span>The Experience</span><AutoTextarea value={core.airExperience} onChange={(e) => set({ airExperience: e.target.value })} rows={2} /></label>
            <label className="cfg-field" data-anchor="placement"><span>Placement <em className="om-field__hint">one per line — "label | note"</em></span><AutoTextarea value={core.airPlacement} onChange={(e) => set({ airPlacement: e.target.value })} rows={2} placeholder="Evenings with no plans&#10;Post-work silence" /></label>
            <label className="cfg-field" data-anchor="signature"><span>Signature line</span><input value={core.airSignature} onChange={(e) => set({ airSignature: e.target.value })} placeholder="Best experienced when you stop trying to be productive." /></label>

            <p className="om-field__hint" style={{ margin: "12px 0 6px", fontWeight: 600 }}>Section colours</p>
            <div className="cfg-grid" data-anchor="pdp-top">
              <label className="cfg-field"><span>Section palette <em className="om-field__hint">the page colour</em></span>
                <select value={core.airPalette} onChange={(e) => set({ airPalette: e.target.value })}>
                  <option value="">Default (monsoon — light)</option>
                  {AIR_PALETTES.map((p) => <option key={p} value={p}>{p}</option>)}
                  <option value="custom">Custom…</option>
                </select>
              </label>
              <label className="cfg-field"><span>Hero gradient <em className="om-field__hint">the image block</em></span>
                <select value={core.airGradient} onChange={(e) => set({ airGradient: e.target.value })}>
                  <option value="">Default (grad-air)</option>
                  {AIR_GRADIENTS.map((g) => <option key={g} value={g}>{g.replace("gradient:", "")}</option>)}
                  <option value="custom">Custom…</option>
                </select>
              </label>
              <label className="cfg-field"><span>Interlude <em className="om-field__hint">line to the next hour</em></span><input value={core.airInterlude} onChange={(e) => set({ airInterlude: e.target.value })} placeholder="The morning arrives quietly." /></label>
            </div>
            {core.airPalette === "custom" ? (
              <div className="cfg-grid" data-anchor="pdp-top">
                <label className="cfg-field"><span>Section background</span><input type="color" value={core.airCustomSurface} onChange={(e) => set({ airCustomSurface: e.target.value })} /></label>
                <label className="cfg-field"><span>Section text</span><input type="color" value={core.airCustomInk} onChange={(e) => set({ airCustomInk: e.target.value })} /></label>
                <div className="cfg-field"><span>Readability</span><span style={{ fontSize: 13, color: contrastRatio(core.airCustomSurface, core.airCustomInk) >= 4.5 ? "#2e7d4f" : "#b4534b" }}>{contrastRatio(core.airCustomSurface, core.airCustomInk) >= 4.5 ? "Good contrast ✓" : "Low contrast — hard to read"}</span></div>
              </div>
            ) : null}
            {core.airGradient === "custom" ? (
              <div className="cfg-grid" data-anchor="pdp-top">
                <label className="cfg-field"><span>Gradient from</span><input type="color" value={core.airGradFrom} onChange={(e) => set({ airGradFrom: e.target.value })} /></label>
                <label className="cfg-field"><span>Gradient to</span><input type="color" value={core.airGradTo} onChange={(e) => set({ airGradTo: e.target.value })} /></label>
                <label className="cfg-field"><span>Angle°</span><input type="number" value={core.airGradAngle} onChange={(e) => set({ airGradAngle: e.target.value })} placeholder="135" /></label>
              </div>
            ) : null}

            <p className="om-field__hint" style={{ margin: "12px 0 6px", fontWeight: 600 }}>Details accordion</p>
            <p className="om-field__hint" style={{ margin: "0 0 8px" }}>The collapsible rows at the bottom of the PDP (Composition, Shipping, How to use…). Add, edit, reorder or remove freely.</p>
            <div data-anchor="details">
              {core.airAccordion.map((row, i) => (
                <div key={i} className="pe-acc">
                  <div className="pe-acc__head">
                    <input className="pe-acc__title" value={row.title} onChange={(e) => accUpdate(i, { title: e.target.value })} placeholder="Title — e.g. Composition" />
                    <span className="pe-acc__act">
                      <button type="button" className="ff-btn ff-btn--mini" onClick={() => accMove(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                      <button type="button" className="ff-btn ff-btn--mini" onClick={() => accMove(i, 1)} disabled={i === core.airAccordion.length - 1} aria-label="Move down">↓</button>
                      <button type="button" className="ff-btn ff-btn--mini ff-btn--danger" onClick={() => accRemove(i)} aria-label="Remove row">×</button>
                    </span>
                  </div>
                  <AutoTextarea className="pe-acc__body" value={row.body} onChange={(e) => accUpdate(i, { body: e.target.value })} rows={2} placeholder="Body — the text shown when this row is expanded." />
                </div>
              ))}
              <button type="button" className="ff-btn ff-btn--mini" onClick={accAdd}>+ Add row</button>
            </div>

            <details className="pe-sec" style={{ marginTop: 12 }}>
              <summary>Section titles (optional — rename the labels on the page)</summary>
              <p className="om-field__hint" style={{ margin: "0 0 8px" }}>These rename the small labels above each PDP section (e.g. the “Fragrance Journey” or “Where it belongs” headings). Type to rename one; leave it blank to keep the default wording — that grey text is the placeholder, not a saved value. Example: change “Fragrance Journey” to “The Scent”.</p>
              <div className="cfg-grid">
                <label className="cfg-field"><span>The Hour — eyebrow</span><input value={core.airHourEyebrow} onChange={(e) => set({ airHourEyebrow: e.target.value })} placeholder="The Hour" /></label>
                <label className="cfg-field"><span>Fragrance Journey — eyebrow</span><input value={core.airFragranceEyebrow} onChange={(e) => set({ airFragranceEyebrow: e.target.value })} placeholder="Fragrance Journey" /></label>
                <label className="cfg-field"><span>Feels Like — eyebrow</span><input value={core.airFeelsEyebrow} onChange={(e) => set({ airFeelsEyebrow: e.target.value })} placeholder="Feels Like" /></label>
                <label className="cfg-field"><span>The Experience — eyebrow</span><input value={core.airExperienceEyebrow} onChange={(e) => set({ airExperienceEyebrow: e.target.value })} placeholder="The Experience" /></label>
                <label className="cfg-field"><span>Placement — eyebrow</span><input value={core.airPlacementEyebrow} onChange={(e) => set({ airPlacementEyebrow: e.target.value })} placeholder="Placement" /></label>
                <label className="cfg-field"><span>Placement — heading</span><input value={core.airPlacementHeading} onChange={(e) => set({ airPlacementHeading: e.target.value })} placeholder="Where it belongs" /></label>
                <label className="cfg-field"><span>Continue — eyebrow</span><input value={core.airContinueEyebrow} onChange={(e) => set({ airContinueEyebrow: e.target.value })} placeholder="Continue" /></label>
                <label className="cfg-field"><span>Continue — heading</span><input value={core.airContinueHeading} onChange={(e) => set({ airContinueHeading: e.target.value })} placeholder="Continue The Everyday" /></label>
              </div>
            </details>

            <details className="pe-sec" style={{ marginTop: 12 }} data-anchor="pdp-top">
              <summary>Custom sections ({core.airCustomSections.length}) — add your own</summary>
              <p className="om-field__hint" style={{ margin: "0 0 8px" }}>Add extra sections built from the same blocks as the rest of the page, so the styling is automatic and the layout never breaks. They render after Signature, before the Details accordion.</p>
              {core.airCustomSections.map((sec, i) => (
                <div key={i} className="pe-acc">
                  <div className="pe-acc__head">
                    <span className="pe-acc__num">{i + 1}</span>
                    <select className="pe-acc__title" value={sec.type} onChange={(e) => csUpdate(i, { type: e.target.value as CustomSection["type"] })}>
                      <option value="statement">Statement — heading + paragraphs</option>
                      <option value="lines">Lines — verse (one line each)</option>
                      <option value="grid">Grid — label + note tiles</option>
                      <option value="quote">Quote — a single line</option>
                    </select>
                    <span className="pe-acc__act">
                      <button type="button" className="ff-btn ff-btn--mini" onClick={() => csMove(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                      <button type="button" className="ff-btn ff-btn--mini" onClick={() => csMove(i, 1)} disabled={i === core.airCustomSections.length - 1} aria-label="Move down">↓</button>
                      <button type="button" className="ff-btn ff-btn--mini ff-btn--danger" onClick={() => csRemove(i)} aria-label="Remove section">×</button>
                    </span>
                  </div>
                  {sec.type !== "quote" ? <input value={sec.eyebrow ?? ""} onChange={(e) => csUpdate(i, { eyebrow: e.target.value })} placeholder="Eyebrow — e.g. The Ritual" /> : null}
                  {sec.type === "statement" || sec.type === "grid" ? <input value={sec.heading ?? ""} onChange={(e) => csUpdate(i, { heading: e.target.value })} placeholder="Heading" /> : null}
                  {sec.type === "statement" ? <AutoTextarea className="pe-acc__body" value={sec.body ?? ""} onChange={(e) => csUpdate(i, { body: e.target.value })} rows={2} placeholder="Paragraphs — leave a blank line between each." /> : null}
                  {sec.type === "quote" ? <AutoTextarea className="pe-acc__body" value={sec.body ?? ""} onChange={(e) => csUpdate(i, { body: e.target.value })} rows={2} placeholder="The quote." /> : null}
                  {sec.type === "lines" ? <AutoTextarea className="pe-acc__body" value={(sec.lines ?? []).join("\n")} onChange={(e) => csUpdate(i, { lines: e.target.value.split("\n") })} rows={3} placeholder={"One line each\nlike a little verse"} /> : null}
                  {sec.type === "grid" ? <AutoTextarea className="pe-acc__body" value={placementToText(sec.items ?? [])} onChange={(e) => csUpdate(i, { items: textToPlacement(e.target.value) })} rows={3} placeholder={"label | note   (one per line)\nBedside | before sleep"} /> : null}
                </div>
              ))}
              <button type="button" className="ff-btn ff-btn--mini" onClick={csAdd}>+ Add section</button>
            </details>
          </details>
        ) : null}

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
            <input value={imgAlt} onChange={(e) => setImgAlt(e.target.value)} placeholder="Alt text (applies to the next image)" />
            <label className={`ff-btn ff-btn--primary${busy ? " is-disabled" : ""}`} style={{ cursor: busy ? "default" : "pointer" }}>
              {busy ? "Uploading…" : "⬆ Upload image"}
              <input type="file" accept="image/*" style={{ display: "none" }} disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadImage(f); e.target.value = ""; }} />
            </label>
          </div>
          <div className="pe-imgadd">
            <input value={imgUrl} onChange={(e) => setImgUrl(e.target.value)} placeholder="…or paste an image URL" />
            <button type="button" className="ff-btn" disabled={busy || !imgUrl.trim()} onClick={addImage}>Add by URL</button>
          </div>
        </details>

        <details className="pe-sec">
          <summary>Variants ({variants.length})</summary>
          <p className="om-field__hint" style={{ margin: "0 0 8px" }}>Size / Volume holds the unit label — e.g. <b>100g</b> for candles, <b>100ml</b> for room / linen fresheners. Barcode, weight, and low-stock alert are per variant.</p>
          {variants.map((v, i) => (
            <div key={v.id || `new${i}`} className="pe-variant">
              <div className="pe-variant__top">
                <span className={`pe-variant__badge${v.isActive ? " is-on" : ""}`}>{v.isActive ? "Active" : "Inactive"}</span>
                <span className="pe-variant__title">{v.sizeLabel || v.sku || `Variant ${i + 1}`}</span>
                <span className="pe-variant__act">
                  <button type="button" className="ff-btn ff-btn--mini" onClick={() => setV(i, { isActive: !v.isActive })}>{v.isActive ? "Deactivate" : "Activate"}</button>
                  <button type="button" className="ff-btn ff-btn--mini" disabled={busy} onClick={() => saveVariant(v)}>Save</button>
                  {v.id ? <button type="button" className="ff-btn ff-btn--mini ff-btn--danger" disabled={busy} onClick={() => delVariant(v)}>Delete</button> : null}
                </span>
              </div>
              <div className="pe-variant__grid">
                <label className="cfg-field cfg-field--sm"><span>SKU</span><input value={v.sku} onChange={(e) => setV(i, { sku: e.target.value })} placeholder="SAM-LNN-100" /></label>
                <label className="cfg-field cfg-field--sm"><span>Size / Volume</span><input value={v.sizeLabel ?? ""} onChange={(e) => setV(i, { sizeLabel: e.target.value })} placeholder="100ml" /></label>
                <label className="cfg-field cfg-field--sm"><span>Vessel</span><select value={v.vesselType ?? ""} onChange={(e) => setV(i, { vesselType: (e.target.value || null) as VesselType | null })}><option value="">—</option>{VESSELS.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
                <label className="cfg-field cfg-field--sm"><span>Price ₹</span><input type="number" value={v.price} onChange={(e) => setV(i, { price: Number(e.target.value) })} /></label>
                <label className="cfg-field cfg-field--sm"><span>Cost ₹</span><input type="number" value={v.costPrice} onChange={(e) => setV(i, { costPrice: Number(e.target.value) })} /></label>
                <label className="cfg-field cfg-field--sm"><span>Stock</span><input type="number" value={v.stock} onChange={(e) => setV(i, { stock: Number(e.target.value) })} /></label>
                <label className="cfg-field cfg-field--sm"><span>Barcode / EAN</span><input value={v.barcode ?? ""} onChange={(e) => setV(i, { barcode: e.target.value })} /></label>
                <label className="cfg-field cfg-field--sm"><span>Weight (g)</span><input type="number" value={v.weightGrams ?? ""} onChange={(e) => setV(i, { weightGrams: e.target.value === "" ? null : Number(e.target.value) })} /></label>
                <label className="cfg-field cfg-field--sm"><span>Low-stock alert</span><input type="number" value={v.lowStockThreshold ?? ""} onChange={(e) => setV(i, { lowStockThreshold: e.target.value === "" ? null : Number(e.target.value) })} /></label>
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
  );

  if (showPreview) {
    return (
      <div className="pe-live" role="dialog" aria-modal="true">
        <div className="pe-live__form">{formCol}</div>
        <AirPdpLivePreview draft={draft} focusId={focusId} onRefresh={load} />
      </div>
    );
  }
  return (
    <div className="om-modal" role="dialog" aria-modal="true" onClick={() => !busy && onClose()}>
      {formCol}
    </div>
  );
}
