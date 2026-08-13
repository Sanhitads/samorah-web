"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LegalPage } from "@/components/legal/LegalPage";
import { injectSupportEmail, splitClosing, SUPPORT_EMAIL_TOKEN, SUPPORT_UNAVAILABLE } from "@/lib/cms/pageContent";
import { FaqAccordion, type FaqCategory } from "@/components/faq/FaqAccordion";
import { ContactContent, type ContactBlock } from "@/components/contact/ContactContent";
import { CONTACT_FORM_DEFAULTS, type ContactFormConfig } from "@/lib/contact";
import { ProductCareContent } from "@/components/product-care/ProductCareContent";
import { PeopleContent } from "@/components/people/PeopleContent";
import { MediaPicker } from "@/components/admin/MediaPicker";
import type { SectionImage, SectionLayout, SectionRatio, SectionVariant, DisplayStyle } from "@/lib/cms/sections";

type FaqItem = { q: string; a: string };
type Section = { heading?: string; body: string[]; items?: FaqItem[]; step?: string; label?: string; image?: SectionImage; layout?: SectionLayout; ratio?: SectionRatio; variant?: SectionVariant; align?: "left" | "center" | "right"; quote?: string; displayStyle?: DisplayStyle; hidden?: boolean };
type Status = "draft" | "scheduled" | "published";
type PageForm = { slug: string; title: string; eyebrow: string; intro: string; sections: Section[]; seo: { title?: string; description?: string; ogImage?: string }; status: Status; publishAt: string; unpublishAt: string; form: Record<string, unknown> };
/** Site Settings the Contact preview needs (single source; passed by the contact admin route). */
export type ContactSettings = { support: { email: string; phone: string; hours: string; whatsapp: string; studioAddress: string }; social: { instagram: string; pinterest: string; facebook: string; spotify: string } };
type PageRow = { slug: string; title: string; status: string; live?: boolean; publishAt?: string | null; unpublishAt?: string | null; source: string };
type Revision = { id: string; title: string; status: string; createdAt: string; actorId?: string | null };

/** ISO ⇄ <input type=datetime-local> value ("YYYY-MM-DDTHH:mm", local time). */
const toLocal = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

const fmtLocalDate = (v?: string) => (v ? new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : undefined);

/** Derive the exact public renderer props from the current (unsaved) form state, so
 *  the side-by-side preview mirrors what the storefront will show — same LegalPage,
 *  same support-email resolution, same closing-signature split. No new preview system. */
function buildPreviewProps(edit: PageForm, supportEmail?: string) {
  const mapped: Section[] = edit.sections.map((s) => ({
    heading: s.heading?.trim() ? s.heading : undefined,
    body: (Array.isArray(s.body) ? s.body : String(s.body).split("\n")).map((x) => x.trim()).filter(Boolean),
  }));
  const { sections, closing } = splitClosing(injectSupportEmail(mapped, supportEmail));
  return {
    eyebrow: edit.eyebrow,
    title: edit.title || "Untitled",
    intro: edit.intro,
    sections,
    closing,
    // Policy routes render with the dual-tone hero band; mirror that in the preview.
    heroBand: ["privacy", "terms", "returns-policy", "shipping", "product-care", "faq"].includes(edit.slug),
    effectiveDate: fmtLocalDate(edit.publishAt),
    lastUpdated: fmtLocalDate(new Date().toISOString()),
  };
}

export function ContentManager({ pages, initialSlug, supportEmail, contact }: { pages: PageRow[]; initialSlug?: string; supportEmail?: string; contact?: ContactSettings }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState<PageForm | null>(null);
  const [revs, setRevs] = useState<{ slug: string; list: Revision[] } | null>(null);

  const post = async (body: Record<string, unknown>): Promise<any> => {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/admin/content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      setBusy(false);
      if (!res.ok || d.ok === false) { setErr(d.error ?? d.reason ?? "Failed"); return null; }
      return d;
    } catch { setBusy(false); setErr("Network error"); return null; }
  };
  const refresh = () => startTransition(() => router.refresh());

  const open = async (slug: string) => {
    setErr("");
    const d = await post({ action: "get", slug });
    if (d?.page) {
      const p = d.page;
      setEdit({ slug: p.slug, title: p.title, eyebrow: p.eyebrow ?? "", intro: p.intro ?? "", sections: p.sections ?? [], seo: p.seo ?? {}, status: p.status ?? "published", publishAt: toLocal(p.publishAt), unpublishAt: toLocal(p.unpublishAt), form: p.form ?? {} });
    }
  };
  const newPage = () => { setErr(""); setEdit({ slug: "", title: "", eyebrow: "", intro: "", sections: [{ heading: "", body: [""] }], seo: {}, status: "published", publishAt: "", unpublishAt: "", form: {} }); };
  const save = async () => {
    if (!edit) return;
    const page = {
      slug: edit.slug, title: edit.title, eyebrow: edit.eyebrow, intro: edit.intro,
      sections: edit.sections.map((s) => ({
        heading: s.heading || undefined,
        body: (Array.isArray(s.body) ? s.body : String(s.body).split("\n")).map((x) => x.trim()).filter(Boolean),
        // FAQ / accordion categories carry Q&A in `items` — preserve them (drop blank pairs). Text pages have none.
        ...(s.items ? { items: s.items.filter((it) => (it.q || "").trim() || (it.a || "").trim()) } : {}),
        // Editorial fields (Product Care) — additive; text-only pages never set them.
        ...(s.step ? { step: s.step } : {}),
        ...(s.label ? { label: s.label } : {}),
        ...(s.image?.url ? { image: s.image } : {}),
        ...(s.layout ? { layout: s.layout } : {}),
        ...(s.ratio ? { ratio: s.ratio } : {}),
        ...(s.variant ? { variant: s.variant } : {}),
        ...(s.align ? { align: s.align } : {}),
        ...(s.quote ? { quote: s.quote } : {}),
        ...(s.displayStyle ? { displayStyle: s.displayStyle } : {}),
        ...(s.hidden ? { hidden: true } : {}),
      })),
      seo: edit.seo, status: edit.status, publishAt: fromLocal(edit.publishAt), unpublishAt: fromLocal(edit.unpublishAt),
      form: edit.form,
    };
    if (await post({ action: "save", page })) { setEdit(null); refresh(); }
  };
  const del = async (slug: string) => { if (await post({ action: "delete", slug })) refresh(); };
  const openRevs = async (slug: string) => { const d = await post({ action: "revisions", slug }); if (d?.revisions) setRevs({ slug, list: d.revisions }); };
  const restore = async (id: string) => { if (await post({ action: "restore", id })) { setRevs(null); refresh(); } };

  const setSection = (i: number, patch: Partial<Section>) => edit && setEdit({ ...edit, sections: edit.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const moveSection = (i: number, dir: -1 | 1) => {
    if (!edit) return;
    const j = i + dir;
    if (j < 0 || j >= edit.sections.length) return;
    const next = [...edit.sections];
    [next[i], next[j]] = [next[j], next[i]]; // swap to reorder
    setEdit({ ...edit, sections: next });
  };

  // ── FAQ editor (the `faq` slug): sections are CATEGORIES with Q&A `items`; a trailing
  //    heading-less section is the closing quote. All ops mutate edit.sections. ──
  const isFaq = !!edit && edit.slug === "faq";
  const [faqCollapsed, setFaqCollapsed] = useState<Set<number>>(new Set());
  const toggleFaqCollapse = (ci: number) => setFaqCollapsed((s) => { const n = new Set(s); n.has(ci) ? n.delete(ci) : n.add(ci); return n; });
  const faqSplit = (secs: Section[]) => {
    const last = secs[secs.length - 1];
    const hasClosing = !!last && !last.heading && !Array.isArray(last.items) && (last.body?.length ?? 0) > 0;
    return { cats: hasClosing ? secs.slice(0, -1) : secs, closing: hasClosing ? (last.body[0] ?? "") : "" };
  };
  const faqCats = edit ? faqSplit(edit.sections).cats : [];
  const faqClosing = edit ? faqSplit(edit.sections).closing : "";
  const setFaq = (cats: Section[], closing: string) => edit && setEdit({ ...edit, sections: [...cats, ...(closing.trim() ? [{ body: [closing] } as Section] : [])] });
  const faqSetCats = (fn: (c: Section[]) => Section[]) => setFaq(fn(faqCats.map((c) => ({ ...c, items: [...(c.items ?? [])] }))), faqClosing);
  const faqAddCategory = () => faqSetCats((c) => [...c, { heading: "New category", body: [], items: [] }]);
  const faqDelCategory = (ci: number) => faqSetCats((c) => c.filter((_, i) => i !== ci));
  const faqMoveCategory = (ci: number, dir: -1 | 1) => faqSetCats((c) => { const j = ci + dir; if (j < 0 || j >= c.length) return c; const n = [...c]; [n[ci], n[j]] = [n[j], n[ci]]; return n; });
  const faqSetCategoryName = (ci: number, name: string) => faqSetCats((c) => c.map((s, i) => (i === ci ? { ...s, heading: name } : s)));
  const faqAddQ = (ci: number) => faqSetCats((c) => c.map((s, i) => (i === ci ? { ...s, items: [...(s.items ?? []), { q: "", a: "" }] } : s)));
  const faqDelQ = (ci: number, qi: number) => faqSetCats((c) => c.map((s, i) => (i === ci ? { ...s, items: (s.items ?? []).filter((_, k) => k !== qi) } : s)));
  const faqSetQ = (ci: number, qi: number, patch: Partial<FaqItem>) => faqSetCats((c) => c.map((s, i) => (i === ci ? { ...s, items: (s.items ?? []).map((it, k) => (k === qi ? { ...it, ...patch } : it)) } : s)));
  const faqMoveQ = (ci: number, qi: number, dir: -1 | 1) => faqSetCats((c) => c.map((s, i) => { if (i !== ci) return s; const its = [...(s.items ?? [])]; const j = qi + dir; if (j < 0 || j >= its.length) return s; [its[qi], its[j]] = [its[j], its[qi]]; return { ...s, items: its }; }));
  const faqMoveQToCat = (ci: number, qi: number, target: number) => faqSetCats((c) => {
    if (target === ci || target < 0 || target >= c.length) return c;
    const item = (c[ci].items ?? [])[qi];
    if (!item) return c;
    return c.map((s, i) => (i === ci ? { ...s, items: (s.items ?? []).filter((_, k) => k !== qi) } : i === target ? { ...s, items: [...(s.items ?? []), item] } : s));
  });
  const faqPreviewCategories = (): FaqCategory[] => {
    const email = (supportEmail || "").trim() || SUPPORT_UNAVAILABLE;
    return faqCats
      .filter((c) => (c.items?.length ?? 0) > 0 || (c.heading ?? "").trim())
      .map((c) => ({ category: c.heading ?? "", items: (c.items ?? []).filter((it) => it.q.trim() || it.a.trim()).map((it) => ({ q: it.q, a: it.a.split(SUPPORT_EMAIL_TOKEN).join(email) })) }));
  };

  // ── Contact page: edited via the normal sections editor; adds a form-config block + a faithful
  //    preview. Contact methods / hours / studio / social come from Site Settings (single source). ──
  const isContact = !!edit && edit.slug === "contact";
  const formCfg = (edit?.form ?? {}) as ContactFormConfig;
  const setFormCfg = (patch: Partial<ContactFormConfig>) => edit && setEdit({ ...edit, form: { ...(edit.form ?? {}), ...patch } });
  const contactPreviewBlocks = () => {
    const { sections: cs, closing } = splitClosing(edit!.sections);
    const email = (contact?.support.email || supportEmail || "").trim();
    const tok: Record<string, string> = { "{{studioAddress}}": contact?.support.studioAddress ?? "", "{{businessHours}}": contact?.support.hours ?? "", "{{supportEmail}}": email };
    const resolve = (b?: Section): ContactBlock | undefined =>
      b && { heading: b.heading, body: (b.body ?? []).map((l) => Object.entries(tok).reduce((s, [t, v]) => s.split(t).join(v), l)).filter((x) => x.trim()) };
    const [intro, studio, hours, response] = [0, 1, 2, 3].map((i) => resolve(cs[i]));
    return { intro, studio, hours, response, closing, email };
  };
  // Contact editor works on a FIXED structure — 4 named content blocks (by position) + a closing quote —
  // so there is no free-form add/remove that could drop the closing or break the page's index mapping.
  const CONTACT_BLOCK_LABELS = ["Introduction", "Studio information", "Business hours", "Response expectations"];
  const CONTACT_BLOCK_HINTS = ["", "Use {{studioAddress}} — resolves from Settings.", "Use {{businessHours}} — resolves from Settings.", ""];
  const contactSectionBlocks = (): Section[] => { const { sections: content } = splitClosing(edit!.sections); return [0, 1, 2, 3].map((i) => content[i] ?? { heading: "", body: [] }); };
  const contactClosingText = () => splitClosing(edit!.sections).closing ?? "";
  const rebuildContact = (blocks: Section[], closing: string) => edit && setEdit({ ...edit, sections: [...blocks, ...(closing.trim() ? [{ body: [closing] } as Section] : [])] });
  const setContactBlock = (i: number, patch: Partial<Section>) => rebuildContact(contactSectionBlocks().map((b, j) => (j === i ? { ...b, ...patch } : b)), contactClosingText());
  const setContactClosing = (text: string) => rebuildContact(contactSectionBlocks(), text);

  // ── Product Care editor (the `product-care` slug): an EDITORIAL page. Each section is one of five
  //    types, inferred from its shape and switchable via a Type select. Reuses the same sections
  //    array + the Media Library picker + the accordion mechanism — no new CMS. ──
  const isProductCare = !!edit && edit.slug === "product-care";
  // The People page (`the-people-behind-samorah`) reuses this same editorial editor — a `person`
  // section (Feature / Card / Highlight via displayStyle) plus image break / statement / divider.
  const isPeople = !!edit && edit.slug === "the-people-behind-samorah";
  const isEditorialPage = isProductCare || isPeople;
  type PcType = "editorial" | "person" | "overlay" | "accordion" | "statement" | "divider";
  const PC_TYPE_LABEL: Record<PcType, string> = { editorial: "Editorial (image + text)", person: "Person (Feature / Card)", overlay: "Image break (overlay)", accordion: "Accordion (Q&A)", statement: "Statement / text", divider: "Section divider" };
  const PC_TYPE_OPTIONS: PcType[] = isPeople ? ["person", "overlay", "statement", "divider"] : ["editorial", "overlay", "accordion", "statement", "divider"];
  const PC_LAYOUTS: SectionLayout[] = ["left", "right", "center", "wide"];
  const PEOPLE_FEATURE_LAYOUTS: SectionLayout[] = ["left", "right", "wide"];
  const PC_RATIOS: SectionRatio[] = ["landscape", "portrait", "square"];
  const DISPLAY_STYLES: DisplayStyle[] = ["feature", "card", "highlight"];
  // Hero image (People) lives in the page `form` JSONB (form_config) — no schema change.
  const heroImg = (edit?.form as { heroImage?: SectionImage } | undefined)?.heroImage;
  const setHeroImage = (img: SectionImage | undefined) => edit && setEdit({ ...edit, form: { ...(edit.form ?? {}), heroImage: img } });
  const pcHasBody = (s: Section) => (Array.isArray(s.body) ? s.body : [String(s.body)]).some((b) => (b ?? "").trim());
  // The type is stored explicitly (variant) once the editor sets it; otherwise inferred from shape.
  const pcType = (s: Section): PcType =>
    (s.variant as PcType | undefined) ??
    (Array.isArray(s.items) ? "accordion"
      : s.layout === "overlay" ? "overlay"
        : (s.layout === "left" || s.layout === "right" || s.layout === "center" || s.layout === "wide" || s.image?.url) ? "editorial"
          : (s.heading && !pcHasBody(s)) ? "divider"
            : "statement");
  const [pcPicker, setPcPicker] = useState<number | null>(null); // section index whose image is being chosen
  // Switch a section's type NON-DESTRUCTIVELY — record the chosen `variant` and only set the minimal
  // fields that type needs to render. Body / heading / step / label / image are NEVER discarded, so
  // switching back restores everything (the renderer keys off `variant`, ignoring unused fields).
  const pcSetType = (i: number, t: PcType) => setSection(i, (() => {
    const cur = edit!.sections[i];
    switch (t) {
      case "editorial": return { variant: t, layout: (cur.layout && cur.layout !== "overlay" ? cur.layout : "left") as SectionLayout, ratio: cur.ratio ?? "landscape" };
      case "person": return { variant: t, displayStyle: cur.displayStyle ?? "card", layout: (cur.layout && cur.layout !== "overlay" ? cur.layout : "left") as SectionLayout, ratio: cur.ratio ?? "portrait" };
      case "overlay": return { variant: t, layout: "overlay" as SectionLayout };
      case "accordion": return { variant: t, items: cur.items ?? [] };
      case "statement": return { variant: t };
      case "divider": return { variant: t };
    }
  })());
  const setPcImage = (i: number, patch: Partial<SectionImage>) => setSection(i, { image: { url: "", ...(edit!.sections[i].image ?? {}), ...patch } });
  const pcDuplicate = (i: number) => { if (!edit) return; const next = [...edit.sections]; next.splice(i + 1, 0, JSON.parse(JSON.stringify(edit.sections[i]))); setEdit({ ...edit, sections: next }); };
  const pcAddSection = () => edit && setEdit({ ...edit, sections: [...edit.sections, isPeople ? { variant: "person", displayStyle: "card", body: [""], ratio: "portrait" } : { heading: "", body: [""], layout: "left", ratio: "landscape" }] });
  const pcToggleHidden = (i: number) => setSection(i, { hidden: !edit!.sections[i].hidden });
  const pcAddQ = (i: number) => setSection(i, { items: [...(edit!.sections[i].items ?? []), { q: "", a: "" }] });
  const pcDelQ = (i: number, qi: number) => setSection(i, { items: (edit!.sections[i].items ?? []).filter((_, k) => k !== qi) });
  const pcSetQ = (i: number, qi: number, patch: Partial<FaqItem>) => setSection(i, { items: (edit!.sections[i].items ?? []).map((it, k) => (k === qi ? { ...it, ...patch } : it)) });
  const pcMoveQ = (i: number, qi: number, dir: -1 | 1) => setSection(i, (() => { const its = [...(edit!.sections[i].items ?? [])]; const j = qi + dir; if (j < 0 || j >= its.length) return {}; [its[qi], its[j]] = [its[j], its[qi]]; return { items: its }; })());
  const pcImageRow = (i: number, s: Section) => (
    <div className="pcare-edit__media">
      {s.image?.url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img className="pcare-edit__thumb" src={s.image.url} alt="" />
        : <div className="pcare-edit__thumb pcare-edit__thumb--empty">No image</div>}
      <div className="pcare-edit__media-fields">
        <div className="ff-actions">
          <button type="button" className="ff-btn ff-btn--primary ff-btn--mini" onClick={() => setPcPicker(i)}>{s.image?.url ? "Replace image" : "Choose image"}</button>
          {s.image?.url ? <button type="button" className="ff-btn ff-btn--mini" onClick={() => setSection(i, { image: undefined })}>Remove</button> : null}
        </div>
        {s.image?.url ? (
          <>
            <label className="cfg-field"><span>Alt text {!(s.image.alt ?? "").trim() ? <span className="sf-warn">⚠ describe for accessibility</span> : null}</span><input value={s.image.alt ?? ""} onChange={(e) => setPcImage(i, { alt: e.target.value })} placeholder="Describe the image" /></label>
            <label className="cfg-field"><span>Caption <span className="admin__muted">· optional</span></span><input value={s.image.caption ?? ""} onChange={(e) => setPcImage(i, { caption: e.target.value })} /></label>
          </>
        ) : null}
      </div>
    </div>
  );

  // Deep-link support (e.g. /admin/content/privacy) — open that page's editor once on mount.
  const autoOpened = useRef(false);
  useEffect(() => {
    if (initialSlug && !autoOpened.current) {
      autoOpened.current = true;
      void open(initialSlug);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSlug]);

  const statusCell = (p: PageRow) => {
    if (p.status === "config") return "—";
    const tone = p.live ? "paid" : "pending";
    const label = p.status === "scheduled" ? "scheduled" : p.live ? "live" : p.status === "published" ? "unpublished" : "draft";
    return <span className="om-pay" data-tone={tone}>{label}</span>;
  };

  return (
    <div className="cfg">
      <div className="cfg-actions">
        <button type="button" className="ff-btn ff-btn--primary" onClick={newPage}>New page</button>
        {pending ? <span className="ff-refreshing">updating…</span> : null}
        {err && !edit && !revs ? <span className="ff-err">{err}</span> : null}
      </div>
      <table className="admin__table admin__table--board">
        <thead><tr><th>Slug</th><th>Title</th><th>Source</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {pages.map((p) => (
            <tr key={p.slug}>
              <td className="admin__mono">/{p.slug}</td>
              <td>{p.title}</td>
              <td>{p.source === "config" ? <span className="admin__muted">config (seedable)</span> : <span className="om-pay" data-tone="paid">CMS</span>}</td>
              <td>{statusCell(p)}</td>
              <td><div className="ff-actions">
                <button type="button" className="ff-btn" onClick={() => open(p.slug)}>{p.source === "config" ? "Edit → CMS" : "Edit"}</button>
                {p.source === "db" ? <button type="button" className="ff-btn" onClick={() => openRevs(p.slug)}>History</button> : null}
                {p.source === "db" ? <button type="button" className="ff-btn ff-btn--danger" disabled={busy} onClick={() => del(p.slug)}>Delete</button> : null}
              </div></td>
            </tr>
          ))}
        </tbody>
      </table>

      {edit ? (
        <div className="om-modal" role="dialog" aria-modal="true" onClick={() => !busy && setEdit(null)}>
          <div className="om-modal__card om-modal__card--wide cms-edit-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="om-modal__title">{edit.slug ? `Edit /${edit.slug}` : "New page"}</h2>
            <div className="cms-edit">
            <div className="cms-edit__form">
            <div className="cfg-grid">
              <label className="cfg-field"><span>Slug</span><input value={edit.slug} onChange={(e) => setEdit({ ...edit, slug: e.target.value })} placeholder="shipping" /></label>
              <label className="cfg-field"><span>Title</span><input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></label>
              <label className="cfg-field"><span>Eyebrow</span><input value={edit.eyebrow} onChange={(e) => setEdit({ ...edit, eyebrow: e.target.value })} /></label>
              <label className="cfg-field"><span>Status</span><select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as Status })}><option value="published">published</option><option value="scheduled">scheduled</option><option value="draft">draft</option></select></label>
            </div>
            <div className="cfg-grid">
              <label className="cfg-field"><span>Publish at{edit.status === "scheduled" ? " (required)" : " (optional)"}</span><input type="datetime-local" value={edit.publishAt} onChange={(e) => setEdit({ ...edit, publishAt: e.target.value })} /></label>
              <label className="cfg-field"><span>Unpublish at (optional)</span><input type="datetime-local" value={edit.unpublishAt} onChange={(e) => setEdit({ ...edit, unpublishAt: e.target.value })} /></label>
            </div>
            <p className="cfg-hint">Scheduled pages go live automatically at “publish at” and hide at “unpublish at” — no manual step.</p>
            {isEditorialPage ? (
              <label className="cfg-field"><span>Hero intro <span className="admin__muted">· line 1 = hero line, line 2 = subtitle</span></span><textarea rows={2} value={edit.intro} onChange={(e) => setEdit({ ...edit, intro: e.target.value })} /></label>
            ) : (
              <label className="cfg-field"><span>Intro</span><input value={edit.intro} onChange={(e) => setEdit({ ...edit, intro: e.target.value })} /></label>
            )}
            {isPeople ? (
              <div className="cfg-field"><span>Hero image <span className="admin__muted">· optional · large portrait / background</span></span>
                <div className="pcare-edit__media">
                  {heroImg?.url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img className="pcare-edit__thumb" src={heroImg.url} alt="" />
                    : <div className="pcare-edit__thumb pcare-edit__thumb--empty">No image</div>}
                  <div className="pcare-edit__media-fields">
                    <div className="ff-actions">
                      <button type="button" className="ff-btn ff-btn--primary ff-btn--mini" onClick={() => setPcPicker(-1)}>{heroImg?.url ? "Replace image" : "Choose image"}</button>
                      {heroImg?.url ? <button type="button" className="ff-btn ff-btn--mini" onClick={() => setHeroImage(undefined)}>Remove</button> : null}
                    </div>
                    {heroImg?.url ? <label className="cfg-field"><span>Alt text</span><input value={heroImg.alt ?? ""} onChange={(e) => setHeroImage({ ...heroImg, alt: e.target.value })} placeholder="Describe the image" /></label> : null}
                  </div>
                </div>
              </div>
            ) : null}

            {isFaq ? (
              <>
                <p className="cfg-sub">FAQ categories &amp; questions <span className="admin__muted">· one accordion open at a time on the page</span></p>
                {faqCats.map((cat, ci) => {
                  const collapsed = faqCollapsed.has(ci);
                  return (
                    <div key={ci} className="cms-faq-cat">
                      <div className="cms-section__bar">
                        <button type="button" className="ff-btn" aria-expanded={!collapsed} aria-label={collapsed ? "Expand category" : "Collapse category"} onClick={() => toggleFaqCollapse(ci)}>{collapsed ? "▸" : "▾"}</button>
                        <input className="cms-faq-cat__name" value={cat.heading ?? ""} onChange={(e) => faqSetCategoryName(ci, e.target.value)} placeholder="Category name" />
                        <div className="ff-actions">
                          <button type="button" className="ff-btn" disabled={ci === 0} aria-label="Move category up" onClick={() => faqMoveCategory(ci, -1)}>↑</button>
                          <button type="button" className="ff-btn" disabled={ci === faqCats.length - 1} aria-label="Move category down" onClick={() => faqMoveCategory(ci, 1)}>↓</button>
                          <button type="button" className="ff-btn ff-btn--danger" onClick={() => faqDelCategory(ci)}>Delete</button>
                        </div>
                      </div>
                      {!collapsed ? (
                        <div className="cms-faq-qs">
                          {(cat.items ?? []).map((it, qi) => (
                            <div key={qi} className="cms-faq-q">
                              <div className="cms-section__bar">
                                <span className="admin__muted">Q{qi + 1}</span>
                                <div className="ff-actions">
                                  <button type="button" className="ff-btn" disabled={qi === 0} aria-label="Move question up" onClick={() => faqMoveQ(ci, qi, -1)}>↑</button>
                                  <button type="button" className="ff-btn" disabled={qi === (cat.items?.length ?? 0) - 1} aria-label="Move question down" onClick={() => faqMoveQ(ci, qi, 1)}>↓</button>
                                  <select className="cms-faq-move" value={ci} aria-label="Move question to another category" onChange={(e) => faqMoveQToCat(ci, qi, Number(e.target.value))}>
                                    {faqCats.map((c2, i2) => <option key={i2} value={i2}>{i2 === ci ? "Move to…" : `→ ${c2.heading || `Category ${i2 + 1}`}`}</option>)}
                                  </select>
                                  <button type="button" className="ff-btn ff-btn--danger" onClick={() => faqDelQ(ci, qi)}>Remove</button>
                                </div>
                              </div>
                              <input value={it.q} onChange={(e) => faqSetQ(ci, qi, { q: e.target.value })} placeholder="Question" />
                              <textarea rows={3} value={it.a} onChange={(e) => faqSetQ(ci, qi, { a: e.target.value })} placeholder="Answer — one line per paragraph; “- ” for a bullet; {{supportEmail}} resolves from Settings" />
                            </div>
                          ))}
                          <button type="button" className="ff-btn" onClick={() => faqAddQ(ci)}>+ question</button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                <button type="button" className="ff-btn" onClick={faqAddCategory}>+ category</button>
                <label className="cfg-field" style={{ marginTop: 12 }}><span>Closing quote</span><input value={faqClosing} onChange={(e) => setFaq(faqCats, e.target.value)} placeholder="Questions often begin conversations…" /></label>
              </>
            ) : isContact ? (
              <>
                <p className="cfg-sub">Contact content <span className="admin__muted">· fixed blocks · methods &amp; social come from Settings</span></p>
                {contactSectionBlocks().map((b, i) => {
                  const bodyText = Array.isArray(b.body) ? b.body.join("\n") : b.body;
                  return (
                    <div key={i} className="cms-section">
                      <div className="cms-section__bar"><span className="admin__muted">{CONTACT_BLOCK_LABELS[i]}</span>{CONTACT_BLOCK_HINTS[i] ? <span className="cfg-count admin__muted">{CONTACT_BLOCK_HINTS[i]}</span> : null}</div>
                      <input value={b.heading ?? ""} onChange={(e) => setContactBlock(i, { heading: e.target.value })} placeholder="Heading" />
                      <textarea rows={3} value={bodyText} onChange={(e) => setContactBlock(i, { body: e.target.value.split("\n") })} placeholder="One paragraph per line" />
                    </div>
                  );
                })}
                <label className="cfg-field" style={{ marginTop: 12 }}><span>Closing quote</span><input value={contactClosingText()} onChange={(e) => setContactClosing(e.target.value)} placeholder="The finest conversations begin with curiosity…" /></label>
              </>
            ) : isEditorialPage ? (
              <>
                <p className="cfg-sub">{isPeople ? "People & sections" : "Editorial sections"} <span className="admin__muted">{isPeople ? "· features, cards, image breaks & statements — role is content" : "· image + text, accordions, statements & dividers"}</span></p>
                {edit.sections.map((s, i) => {
                  const t = pcType(s);
                  const bodyText = Array.isArray(s.body) ? s.body.join("\n") : s.body;
                  const label = t === "person" ? [s.label, s.heading].filter(Boolean).join(" · ") : s.heading;
                  return (
                    <div key={i} className={`cms-section pcare-edit${s.hidden ? " is-hidden" : ""}`}>
                      <div className="cms-section__bar">
                        <span className="admin__muted">Section {i + 1} · {PC_TYPE_LABEL[t]}{t === "person" && s.displayStyle ? ` (${s.displayStyle})` : ""}{label ? ` · ${label}` : ""}{s.hidden ? " · hidden" : ""}</span>
                        <div className="ff-actions">
                          <button type="button" className="ff-btn" disabled={i === 0} aria-label="Move section up" onClick={() => moveSection(i, -1)}>↑</button>
                          <button type="button" className="ff-btn" disabled={i === edit.sections.length - 1} aria-label="Move section down" onClick={() => moveSection(i, 1)}>↓</button>
                          <button type="button" className="ff-btn" aria-label="Duplicate section" onClick={() => pcDuplicate(i)}>⧉</button>
                          <button type="button" className="ff-btn" aria-pressed={!!s.hidden} onClick={() => pcToggleHidden(i)}>{s.hidden ? "Show" : "Hide"}</button>
                          <button type="button" className="ff-btn ff-btn--danger" aria-label="Delete section" onClick={() => setEdit({ ...edit, sections: edit.sections.filter((_, j) => j !== i) })}>Delete</button>
                        </div>
                      </div>

                      <div className="cfg-grid">
                        <label className="cfg-field"><span>Type</span>
                          <select value={t} onChange={(e) => pcSetType(i, e.target.value as PcType)}>
                            {PC_TYPE_OPTIONS.map((k) => <option key={k} value={k}>{PC_TYPE_LABEL[k]}</option>)}
                          </select>
                        </label>
                        {t === "editorial" ? <label className="cfg-field"><span>Step number <span className="admin__muted">· optional</span></span><input value={s.step ?? ""} onChange={(e) => setSection(i, { step: e.target.value })} placeholder="01" /></label> : null}
                      </div>

                      {t === "divider" ? (
                        <input value={s.heading ?? ""} onChange={(e) => setSection(i, { heading: e.target.value })} placeholder="Divider title (e.g. The Ritual of Light)" />
                      ) : t === "overlay" ? (
                        <>
                          <input value={s.heading ?? ""} onChange={(e) => setSection(i, { heading: e.target.value })} placeholder="Overlay text shown over the image" />
                          {pcImageRow(i, s)}
                          <div className="cfg-grid">
                            <label className="cfg-field"><span>Image ratio</span><select value={s.ratio ?? "landscape"} onChange={(e) => setSection(i, { ratio: e.target.value as SectionRatio })}>{PC_RATIOS.map((r) => <option key={r} value={r}>{r}</option>)}</select></label>
                            <label className="cfg-field"><span>Text alignment</span><select value={s.align ?? "center"} onChange={(e) => setSection(i, { align: e.target.value as "left" | "center" | "right" })}><option value="left">left</option><option value="center">center</option><option value="right">right</option></select></label>
                          </div>
                        </>
                      ) : t === "accordion" ? (
                        <>
                          <input value={s.heading ?? ""} onChange={(e) => setSection(i, { heading: e.target.value })} placeholder="Accordion title (e.g. Before You Light)" />
                          <textarea rows={2} value={bodyText} onChange={(e) => setSection(i, { body: e.target.value.split("\n") })} placeholder="Optional lede shown under the title" />
                          <div className="cms-faq-qs">
                            {(s.items ?? []).map((it, qi) => (
                              <div key={qi} className="cms-faq-q">
                                <div className="cms-section__bar">
                                  <span className="admin__muted">Q{qi + 1}</span>
                                  <div className="ff-actions">
                                    <button type="button" className="ff-btn" disabled={qi === 0} aria-label="Move question up" onClick={() => pcMoveQ(i, qi, -1)}>↑</button>
                                    <button type="button" className="ff-btn" disabled={qi === (s.items?.length ?? 0) - 1} aria-label="Move question down" onClick={() => pcMoveQ(i, qi, 1)}>↓</button>
                                    <button type="button" className="ff-btn ff-btn--danger" onClick={() => pcDelQ(i, qi)}>Remove</button>
                                  </div>
                                </div>
                                <input value={it.q} onChange={(e) => pcSetQ(i, qi, { q: e.target.value })} placeholder="Question" />
                                <textarea rows={2} value={it.a} onChange={(e) => pcSetQ(i, qi, { a: e.target.value })} placeholder="Answer — one line per paragraph; “- ” for a bullet" />
                              </div>
                            ))}
                            <button type="button" className="ff-btn" onClick={() => pcAddQ(i)}>+ question</button>
                          </div>
                        </>
                      ) : t === "statement" ? (
                        <>
                          <input value={s.heading ?? ""} onChange={(e) => setSection(i, { heading: e.target.value })} placeholder="Title (optional — leave blank for a large centred quote / closing)" />
                          <textarea rows={3} value={bodyText} onChange={(e) => setSection(i, { body: e.target.value.split("\n") })} placeholder="One paragraph per line" />
                        </>
                      ) : t === "person" ? (
                        <>
                          <div className="cfg-grid">
                            <label className="cfg-field"><span>Display style <span className="admin__muted">· weight</span></span><select value={s.displayStyle ?? "card"} onChange={(e) => setSection(i, { displayStyle: e.target.value as DisplayStyle })}>{DISPLAY_STYLES.map((d) => <option key={d} value={d}>{d}</option>)}</select></label>
                            <label className="cfg-field"><span>Role <span className="admin__muted">· optional</span></span><input value={s.label ?? ""} onChange={(e) => setSection(i, { label: e.target.value })} placeholder="Founder / Artist / Studio Companion" /></label>
                          </div>
                          <input value={s.heading ?? ""} onChange={(e) => setSection(i, { heading: e.target.value })} placeholder="Name (e.g. Ananya Das)" />
                          <textarea rows={3} value={bodyText} onChange={(e) => setSection(i, { body: e.target.value.split("\n") })} placeholder="Their story — one paragraph per line; “- ” for a bullet" />
                          {(s.displayStyle ?? "card") === "feature" ? <input value={s.quote ?? ""} onChange={(e) => setSection(i, { quote: e.target.value })} placeholder="Pull-quote (optional)" /> : null}
                          {pcImageRow(i, s)}
                          <div className="cfg-grid">
                            {(s.displayStyle ?? "card") === "feature" ? <label className="cfg-field"><span>Image position</span><select value={s.layout ?? "left"} onChange={(e) => setSection(i, { layout: e.target.value as SectionLayout })}>{PEOPLE_FEATURE_LAYOUTS.map((l) => <option key={l} value={l}>{l}</option>)}</select></label> : null}
                            <label className="cfg-field"><span>Portrait ratio</span><select value={s.ratio ?? "portrait"} onChange={(e) => setSection(i, { ratio: e.target.value as SectionRatio })}>{PC_RATIOS.map((r) => <option key={r} value={r}>{r}</option>)}</select></label>
                          </div>
                        </>
                      ) : (
                        <>
                          <input value={s.label ?? ""} onChange={(e) => setSection(i, { label: e.target.value })} placeholder="Small heading (e.g. FIRST BURN) — optional" />
                          <input value={s.heading ?? ""} onChange={(e) => setSection(i, { heading: e.target.value })} placeholder="Title (e.g. Prepare the Wick)" />
                          <textarea rows={3} value={bodyText} onChange={(e) => setSection(i, { body: e.target.value.split("\n") })} placeholder="Two or three short paragraphs — one per line; “- ” for a bullet" />
                          {pcImageRow(i, s)}
                          <div className="cfg-grid">
                            <label className="cfg-field"><span>Image position</span><select value={s.layout ?? "left"} onChange={(e) => setSection(i, { layout: e.target.value as SectionLayout })}>{PC_LAYOUTS.map((l) => <option key={l} value={l}>{l}</option>)}</select></label>
                            <label className="cfg-field"><span>Image ratio</span><select value={s.ratio ?? "landscape"} onChange={(e) => setSection(i, { ratio: e.target.value as SectionRatio })}>{PC_RATIOS.map((r) => <option key={r} value={r}>{r}</option>)}</select></label>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
                <button type="button" className="ff-btn" onClick={pcAddSection}>+ section</button>
              </>
            ) : (
              <>
                <p className="cfg-sub">Sections <span className="admin__muted">· use “- ” at the start of a line for a bullet</span></p>
                {edit.sections.map((s, i) => {
                  const bodyText = Array.isArray(s.body) ? s.body.join("\n") : s.body;
                  return (
                    <div key={i} className="cms-section">
                      <div className="cms-section__bar">
                        <span className="admin__muted">Section {i + 1}{s.heading ? ` · ${s.heading}` : " · (no heading)"}</span>
                        <div className="ff-actions">
                          <button type="button" className="ff-btn" disabled={i === 0} aria-label="Move section up" onClick={() => moveSection(i, -1)}>↑</button>
                          <button type="button" className="ff-btn" disabled={i === edit.sections.length - 1} aria-label="Move section down" onClick={() => moveSection(i, 1)}>↓</button>
                        </div>
                      </div>
                      <input value={s.heading ?? ""} onChange={(e) => setSection(i, { heading: e.target.value })} placeholder="Section heading (leave blank for the closing statement)" />
                      <textarea rows={3} value={bodyText} onChange={(e) => setSection(i, { body: e.target.value.split("\n") })} placeholder="One paragraph per line" />
                      <div className="cms-section__foot">
                        <span className="cfg-count admin__muted">{String(bodyText).length} characters</span>
                        <button type="button" className="ff-btn ff-btn--danger" onClick={() => setEdit({ ...edit, sections: edit.sections.filter((_, j) => j !== i) })}>Remove section</button>
                      </div>
                    </div>
                  );
                })}
                <button type="button" className="ff-btn" onClick={() => setEdit({ ...edit, sections: [...edit.sections, { heading: "", body: [""] }] })}>+ section</button>
              </>
            )}

            {isContact ? (
              <>
                <p className="cfg-sub">Contact form</p>
                <div className="cfg-grid">
                  <label className="om-check"><input type="checkbox" checked={formCfg.enableOrderNumber !== false} onChange={(e) => setFormCfg({ enableOrderNumber: e.target.checked })} /><span>Show “Order number” field</span></label>
                  <label className="om-check"><input type="checkbox" checked={formCfg.enablePhone !== false} onChange={(e) => setFormCfg({ enablePhone: e.target.checked })} /><span>Show “Phone number” field</span></label>
                </div>
                <label className="cfg-field"><span>Consent label</span><input value={formCfg.consentLabel ?? CONTACT_FORM_DEFAULTS.consentLabel} onChange={(e) => setFormCfg({ consentLabel: e.target.value })} /></label>
                <div className="cfg-grid">
                  <label className="cfg-field"><span>Success message</span><textarea rows={3} value={formCfg.successMessage ?? CONTACT_FORM_DEFAULTS.successMessage} onChange={(e) => setFormCfg({ successMessage: e.target.value })} /></label>
                  <label className="cfg-field"><span>Error message</span><textarea rows={3} value={formCfg.errorMessage ?? CONTACT_FORM_DEFAULTS.errorMessage} onChange={(e) => setFormCfg({ errorMessage: e.target.value })} /></label>
                </div>
                <p className="cfg-hint">Cleared fields fall back to the default wording on the page.</p>
                <p className="cfg-hint">Sections 1–4 above are Introduction · Our Studio · Business Hours · Response Expectations (the last blank-heading section is the closing quote). Contact methods, business hours, studio location &amp; social links come from <strong>Settings</strong> — single source, edit them there.</p>
              </>
            ) : null}

            <p className="cfg-sub">SEO</p>
            <div className="cfg-grid">
              <label className="cfg-field"><span>Meta title <span className="cfg-count admin__muted">{(edit.seo.title ?? "").length}/60</span></span><input value={edit.seo.title ?? ""} onChange={(e) => setEdit({ ...edit, seo: { ...edit.seo, title: e.target.value } })} /></label>
              <label className="cfg-field"><span>Meta description <span className="cfg-count admin__muted">{(edit.seo.description ?? "").length}/160</span></span><input value={edit.seo.description ?? ""} onChange={(e) => setEdit({ ...edit, seo: { ...edit.seo, description: e.target.value } })} /></label>
              <label className="cfg-field"><span>OG image URL</span><input value={edit.seo.ogImage ?? ""} onChange={(e) => setEdit({ ...edit, seo: { ...edit.seo, ogImage: e.target.value } })} placeholder="https://…" /></label>
            </div>
            <p className="cfg-hint">Canonical URL &amp; robots are managed centrally in <strong>SEO &amp; Redirects</strong> and layer over these fields — no duplicate SEO store.</p>

            {err ? <p className="ff-err">{err}</p> : null}
            <div className="om-modal__actions">
              <button type="button" className="ff-btn" disabled={busy} onClick={() => setEdit(null)}>Cancel</button>
              <button type="button" className="ff-btn" disabled={!edit.slug.trim()} onClick={() => window.open(`/${edit.slug.trim()}`, "_blank", "noopener")}>Open live ↗</button>
              <button type="button" className="ff-btn ff-btn--primary" disabled={busy || !edit.slug.trim() || !edit.title.trim() || (edit.status === "scheduled" && !edit.publishAt)} onClick={save}>{busy ? "Saving…" : "Save page"}</button>
            </div>
            </div>
            <aside className="cms-edit__preview" aria-label="Live preview">
              <p className="cms-edit__preview-label">Live preview <span className="admin__muted">· reflects unsaved edits</span></p>
              <div className="cms-edit__preview-frame">
                {isFaq ? (
                  <LegalPage eyebrow={edit.eyebrow} title={edit.title || "Frequently Asked Questions"} intro={edit.intro} sections={[]} closing={faqClosing || undefined} heroBand>
                    <FaqAccordion categories={faqPreviewCategories()} />
                  </LegalPage>
                ) : isContact ? (() => {
                  const b = contactPreviewBlocks();
                  return (
                    <LegalPage eyebrow={edit.eyebrow} title={edit.title || "Contact Us"} intro={edit.intro} sections={[]} closing={b.closing || undefined} heroBand>
                      <ContactContent intro={b.intro} studio={b.studio} hours={b.hours} response={b.response}
                        methods={{ email: b.email, whatsapp: contact?.support.whatsapp, phone: contact?.support.phone }}
                        social={contact?.social ?? {}} formConfig={formCfg} />
                    </LegalPage>
                  );
                })() : isProductCare ? (
                  <ProductCareContent eyebrow={edit.eyebrow} title={edit.title || "Product Care"} intro={edit.intro} sections={edit.sections} />
                ) : isPeople ? (
                  <PeopleContent eyebrow={edit.eyebrow} title={edit.title || "Behind Samorah"} intro={edit.intro} heroImage={heroImg ?? null} sections={edit.sections} />
                ) : (
                  <LegalPage {...buildPreviewProps(edit, supportEmail)} />
                )}
              </div>
            </aside>
            </div>
          </div>
        </div>
      ) : null}

      {revs ? (
        <div className="om-modal" role="dialog" aria-modal="true" onClick={() => !busy && setRevs(null)}>
          <div className="om-modal__card" onClick={(e) => e.stopPropagation()}>
            <h2 className="om-modal__title">History · /{revs.slug}</h2>
            {revs.list.length ? (
              <ul className="rev-list">
                {revs.list.map((r, i) => (
                  <li key={r.id} className="rev-item">
                    <span className="rev-item__when">{new Date(r.createdAt).toLocaleString()}</span>
                    <span className="rev-item__meta admin__muted">{r.status}{i === 0 ? " · current" : ""}</span>
                    {i === 0 ? <span className="admin__muted">—</span> : <button type="button" className="ff-btn" disabled={busy} onClick={() => restore(r.id)}>Restore</button>}
                  </li>
                ))}
              </ul>
            ) : <p className="admin__empty">No revisions yet — they’re recorded from the next save.</p>}
            {err ? <p className="ff-err">{err}</p> : null}
            <div className="om-modal__actions"><button type="button" className="ff-btn" onClick={() => setRevs(null)}>Close</button></div>
          </div>
        </div>
      ) : null}

      {pcPicker !== null ? (
        <MediaPicker
          open
          kind="image"
          onSelect={(url, focal, _fm, _mu, assetId) => {
            if (pcPicker === -1) setHeroImage({ url, mediaId: assetId, focal, ...(heroImg?.alt ? { alt: heroImg.alt } : {}) });
            else if (pcPicker !== null) setPcImage(pcPicker, { url, mediaId: assetId, focal });
          }}
          onClose={() => setPcPicker(null)}
        />
      ) : null}
    </div>
  );
}
