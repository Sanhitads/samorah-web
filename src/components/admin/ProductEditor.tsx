"use client";

import { useEffect, useMemo, useRef, useState, type FocusEvent, type TextareaHTMLAttributes } from "react";
import type { VariantRow, NoteRow, ImageRow, VesselType, ProductStatus } from "@/services/productAdminService";
import { LivePreviewPanel } from "@/components/admin/LivePreviewPanel";
import { AIR_ACCORDION_DEFAULTS, AIR_SECTION_POSITIONS, type CustomSection } from "@/config/theHours";
import { CANDLE_SECTION_POSITIONS } from "@/lib/productEditorial";

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

/** A single image field — URL input + Upload + a thumbnail preview (so uploads are visibly confirmed
 *  and each field is clearly its own image). Uploads use the `uploading` flag, NOT the Save busy flag. */
function ImgField({ value, onChange, onUpload, placeholder, disabled, uploading, onClear }: {
  value: string; onChange: (v: string) => void; onUpload: (f: File) => void; placeholder: string;
  disabled?: boolean; uploading?: boolean; onClear?: () => void;
}) {
  const isImg = /^https?:\/\//i.test(value);
  return (
    <div className="pe-imgfield">
      {isImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" className="pe-imgfield__thumb" />
      ) : (
        <span className="pe-imgfield__thumb pe-imgfield__thumb--empty" aria-hidden="true">{value ? "◧" : "—"}</span>
      )}
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} />
      <label className={`ff-btn${disabled || uploading ? " is-disabled" : ""}`} style={{ cursor: disabled || uploading ? "default" : "pointer" }}>
        {uploading ? "Uploading…" : "⬆ Upload"}
        <input type="file" accept="image/*" style={{ display: "none" }} disabled={disabled || uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ""; }} />
      </label>
      {value && onClear ? <button type="button" className="ff-btn ff-btn--mini" onClick={onClear}>Clear</button> : null}
    </div>
  );
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
  // Candle PDP CMS extras (room/linen use air fields above; candles use these) — assembled to pdp_content.
  cPalette: string; cCustomSurface: string; cCustomInk: string; cCustomAccent: string; // "" = chapter default, token, or "custom"; accent recolours numbering
  cGradient: string; cGradFrom: string; cGradTo: string; cGradAngle: string; // "" = none, or "custom"
  cAccordion: { title: string; body: string }[]; // overrides the Details accordion
  cCustomSections: CustomSection[]; // admin-added extra sections (move anywhere)
  cStoryEyebrow: string; cJourneyEyebrow: string; cJourneyHeading: string; cJourneyIntro: string;
  cMoodEyebrow: string; cMoodHeading: string; cCraftEyebrow: string; cCraftHeading: string; cArtistEyebrow: string;
  cLifestyleEyebrow: string; cLifestyleHeading: string; cTestimonialsEyebrow: string; cTestimonialsHeading: string;
  cMemoryLine: string; cContinueEyebrow: string;
  cStoryImage: string; cLifestyleImage: string; cArtworkImage: string; // section-specific images
  cTestimonials: { quote: string; attribution: string }[]; // In their words — per-product
  cTestimonialInterval: string; // crossfade seconds
  cEdition: string; // hero edition override "NO. I.1"
  cCollectionType: string; // "Core Collection" | "Limited Collection" | "Seasonal Collection" | "Archive"
  cBurnTimes: Record<string, string>; // size label -> burn time
  cLifestyleMoments: string; // one moment per line (else derived)
  cCraft: { label: string; value: string; note: string }[]; // "Made by hand" tiles (else house set)
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
      type: s.type, position: s.position ?? "after-signature",
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

// Candle PDP palette presets (registered theme tokens) — the chapter default applies when blank.
const CANDLE_PALETTES = ["warm-ivory", "clay", "forest", "dark-library", "sage"];
const CANDLE_COLLECTION_TYPES = ["Core Collection", "Limited Collection", "Seasonal Collection", "Archive"];
// The house artist — used to pre-fill the fields when an admin switches a candle to a custom artist,
// so editing starts from what's already shown (not a blank section).
const HOUSE_ARTIST = {
  name: "The Samorah Artist",
  role: "Painter · Colourist",
  story: [
    "The artwork across every Samorah collection is created by a special artist whose creativity flows through colour and imagination.",
    "He experiences the world differently and communicates in ways beyond words — yet through painting, his expression is vivid, intuitive, and deeply emotional.",
    "Each illustration is hand-painted with focus, time and sincerity. No two pieces are ever identical; no design is digitally manufactured.",
    "By choosing Samorah you encourage an artist's confidence, independence and creative journey. We are honoured to share his art with your home.",
  ].join("\n"),
  quote: "Every colour begins with a feeling.",
};
// Edition label from a volume + position — mirrors editionLabel() so the preview matches the live page.
const editionOf = (volume: string | null | undefined, n: number) => {
  const roman = volume ? volume.replace(/vol\.?\s*/i, "").trim().toUpperCase() : "";
  return roman ? `NO. ${roman}.${n}` : `NO. ${n}`;
};

// The house Details-accordion rows, so the editor can load them for editing (blank = the storefront
// keeps its own dynamic rows). Wax/Wick reflect the product where the admin has filled them.
const candleAccordionDefaults = (waxBlend: string, wick: string, vessels: string): { title: string; body: string }[] => [
  { title: "Candle Care & Safety", body: "Always burn within sight, and extinguish before leaving the room or sleeping. Trim the wick to ¼ inch before each use for a clean, even burn. Keep at least two feet from anything flammable, and away from drafts, fans, or open windows. Place on a stable, heat-resistant surface. Limit each session to four hours, and stop burning when ½ inch of wax remains. Never move a burning candle." },
  { title: "Wax & Wick Details", body: `${waxBlend || "A creamy coconut wax blend"} for a slow, clean, even burn. ${wick || "A lead-free cotton wick"}, trimmed for a steady, low-soot flame. Burn time scales with size — a longer, slower burn in the larger vessels.` },
  { title: "Ingredients & Materials", body: `Hand-poured with a premium coconut wax blend and a 100% natural, lead-free cotton wick. Premium-grade, phthalate-free fragrance and essential oils, IFRA-compliant. Free from parabens and sulfates, and never tested on animals. Poured into a reusable ${vessels || "ceramic or glass"} vessel.` },
  { title: "Shipping & Exchanges", body: "Carefully packed and dispatched within 1–3 business days (a little longer during festive periods). Complimentary standard shipping within India on qualifying orders; most orders arrive in 3–7 business days. Worldwide shipping via trusted couriers (duties/taxes at checkout). Due to the handcrafted nature of our candles we do not accept returns, but if your order arrives damaged or incorrect, write to us within 48 hours and we will make it right." },
  { title: "Sustainability & Reusability", body: "Cured for 10–14 days before shipping for a stronger, truer scent throw. Once the last of the wax is gone, the vessel can be cleaned and upcycled — a keepsake for flowers, brushes or small things. Made slowly, meant to last beyond the flame." },
];

// The house "Made by hand" tiles, so the editor can load them for editing (Hand Poured / Wax / Wick /
// Vessel). Wax & Wick reflect the product's own values where set.
const candleCraftDefaults = (waxBlend: string, wick: string, vessels: string): { label: string; value: string; note: string }[] => [
  { label: "Hand Poured", value: "In small batches", note: "Poured slowly, by hand — never mass-produced." },
  { label: "Wax Blend", value: waxBlend || "Natural coconut & soy blend", note: "Crafted for a slow, clean, even burn." },
  { label: "Cotton Wick", value: wick || "Lead-free cotton", note: "Trimmed for a steady, low-soot flame." },
  { label: "The Vessel", value: vessels || "ceramic · glass", note: "Reusable once the wax is gone — a keepsake, not waste." },
];

// Assemble the pdp_content JSON from the flat candle CMS fields — used by BOTH save and the live
// preview draft, so what you preview is exactly what saves. Every field is optional (blank → house
// default), so a candle with nothing set renders exactly as before.
function assembleCandleContent(core: Core) {
  const labels = {
    storyEyebrow: core.cStoryEyebrow || undefined,
    journeyEyebrow: core.cJourneyEyebrow || undefined, journeyHeading: core.cJourneyHeading || undefined, journeyIntro: core.cJourneyIntro || undefined,
    moodEyebrow: core.cMoodEyebrow || undefined, moodHeading: core.cMoodHeading || undefined,
    craftEyebrow: core.cCraftEyebrow || undefined, craftHeading: core.cCraftHeading || undefined,
    artistEyebrow: core.cArtistEyebrow || undefined,
    lifestyleEyebrow: core.cLifestyleEyebrow || undefined, lifestyleHeading: core.cLifestyleHeading || undefined,
    testimonialsEyebrow: core.cTestimonialsEyebrow || undefined, testimonialsHeading: core.cTestimonialsHeading || undefined,
    memoryLine: core.cMemoryLine || undefined, continueEyebrow: core.cContinueEyebrow || undefined,
  };
  const hasLabels = Object.values(labels).some(Boolean);
  const accordion = core.cAccordion.map((r) => ({ title: r.title.trim(), body: r.body.trim() })).filter((r) => r.title || r.body);
  const testimonials = core.cTestimonials.map((t) => ({ quote: t.quote.trim(), attribution: t.attribution.trim() })).filter((t) => t.quote);
  const customSections = core.cCustomSections.map((s) => ({
    type: s.type, position: s.position ?? "after-story",
    eyebrow: (s.eyebrow ?? "").trim() || undefined, heading: (s.heading ?? "").trim() || undefined, body: (s.body ?? "").trim() || undefined,
    lines: (s.lines ?? []).map((l) => l.trim()).filter(Boolean),
    items: (s.items ?? []).map((x) => ({ label: (x.label ?? "").trim(), note: (x.note ?? "").trim() })).filter((x) => x.label || x.note),
  })).filter((s) => s.body || s.lines.length || s.items.length);
  return {
    palette: core.cPalette && core.cPalette !== "custom" ? core.cPalette : undefined,
    customPalette: (() => {
      const pal: Record<string, string> = {};
      if (core.cPalette === "custom") { pal.surface = core.cCustomSurface; pal.ink = core.cCustomInk; }
      if (core.cCustomAccent) pal.accent = core.cCustomAccent;
      return Object.keys(pal).length ? pal : undefined;
    })(),
    customGradient: core.cGradient === "custom" ? { from: core.cGradFrom, to: core.cGradTo, angle: Number(core.cGradAngle) || 135 } : undefined,
    labels: hasLabels ? labels : undefined,
    accordion: accordion.length ? accordion : undefined,
    customSections: customSections.length ? customSections : undefined,
    storyImage: core.cStoryImage || undefined,
    lifestyleImage: core.cLifestyleImage || undefined,
    artworkImage: core.cArtworkImage || undefined,
    testimonials: testimonials.length ? testimonials : undefined,
    testimonialInterval: Number(core.cTestimonialInterval) > 0 ? Number(core.cTestimonialInterval) : undefined,
    collectionType: core.cCollectionType || undefined,
    edition: core.cEdition.trim() || undefined,
    burnTimes: (() => {
      const e = Object.entries(core.cBurnTimes).filter(([, v]) => v.trim());
      return e.length ? Object.fromEntries(e.map(([k, v]) => [k, v.trim()])) : undefined;
    })(),
    lifestyleMoments: (() => { const m = linesToArr(core.cLifestyleMoments); return m.length ? m : undefined; })(),
    craft: (() => { const c = core.cCraft.map((r) => ({ label: r.label.trim(), value: r.value.trim(), note: r.note.trim() })).filter((r) => r.label || r.value); return c.length ? c : undefined; })(),
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
  const [uploading, setUploading] = useState(false); // section/artist image uploads — kept off the Save button's busy flag
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
            type: s.type ?? "statement", position: s.position ?? "after-signature", eyebrow: sv(s.eyebrow), heading: sv(s.heading), body: sv(s.body),
            lines: Array.isArray(s.lines) ? s.lines.map((l) => sv(l)) : [], items: Array.isArray(s.items) ? s.items.map((x) => ({ label: sv(x.label), note: sv(x.note) })) : [],
          })) : [],
          airHourEyebrow: sv(lb.hourEyebrow), airFragranceEyebrow: sv(lb.fragranceEyebrow), airFeelsEyebrow: sv(lb.feelsEyebrow), airExperienceEyebrow: sv(lb.experienceEyebrow),
          airPlacementEyebrow: sv(lb.placementEyebrow), airPlacementHeading: sv(lb.placementHeading), airContinueEyebrow: sv(lb.continueEyebrow), airContinueHeading: sv(lb.continueHeading),
        };
      })(),
      ...((): Pick<Core,
        "cPalette" | "cCustomSurface" | "cCustomInk" | "cCustomAccent" | "cGradient" | "cGradFrom" | "cGradTo" | "cGradAngle" | "cAccordion" | "cCustomSections" |
        "cStoryEyebrow" | "cJourneyEyebrow" | "cJourneyHeading" | "cJourneyIntro" | "cMoodEyebrow" | "cMoodHeading" | "cCraftEyebrow" | "cCraftHeading" | "cArtistEyebrow" |
        "cLifestyleEyebrow" | "cLifestyleHeading" | "cTestimonialsEyebrow" | "cTestimonialsHeading" | "cMemoryLine" | "cContinueEyebrow" |
        "cStoryImage" | "cLifestyleImage" | "cArtworkImage" | "cTestimonials" |
        "cTestimonialInterval" | "cEdition" | "cCollectionType" | "cBurnTimes" | "cLifestyleMoments" | "cCraft"> => {
        const pc = (p.pdp_content ?? {}) as Record<string, unknown>;
        const clb = (pc.labels ?? {}) as Record<string, unknown>;
        return {
          cPalette: (pc.customPalette as { surface?: string })?.surface ? "custom" : sv(pc.palette),
          cCustomSurface: sv((pc.customPalette as { surface?: string })?.surface) || "#efe7db",
          cCustomInk: sv((pc.customPalette as { ink?: string })?.ink) || "#2a2018",
          cCustomAccent: sv((pc.customPalette as { accent?: string })?.accent),
          cGradient: pc.customGradient ? "custom" : "",
          cGradFrom: sv((pc.customGradient as { from?: string })?.from) || "#caa46a",
          cGradTo: sv((pc.customGradient as { to?: string })?.to) || "#3a2415",
          cGradAngle: (pc.customGradient as { angle?: number })?.angle != null ? String((pc.customGradient as { angle?: number }).angle) : "135",
          cAccordion: Array.isArray(pc.accordion) ? (pc.accordion as { title?: string; body?: string }[]).map((r) => ({ title: sv(r.title), body: sv(r.body) })) : [],
          cCustomSections: Array.isArray(pc.customSections) ? (pc.customSections as CustomSection[]).map((s) => ({
            type: s.type ?? "statement", position: s.position ?? "after-story", eyebrow: sv(s.eyebrow), heading: sv(s.heading), body: sv(s.body),
            lines: Array.isArray(s.lines) ? s.lines.map((l) => sv(l)) : [], items: Array.isArray(s.items) ? s.items.map((x) => ({ label: sv(x.label), note: sv(x.note) })) : [],
          })) : [],
          cStoryEyebrow: sv(clb.storyEyebrow), cJourneyEyebrow: sv(clb.journeyEyebrow), cJourneyHeading: sv(clb.journeyHeading), cJourneyIntro: sv(clb.journeyIntro),
          cMoodEyebrow: sv(clb.moodEyebrow), cMoodHeading: sv(clb.moodHeading), cCraftEyebrow: sv(clb.craftEyebrow), cCraftHeading: sv(clb.craftHeading), cArtistEyebrow: sv(clb.artistEyebrow),
          cLifestyleEyebrow: sv(clb.lifestyleEyebrow), cLifestyleHeading: sv(clb.lifestyleHeading), cTestimonialsEyebrow: sv(clb.testimonialsEyebrow), cTestimonialsHeading: sv(clb.testimonialsHeading),
          cMemoryLine: sv(clb.memoryLine), cContinueEyebrow: sv(clb.continueEyebrow),
          cStoryImage: sv(pc.storyImage), cLifestyleImage: sv(pc.lifestyleImage), cArtworkImage: sv(pc.artworkImage),
          cTestimonials: Array.isArray(pc.testimonials) ? (pc.testimonials as { quote?: string; attribution?: string }[]).map((t) => ({ quote: sv(t.quote), attribution: sv(t.attribution) })) : [],
          cTestimonialInterval: pc.testimonialInterval != null ? String(pc.testimonialInterval) : "",
          cEdition: sv(pc.edition), cCollectionType: sv(pc.collectionType),
          cBurnTimes: (pc.burnTimes && typeof pc.burnTimes === "object") ? Object.fromEntries(Object.entries(pc.burnTimes as Record<string, unknown>).map(([k, v]) => [k, sv(v)])) : {},
          cLifestyleMoments: Array.isArray(pc.lifestyleMoments) ? (pc.lifestyleMoments as string[]).join("\n") : "",
          cCraft: Array.isArray(pc.craft) ? (pc.craft as { label?: string; value?: string; note?: string }[]).map((r) => ({ label: sv(r.label), value: sv(r.value), note: sv(r.note) })) : [],
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [candleSiblings, setCandleSiblings] = useState<any[]>([]);

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

  // The candle PDP live preview draft — a getProductBySlug-row shaped object built from the current
  // (unsaved) form, so the /candle-preview iframe rebuilds the REAL CandleProductDetail from it.
  const candleDraft = useMemo(() => {
    if (!core) return null;
    const col = collections.find((c) => c.id === core.collectionId);
    return {
      id: productId, slug: core.slug, name: core.name, tagline: core.tagline, price: core.price,
      product_type: core.productType,
      scent_group: core.scentGroup || null, fragrance_family: core.fragranceFamily || null,
      story: core.story || null, story_long: core.storyLong || null, burn_time: core.burnTime || null,
      flame_persona: core.flamePersona || null, cultural_reference: core.culturalReference || null,
      lifestyle_use: core.lifestyleUse || null, wax_blend: core.waxBlend || null, wick: core.wick || null,
      mood_tags: core.moodTags.split(",").map((t) => t.trim()).filter(Boolean),
      artist_enabled: core.artistEnabled, artist_name: core.artistName, artist_role: core.artistRole,
      artist_story: core.artistStory, artist_quote: core.artistQuote, artist_image: core.artistImage,
      collection: col ? { name: col.name, slug: col.slug ?? "", volume: col.volume } : null,
      variants: variants.map((v, i) => ({
        id: v.id || `tmp-${i}`, sku: v.sku, variant_name: v.variantName, vessel_type: v.vesselType, size_label: v.sizeLabel,
        price: v.price, sale_price: v.salePrice, stock: v.stock, low_stock_threshold: v.lowStockThreshold ?? 0,
        is_active: v.isActive, sort_order: v.sortOrder,
      })),
      product_images: [...images].sort((a, b) => a.sortOrder - b.sortOrder).map((im) => ({ url: im.url, alt_text: im.altText, is_primary: im.isPrimary, sort_order: im.sortOrder })),
      fragrance_notes: notes.map((n) => ({ layer: n.layer, note: n.note, sort_order: n.sortOrder })),
      pdp_content: assembleCandleContent(core),
      __edition: core.cEdition.trim() || editionOf(col?.volume, Number(core.chapterPosition) || 1),
      __related: candleSiblings,
    };
  }, [core, variants, notes, images, collections, productId, candleSiblings]);

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

  // Load the chapter's other candle products (the candle preview's "Continue the Chapter" grid).
  useEffect(() => {
    const candle = core && !AIR_TYPES.includes(core.productType);
    if (!candle || !core?.collectionId) { setCandleSiblings([]); return; }
    let cancelled = false;
    fetch("/api/admin/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "candle.siblings", collectionId: core.collectionId, excludeId: productId }) })
      .then((r) => r.json()).then((d) => { if (!cancelled && Array.isArray(d?.siblings)) setCandleSiblings(d.siblings); }).catch(() => {});
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
  const csAdd = () => setCore((c) => (c ? { ...c, airCustomSections: [...c.airCustomSections, { type: "statement", position: "after-signature", eyebrow: "", heading: "", body: "", lines: [], items: [] }] } : c));
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

  // ── Candle PDP: Details accordion (overrides the storefront rows) ──
  const cAccUpdate = (i: number, patch: Partial<{ title: string; body: string }>) =>
    setCore((c) => (c ? { ...c, cAccordion: c.cAccordion.map((r, j) => (j === i ? { ...r, ...patch } : r)) } : c));
  const cAccAdd = () => setCore((c) => (c ? { ...c, cAccordion: [...c.cAccordion, { title: "", body: "" }] } : c));
  const cAccRemove = (i: number) => setCore((c) => (c ? { ...c, cAccordion: c.cAccordion.filter((_, j) => j !== i) } : c));
  const cAccMove = (i: number, dir: -1 | 1) =>
    setCore((c) => {
      if (!c) return c;
      const rows = [...c.cAccordion];
      const j = i + dir;
      if (j < 0 || j >= rows.length) return c;
      [rows[i], rows[j]] = [rows[j], rows[i]];
      return { ...c, cAccordion: rows };
    });
  const cAccLoadDefaults = () =>
    setCore((c) => {
      if (!c) return c;
      const vessels = Array.from(new Set(variants.map((v) => v.vesselType).filter((v): v is VesselType => !!v))).join(" · ");
      return { ...c, cAccordion: candleAccordionDefaults(c.waxBlend, c.wick, vessels) };
    });

  // ── Candle PDP: custom sections (move anywhere) ──
  const cCsUpdate = (i: number, patch: Partial<CustomSection>) =>
    setCore((c) => (c ? { ...c, cCustomSections: c.cCustomSections.map((s, j) => (j === i ? { ...s, ...patch } : s)) } : c));
  const cCsAdd = () => setCore((c) => (c ? { ...c, cCustomSections: [...c.cCustomSections, { type: "statement", position: "after-story", eyebrow: "", heading: "", body: "", lines: [], items: [] }] } : c));
  const cCsRemove = (i: number) => setCore((c) => (c ? { ...c, cCustomSections: c.cCustomSections.filter((_, j) => j !== i) } : c));
  const cCsMove = (i: number, dir: -1 | 1) =>
    setCore((c) => {
      if (!c) return c;
      const rows = [...c.cCustomSections];
      const j = i + dir;
      if (j < 0 || j >= rows.length) return c;
      [rows[i], rows[j]] = [rows[j], rows[i]];
      return { ...c, cCustomSections: rows };
    });

  // ── Candle PDP: testimonials (In their words) ──
  const cTesUpdate = (i: number, patch: Partial<{ quote: string; attribution: string }>) =>
    setCore((c) => (c ? { ...c, cTestimonials: c.cTestimonials.map((t, j) => (j === i ? { ...t, ...patch } : t)) } : c));
  const cTesAdd = () => setCore((c) => (c ? { ...c, cTestimonials: [...c.cTestimonials, { quote: "", attribution: "" }] } : c));
  const cTesRemove = (i: number) => setCore((c) => (c ? { ...c, cTestimonials: c.cTestimonials.filter((_, j) => j !== i) } : c));

  // Per-size burn time (Living the hero panel) — keyed by size label from the variants.
  const cBurnUpdate = (size: string, time: string) => setCore((c) => (c ? { ...c, cBurnTimes: { ...c.cBurnTimes, [size]: time } } : c));
  const sizeLabels = Array.from(new Set(variants.map((v) => v.sizeLabel).filter((s): s is string => !!s)));

  // ── Candle PDP: "Made by hand" craft tiles ──
  const cCraftUpdate = (i: number, patch: Partial<{ label: string; value: string; note: string }>) =>
    setCore((c) => (c ? { ...c, cCraft: c.cCraft.map((r, j) => (j === i ? { ...r, ...patch } : r)) } : c));
  const cCraftAdd = () => setCore((c) => (c ? { ...c, cCraft: [...c.cCraft, { label: "", value: "", note: "" }] } : c));
  const cCraftRemove = (i: number) => setCore((c) => (c ? { ...c, cCraft: c.cCraft.filter((_, j) => j !== i) } : c));
  const cCraftMove = (i: number, dir: -1 | 1) =>
    setCore((c) => {
      if (!c) return c;
      const rows = [...c.cCraft];
      const j = i + dir;
      if (j < 0 || j >= rows.length) return c;
      [rows[i], rows[j]] = [rows[j], rows[i]];
      return { ...c, cCraft: rows };
    });
  const cCraftLoadDefaults = () =>
    setCore((c) => {
      if (!c) return c;
      const vessels = Array.from(new Set(variants.map((v) => v.vesselType).filter((v): v is VesselType => !!v))).join(" · ");
      return { ...c, cCraft: candleCraftDefaults(c.waxBlend, c.wick, vessels) };
    });

  // Enabling a custom artist pre-fills the house artist so editing starts from what's shown (not blank).
  const toggleArtist = (on: boolean) =>
    setCore((c) => {
      if (!c) return c;
      if (on && !c.artistStory.trim() && !c.artistName.trim() && !c.artistQuote.trim()) {
        return { ...c, artistEnabled: true, artistName: HOUSE_ARTIST.name, artistRole: HOUSE_ARTIST.role, artistStory: HOUSE_ARTIST.story, artistQuote: HOUSE_ARTIST.quote };
      }
      return { ...c, artistEnabled: on };
    });

  const saveCore = async () => {
    if (!core) return;
    const isAir = AIR_TYPES.includes(core.productType);
    const airContent = isAir ? assembleAirContent(core) : undefined;
    const pdpContent = isAir ? undefined : assembleCandleContent(core);
    const product = {
      ...core, salePrice: numOrNull(core.salePrice), weightGrams: numOrNull(core.weightGrams),
      moodTags: core.moodTags.split(",").map((t) => t.trim()).filter(Boolean),
      collectionId: core.collectionId || null, displayOrder: Number(core.displayOrder || 0), publishAt: core.publishAt || null,
      ...(airContent ? { airContent } : {}),
      ...(pdpContent ? { pdpContent } : {}),
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

  // Upload a single image and hand the URL to a setter — for the candle PDP's section-specific images
  // (Story / Living With It / Artwork), which live in pdp_content, not the product gallery.
  const uploadInto = async (file: File, apply: (url: string) => void) => {
    setUploading(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("file", file); fd.append("folder", "products"); fd.append("alt", core?.name || "");
      const res = await fetch("/api/admin/media", { method: "POST", body: fd });
      const d = await res.json(); setUploading(false);
      if (!res.ok || !d.url) { setErr(d.error ?? d.reason ?? "Upload failed"); return; }
      apply(d.url);
    } catch (e) { setUploading(false); setErr(e instanceof Error ? e.message : "Upload failed"); }
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
  const isCandle = !isAir; // everything that isn't an air freshener renders the candle PDP
  const showPreview = previewOn; // both PDP types now have a live preview
  const onFieldFocus = (e: FocusEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement).closest?.("[data-anchor]")?.getAttribute("data-anchor");
    if (anchor) setFocusId(anchor);
  };
  const formCol = (
    <div className={`om-modal__card om-modal__card--wide${showPreview ? " pe-live__card" : ""}`} onClick={(e) => e.stopPropagation()} onFocusCapture={onFieldFocus}>
      <div className="pe-live__cardhead">
        <h2 className="om-modal__title">Edit {core.name}</h2>
        <button type="button" className="ff-btn ff-btn--mini" onClick={() => setPreviewOn((v) => !v)}>{previewOn ? "Hide live preview" : "Live preview"}</button>
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
          <label className="cfg-field" data-anchor="story"><span>Story (short)</span><textarea value={core.story} onChange={(e) => set({ story: e.target.value })} rows={2} /></label>
          <label className="cfg-field" data-anchor="story"><span>Story (long — The Story Within)</span><textarea value={core.storyLong} onChange={(e) => set({ storyLong: e.target.value })} rows={4} /></label>
          <div className="cfg-grid" data-anchor="mood">
            <label className="cfg-field"><span>Flame persona</span><input value={core.flamePersona} onChange={(e) => set({ flamePersona: e.target.value })} placeholder="The Storyteller" /></label>
            <label className="cfg-field"><span>Mood tags <em className="om-field__hint">comma-separated</em></span><input value={core.moodTags} onChange={(e) => set({ moodTags: e.target.value })} placeholder="Warm, Comforting, Cozy" /></label>
          </div>
          <label className="cfg-field" data-anchor="lifestyle"><span>Lifestyle (Living With It)</span><textarea value={core.lifestyleUse} onChange={(e) => set({ lifestyleUse: e.target.value })} rows={3} /></label>
          <label className="cfg-field" data-anchor="cultural"><span>Centre quote (cultural reference)</span><input value={core.culturalReference} onChange={(e) => set({ culturalReference: e.target.value })} /></label>
        </details>

        <details className="pe-sec">
          <summary>Artist ({core.artistEnabled ? "custom" : "house default"})</summary>
          <label className="om-check" style={{ marginBottom: 4 }}><input type="checkbox" checked={core.artistEnabled} onChange={(e) => toggleArtist(e.target.checked)} /><span>Use a custom artist for this product (otherwise the house artist shows)</span></label>
          <p className="om-field__hint" style={{ margin: "0 0 8px" }}>Tick the box to edit the artist for this candle — the fields fill with the house artist so you can change from there. Leave it unticked to keep the shared house artist. The <b>artwork image</b> below applies either way.</p>
          <div className="cfg-grid" data-anchor="artist">
            <label className="cfg-field"><span>Artist name</span><input value={core.artistName} onChange={(e) => set({ artistName: e.target.value })} placeholder="The Samorah Artist" disabled={!core.artistEnabled} /></label>
            <label className="cfg-field"><span>Artist role</span><input value={core.artistRole} onChange={(e) => set({ artistRole: e.target.value })} placeholder="Painter · Colourist" disabled={!core.artistEnabled} /></label>
          </div>
          <label className="cfg-field" data-anchor="artist"><span>Artist story <em className="om-field__hint">one paragraph per line</em></span><textarea value={core.artistStory} onChange={(e) => set({ artistStory: e.target.value })} rows={4} disabled={!core.artistEnabled} /></label>
          <label className="cfg-field" data-anchor="artist-quote"><span>Artist quote</span><input value={core.artistQuote} onChange={(e) => set({ artistQuote: e.target.value })} placeholder="Every colour begins with a feeling." disabled={!core.artistEnabled} /></label>
          <p className="om-field__hint" style={{ margin: "12px 0 6px", fontWeight: 600 }}>Artist images (two)</p>
          <p className="om-field__hint" style={{ margin: "0 0 8px" }}>The portrait sits beside “The Artist Behind This Candle”; the artwork is the full-width piece shown below it. Blank uses the house gradients.</p>
          <div data-anchor="artist">
            <ImgField value={core.artistImage} placeholder="Artist portrait — paste a URL, or upload →" uploading={uploading} disabled={!core.artistEnabled}
              onChange={(v) => set({ artistImage: v })}
              onUpload={(f) => void uploadInto(f, (url) => set({ artistImage: url }))}
              onClear={() => set({ artistImage: "" })} />
          </div>
          <div data-anchor="artwork">
            <ImgField value={core.cArtworkImage} placeholder="Artist artwork (full-width) — paste a URL, or upload →" uploading={uploading}
              onChange={(v) => set({ cArtworkImage: v })}
              onUpload={(f) => void uploadInto(f, (url) => set({ cArtworkImage: url }))}
              onClear={() => set({ cArtworkImage: "" })} />
          </div>
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
                      <button type="button" className="pe-icon-btn" onClick={() => accMove(i, -1)} disabled={i === 0} aria-label="Move up" title="Move up">↑</button>
                      <button type="button" className="pe-icon-btn" onClick={() => accMove(i, 1)} disabled={i === core.airAccordion.length - 1} aria-label="Move down" title="Move down">↓</button>
                      <button type="button" className="pe-icon-btn pe-icon-btn--danger" onClick={() => accRemove(i)} aria-label="Remove row" title="Remove row">×</button>
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
                      <button type="button" className="pe-icon-btn" onClick={() => csMove(i, -1)} disabled={i === 0} aria-label="Move up" title="Move up">↑</button>
                      <button type="button" className="pe-icon-btn" onClick={() => csMove(i, 1)} disabled={i === core.airCustomSections.length - 1} aria-label="Move down" title="Move down">↓</button>
                      <button type="button" className="pe-icon-btn pe-icon-btn--danger" onClick={() => csRemove(i)} aria-label="Remove section" title="Remove section">×</button>
                    </span>
                  </div>
                  <label className="cfg-field cfg-field--sm" style={{ marginBottom: 6 }}><span>Position on the page</span>
                    <select value={sec.position ?? "after-signature"} onChange={(e) => csUpdate(i, { position: e.target.value })}>
                      {AIR_SECTION_POSITIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </label>
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

        {isCandle ? (
          <details className="pe-sec" open>
            <summary>Candle PDP — colours, headings, accordion &amp; sections</summary>
            <p className="om-field__hint" style={{ margin: "0 0 8px" }}>Every field below is optional — leave it blank to keep the house default. Use the live preview to see each change instantly.</p>

            <p className="om-field__hint" style={{ margin: "12px 0 6px", fontWeight: 600 }}>Hero — edition, collection &amp; burn time</p>
            <div className="cfg-grid" data-anchor="pdp-top">
              <label className="cfg-field"><span>Edition label <em className="om-field__hint">the NO. I.1 line</em></span><input value={core.cEdition} onChange={(e) => set({ cEdition: e.target.value })} placeholder={editionOf(collections.find((c) => c.id === core.collectionId)?.volume, Number(core.chapterPosition) || 1)} /></label>
              <label className="cfg-field"><span>Collection type <em className="om-field__hint">the meta line</em></span>
                <select value={core.cCollectionType} onChange={(e) => set({ cCollectionType: e.target.value })}>
                  <option value="">Core Collection (default)</option>
                  {CANDLE_COLLECTION_TYPES.filter((t) => t !== "Core Collection").map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
            </div>
            <p className="om-field__hint" style={{ margin: "0 0 8px" }}>The volume (the “I” in NO. I.1) comes from the chapter — edit it in <b>Collections</b>. A Seasonal or Archive edition is set here; archiving the chapter itself is done in Collections (set it inactive).</p>
            {sizeLabels.length ? (
              <>
                <p className="om-field__hint" style={{ margin: "6px 0 6px", fontWeight: 600 }}>Burn time per size <em className="om-field__hint">— updates as the size is chosen on the PDP</em></p>
                <div className="cfg-grid">
                  {sizeLabels.map((sz) => (
                    <label key={sz} className="cfg-field"><span>{sz}</span><input value={core.cBurnTimes[sz] ?? ""} onChange={(e) => cBurnUpdate(sz, e.target.value)} placeholder="~25 hours" /></label>
                  ))}
                </div>
              </>
            ) : null}

            <p className="om-field__hint" style={{ margin: "14px 0 6px", fontWeight: 600 }}>Section colours</p>
            <div className="cfg-grid" data-anchor="story">
              <label className="cfg-field"><span>Palette <em className="om-field__hint">the page colour</em></span>
                <select value={core.cPalette} onChange={(e) => set({ cPalette: e.target.value })}>
                  <option value="">Chapter default</option>
                  {CANDLE_PALETTES.map((p) => <option key={p} value={p}>{p}</option>)}
                  <option value="custom">Custom…</option>
                </select>
              </label>
              <label className="cfg-field"><span>Hero gradient <em className="om-field__hint">behind the product image</em></span>
                <select value={core.cGradient} onChange={(e) => set({ cGradient: e.target.value })}>
                  <option value="">Default</option>
                  <option value="custom">Custom…</option>
                </select>
              </label>
              <label className="cfg-field"><span>Numbering / accent colour <em className="om-field__hint">the NO. I.2 colour on the related cards</em></span><input type="color" value={core.cCustomAccent || "#c9a96e"} onChange={(e) => set({ cCustomAccent: e.target.value })} /></label>
            </div>
            {core.cPalette === "custom" ? (
              <div className="cfg-grid" data-anchor="story">
                <label className="cfg-field"><span>Section background</span><input type="color" value={core.cCustomSurface} onChange={(e) => set({ cCustomSurface: e.target.value })} /></label>
                <label className="cfg-field"><span>Section text</span><input type="color" value={core.cCustomInk} onChange={(e) => set({ cCustomInk: e.target.value })} /></label>
                <div className="cfg-field"><span>Readability</span><span style={{ fontSize: 13, color: contrastRatio(core.cCustomSurface, core.cCustomInk) >= 4.5 ? "#2e7d4f" : "#b4534b" }}>{contrastRatio(core.cCustomSurface, core.cCustomInk) >= 4.5 ? "Good contrast ✓" : "Low contrast — hard to read"}</span></div>
              </div>
            ) : null}
            {core.cGradient === "custom" ? (
              <div className="cfg-grid" data-anchor="story">
                <label className="cfg-field"><span>Gradient from</span><input type="color" value={core.cGradFrom} onChange={(e) => set({ cGradFrom: e.target.value })} /></label>
                <label className="cfg-field"><span>Gradient to</span><input type="color" value={core.cGradTo} onChange={(e) => set({ cGradTo: e.target.value })} /></label>
                <label className="cfg-field"><span>Angle°</span><input type="number" value={core.cGradAngle} onChange={(e) => set({ cGradAngle: e.target.value })} placeholder="135" /></label>
              </div>
            ) : null}

            <p className="om-field__hint" style={{ margin: "14px 0 6px", fontWeight: 600 }}>Section images</p>
            <p className="om-field__hint" style={{ margin: "0 0 8px" }}>Each field here is its own image. <b>Blank</b> falls back to the main product photo — so if you leave both blank they show the same picture; set them to make Story and Living With It different. The main product photo is uploaded in the <b>Images</b> section below (not here). The artist&rsquo;s two images live in the Artist section above. Uploading here does <b>not</b> add to the product gallery.</p>
            {([
              { k: "cStoryImage", label: "Story Within image", anchor: "story" },
              { k: "cLifestyleImage", label: "Living With It image", anchor: "lifestyle" },
            ] as const).map(({ k, label, anchor }) => (
              <div key={k} data-anchor={anchor}>
                <ImgField value={core[k]} placeholder={`${label} — paste a URL, or upload →`} uploading={uploading}
                  onChange={(v) => set({ [k]: v } as Partial<Core>)}
                  onUpload={(f) => void uploadInto(f, (url) => set({ [k]: url } as Partial<Core>))}
                  onClear={() => set({ [k]: "" } as Partial<Core>)} />
              </div>
            ))}

            <label className="cfg-field" data-anchor="lifestyle" style={{ marginTop: 12 }}><span>Lifestyle — moment tags <em className="om-field__hint">one per line (Mornings, Evenings, Reading…); blank auto-derives from the lifestyle text</em></span><AutoTextarea value={core.cLifestyleMoments} onChange={(e) => set({ cLifestyleMoments: e.target.value })} rows={2} placeholder={"Mornings\nEvenings\nReading\nQuiet Moments\nGatherings"} /></label>

            <p className="om-field__hint" style={{ margin: "14px 0 6px", fontWeight: 600 }}>Details accordion</p>
            <p className="om-field__hint" style={{ margin: "0 0 8px" }}>The collapsible rows at the bottom of the PDP (Candle Care, Wax &amp; Wick, Ingredients, Shipping, Sustainability). Leave empty to keep the house rows, or load them below to edit / reorder / add.</p>
            <div data-anchor="details">
              {core.cAccordion.map((row, i) => (
                <div key={i} className="pe-acc">
                  <div className="pe-acc__head">
                    <input className="pe-acc__title" value={row.title} onChange={(e) => cAccUpdate(i, { title: e.target.value })} placeholder="Title — e.g. Candle Care & Safety" />
                    <span className="pe-acc__act">
                      <button type="button" className="pe-icon-btn" onClick={() => cAccMove(i, -1)} disabled={i === 0} aria-label="Move up" title="Move up">↑</button>
                      <button type="button" className="pe-icon-btn" onClick={() => cAccMove(i, 1)} disabled={i === core.cAccordion.length - 1} aria-label="Move down" title="Move down">↓</button>
                      <button type="button" className="pe-icon-btn pe-icon-btn--danger" onClick={() => cAccRemove(i)} aria-label="Remove row" title="Remove row">×</button>
                    </span>
                  </div>
                  <AutoTextarea className="pe-acc__body" value={row.body} onChange={(e) => cAccUpdate(i, { body: e.target.value })} rows={2} placeholder="Body — the text shown when this row is expanded." />
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="ff-btn ff-btn--mini" onClick={cAccAdd}>+ Add row</button>
                {core.cAccordion.length === 0 ? <button type="button" className="ff-btn ff-btn--mini" onClick={cAccLoadDefaults}>Load the house rows to edit</button> : null}
              </div>
            </div>

            <details className="pe-sec" style={{ marginTop: 12 }}>
              <summary>Section titles (optional — rename the labels &amp; headings)</summary>
              <p className="om-field__hint" style={{ margin: "0 0 8px" }}>Rename the small eyebrow labels and headings above each PDP section. Blank keeps the house wording (the grey placeholder).</p>
              <div className="cfg-grid">
                <label className="cfg-field" data-anchor="story"><span>Story — eyebrow</span><input value={core.cStoryEyebrow} onChange={(e) => set({ cStoryEyebrow: e.target.value })} placeholder="The Story Within" /></label>
                <label className="cfg-field" data-anchor="journey"><span>Fragrance Journey — eyebrow</span><input value={core.cJourneyEyebrow} onChange={(e) => set({ cJourneyEyebrow: e.target.value })} placeholder="Fragrance Journey" /></label>
                <label className="cfg-field" data-anchor="journey"><span>Fragrance Journey — heading</span><input value={core.cJourneyHeading} onChange={(e) => set({ cJourneyHeading: e.target.value })} placeholder="The composition unfolds" /></label>
                <label className="cfg-field" data-anchor="journey"><span>Fragrance Journey — intro</span><input value={core.cJourneyIntro} onChange={(e) => set({ cJourneyIntro: e.target.value })} placeholder="Each layer is built to evolve…" /></label>
                <label className="cfg-field" data-anchor="mood"><span>Scent Mood — eyebrow</span><input value={core.cMoodEyebrow} onChange={(e) => set({ cMoodEyebrow: e.target.value })} placeholder="Scent Mood" /></label>
                <label className="cfg-field" data-anchor="mood"><span>Scent Mood — heading</span><input value={core.cMoodHeading} onChange={(e) => set({ cMoodHeading: e.target.value })} placeholder="The feeling it leaves" /></label>
                <label className="cfg-field" data-anchor="craft"><span>Craft — eyebrow</span><input value={core.cCraftEyebrow} onChange={(e) => set({ cCraftEyebrow: e.target.value })} placeholder="Craft & Composition" /></label>
                <label className="cfg-field" data-anchor="craft"><span>Craft — heading</span><input value={core.cCraftHeading} onChange={(e) => set({ cCraftHeading: e.target.value })} placeholder="Made by hand" /></label>
                <label className="cfg-field" data-anchor="artist"><span>Artist — eyebrow</span><input value={core.cArtistEyebrow} onChange={(e) => set({ cArtistEyebrow: e.target.value })} placeholder="The Artist Behind This Candle" /></label>
                <label className="cfg-field" data-anchor="lifestyle"><span>Lifestyle — eyebrow</span><input value={core.cLifestyleEyebrow} onChange={(e) => set({ cLifestyleEyebrow: e.target.value })} placeholder="Lifestyle" /></label>
                <label className="cfg-field" data-anchor="lifestyle"><span>Lifestyle — heading</span><input value={core.cLifestyleHeading} onChange={(e) => set({ cLifestyleHeading: e.target.value })} placeholder="Living with it" /></label>
                <label className="cfg-field" data-anchor="testimonials"><span>Testimonials — eyebrow</span><input value={core.cTestimonialsEyebrow} onChange={(e) => set({ cTestimonialsEyebrow: e.target.value })} placeholder="Letters From Our Community" /></label>
                <label className="cfg-field" data-anchor="testimonials"><span>Testimonials — heading</span><input value={core.cTestimonialsHeading} onChange={(e) => set({ cTestimonialsHeading: e.target.value })} placeholder="In their words" /></label>
                <label className="cfg-field"><span>Memory divider line</span><input value={core.cMemoryLine} onChange={(e) => set({ cMemoryLine: e.target.value })} placeholder="Every fragrance begins with a memory." /></label>
                <label className="cfg-field" data-anchor="related"><span>Continue — eyebrow</span><input value={core.cContinueEyebrow} onChange={(e) => set({ cContinueEyebrow: e.target.value })} placeholder="Continue" /></label>
              </div>
            </details>

            <details className="pe-sec" style={{ marginTop: 12 }} data-anchor="craft">
              <summary>Craft — the “Made by hand” tiles</summary>
              <p className="om-field__hint" style={{ margin: "0 0 8px" }}>The tiles under “Made by hand” — Hand Poured, Wax Blend, Cotton Wick, The Vessel. Leave empty to keep the house tiles (Wax &amp; Wick read the Ingredients fields), or load them below to edit, reorder or add.</p>
              {core.cCraft.map((row, i) => (
                <div key={i} className="pe-acc">
                  <div className="pe-acc__head">
                    <input className="pe-acc__title" value={row.label} onChange={(e) => cCraftUpdate(i, { label: e.target.value })} placeholder="Label — e.g. Hand Poured" />
                    <span className="pe-acc__act">
                      <button type="button" className="pe-icon-btn" onClick={() => cCraftMove(i, -1)} disabled={i === 0} aria-label="Move up" title="Move up">↑</button>
                      <button type="button" className="pe-icon-btn" onClick={() => cCraftMove(i, 1)} disabled={i === core.cCraft.length - 1} aria-label="Move down" title="Move down">↓</button>
                      <button type="button" className="pe-icon-btn pe-icon-btn--danger" onClick={() => cCraftRemove(i)} aria-label="Remove tile" title="Remove tile">×</button>
                    </span>
                  </div>
                  <input className="pe-acc__title" style={{ margin: "6px 0" }} value={row.value} onChange={(e) => cCraftUpdate(i, { value: e.target.value })} placeholder="Value — e.g. In small batches" />
                  <AutoTextarea className="pe-acc__body" value={row.note} onChange={(e) => cCraftUpdate(i, { note: e.target.value })} rows={1} placeholder="Note — the small line beneath" />
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="ff-btn ff-btn--mini" onClick={cCraftAdd}>+ Add tile</button>
                {core.cCraft.length === 0 ? <button type="button" className="ff-btn ff-btn--mini" onClick={cCraftLoadDefaults}>Load the house tiles to edit</button> : null}
              </div>
            </details>

            <details className="pe-sec" style={{ marginTop: 12 }} data-anchor="testimonials">
              <summary>In their words ({core.cTestimonials.length}) — testimonials</summary>
              <p className="om-field__hint" style={{ margin: "0 0 8px" }}>Per-product testimonials. Leave empty to use the chapter&rsquo;s shared voices. Two or more auto-rotate as a crossfade.</p>
              <label className="cfg-field" style={{ maxWidth: 260, marginBottom: 8 }}><span>Rotation seconds <em className="om-field__hint">between voices (blank = 5.5)</em></span><input type="number" min={2} value={core.cTestimonialInterval} onChange={(e) => set({ cTestimonialInterval: e.target.value })} placeholder="5.5" /></label>
              {core.cTestimonials.map((t, i) => (
                <div key={i} className="pe-acc">
                  <div className="pe-acc__head">
                    <span className="pe-acc__num">{i + 1}</span>
                    <input className="pe-acc__title" value={t.attribution} onChange={(e) => cTesUpdate(i, { attribution: e.target.value })} placeholder="Attribution — e.g. Aditi, Mumbai" />
                    <span className="pe-acc__act"><button type="button" className="pe-icon-btn pe-icon-btn--danger" onClick={() => cTesRemove(i)} aria-label="Remove" title="Remove">×</button></span>
                  </div>
                  <AutoTextarea className="pe-acc__body" value={t.quote} onChange={(e) => cTesUpdate(i, { quote: e.target.value })} rows={2} placeholder="The quote." />
                </div>
              ))}
              <button type="button" className="ff-btn ff-btn--mini" onClick={cTesAdd}>+ Add testimonial</button>
            </details>

            <details className="pe-sec" style={{ marginTop: 12 }}>
              <summary>Custom sections ({core.cCustomSections.length}) — add your own, anywhere</summary>
              <p className="om-field__hint" style={{ margin: "0 0 8px" }}>Extra sections built from the same blocks as the rest of the page (styling automatic, the layout never breaks). Choose where each one lands.</p>
              {core.cCustomSections.map((sec, i) => (
                <div key={i} className="pe-acc">
                  <div className="pe-acc__head">
                    <span className="pe-acc__num">{i + 1}</span>
                    <select className="pe-acc__title" value={sec.type} onChange={(e) => cCsUpdate(i, { type: e.target.value as CustomSection["type"] })}>
                      <option value="statement">Statement — heading + paragraphs</option>
                      <option value="lines">Lines — verse (one line each)</option>
                      <option value="grid">Grid — label + note tiles</option>
                      <option value="quote">Quote — a single line</option>
                    </select>
                    <span className="pe-acc__act">
                      <button type="button" className="pe-icon-btn" onClick={() => cCsMove(i, -1)} disabled={i === 0} aria-label="Move up" title="Move up">↑</button>
                      <button type="button" className="pe-icon-btn" onClick={() => cCsMove(i, 1)} disabled={i === core.cCustomSections.length - 1} aria-label="Move down" title="Move down">↓</button>
                      <button type="button" className="pe-icon-btn pe-icon-btn--danger" onClick={() => cCsRemove(i)} aria-label="Remove section" title="Remove section">×</button>
                    </span>
                  </div>
                  <label className="cfg-field cfg-field--sm" style={{ marginBottom: 6 }}><span>Position on the page</span>
                    <select value={sec.position ?? "after-story"} onChange={(e) => cCsUpdate(i, { position: e.target.value })}>
                      {CANDLE_SECTION_POSITIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </label>
                  {sec.type !== "quote" ? <input value={sec.eyebrow ?? ""} onChange={(e) => cCsUpdate(i, { eyebrow: e.target.value })} placeholder="Eyebrow — e.g. The Ritual" /> : null}
                  {sec.type === "statement" || sec.type === "grid" ? <input value={sec.heading ?? ""} onChange={(e) => cCsUpdate(i, { heading: e.target.value })} placeholder="Heading" /> : null}
                  {sec.type === "statement" ? <AutoTextarea className="pe-acc__body" value={sec.body ?? ""} onChange={(e) => cCsUpdate(i, { body: e.target.value })} rows={2} placeholder="Paragraphs — leave a blank line between each." /> : null}
                  {sec.type === "quote" ? <AutoTextarea className="pe-acc__body" value={sec.body ?? ""} onChange={(e) => cCsUpdate(i, { body: e.target.value })} rows={2} placeholder="The quote." /> : null}
                  {sec.type === "lines" ? <AutoTextarea className="pe-acc__body" value={(sec.lines ?? []).join("\n")} onChange={(e) => cCsUpdate(i, { lines: e.target.value.split("\n") })} rows={3} placeholder={"One line each\nlike a little verse"} /> : null}
                  {sec.type === "grid" ? <AutoTextarea className="pe-acc__body" value={placementToText(sec.items ?? [])} onChange={(e) => cCsUpdate(i, { items: textToPlacement(e.target.value) })} rows={3} placeholder={"label | note   (one per line)"} /> : null}
                </div>
              ))}
              <button type="button" className="ff-btn ff-btn--mini" onClick={cCsAdd}>+ Add section</button>
            </details>
          </details>
        ) : null}

        <details className="pe-sec">
          <summary>Fragrance Journey ({notes.filter((n) => n.note.trim()).length})</summary>
          <div className="pe-journey" data-anchor="journey">
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
          <summary>Ingredients — base wax &amp; wick</summary>
          <p className="om-field__hint" style={{ margin: "0 0 8px" }}>The base wax &amp; wick used across the page — the “Wax Blend”/“Cotton Wick” craft tiles and the “Wax &amp; Wick Details” accordion read these. The <b>Craft</b> section (in Candle PDP above) overrides how the tiles read. <b>Burn time is now per size</b> — set it in the Candle PDP → Hero section; this single value is only a fallback for a product with no sized variants.</p>
          <div className="cfg-grid" data-anchor="craft">
            <label className="cfg-field"><span>Wax blend</span><input value={core.waxBlend} onChange={(e) => set({ waxBlend: e.target.value })} /></label>
            <label className="cfg-field"><span>Wick</span><input value={core.wick} onChange={(e) => set({ wick: e.target.value })} /></label>
            <label className="cfg-field"><span>Burn time <em className="om-field__hint">fallback only</em></span><input value={core.burnTime} onChange={(e) => set({ burnTime: e.target.value })} placeholder="~45 hours" /></label>
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
        <LivePreviewPanel
          src={isAir ? "/pdp-preview" : "/candle-preview"}
          draft={isAir ? draft : candleDraft}
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
