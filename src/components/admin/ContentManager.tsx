"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LegalPage } from "@/components/legal/LegalPage";
import { injectSupportEmail, splitClosing, SUPPORT_EMAIL_TOKEN, SUPPORT_UNAVAILABLE } from "@/lib/cms/pageContent";
import { FaqAccordion, type FaqCategory } from "@/components/faq/FaqAccordion";
import { ContactContent, type ContactBlock } from "@/components/contact/ContactContent";
import { CONTACT_FORM_DEFAULTS, type ContactFormConfig } from "@/lib/contact";

type FaqItem = { q: string; a: string };
type Section = { heading?: string; body: string[]; items?: FaqItem[] };
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
        // FAQ categories carry Q&A in `items` — preserve them (drop blank pairs). Non-FAQ pages have no items.
        ...(s.items ? { items: s.items.filter((it) => (it.q || "").trim() || (it.a || "").trim()) } : {}),
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
            <label className="cfg-field"><span>Intro</span><input value={edit.intro} onChange={(e) => setEdit({ ...edit, intro: e.target.value })} /></label>

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
                })() : (
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
    </div>
  );
}
