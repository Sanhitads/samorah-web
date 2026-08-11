"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LegalPage } from "@/components/legal/LegalPage";
import { injectSupportEmail, splitClosing } from "@/lib/cms/pageContent";

type Section = { heading?: string; body: string[] };
type Status = "draft" | "scheduled" | "published";
type PageForm = { slug: string; title: string; eyebrow: string; intro: string; sections: Section[]; seo: { title?: string; description?: string; ogImage?: string }; status: Status; publishAt: string; unpublishAt: string };
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
    heroBand: edit.slug === "privacy",
    effectiveDate: fmtLocalDate(edit.publishAt),
    lastUpdated: fmtLocalDate(new Date().toISOString()),
  };
}

export function ContentManager({ pages, initialSlug, supportEmail }: { pages: PageRow[]; initialSlug?: string; supportEmail?: string }) {
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
      setEdit({ slug: p.slug, title: p.title, eyebrow: p.eyebrow ?? "", intro: p.intro ?? "", sections: p.sections ?? [], seo: p.seo ?? {}, status: p.status ?? "published", publishAt: toLocal(p.publishAt), unpublishAt: toLocal(p.unpublishAt) });
    }
  };
  const newPage = () => { setErr(""); setEdit({ slug: "", title: "", eyebrow: "", intro: "", sections: [{ heading: "", body: [""] }], seo: {}, status: "published", publishAt: "", unpublishAt: "" }); };
  const save = async () => {
    if (!edit) return;
    const page = {
      slug: edit.slug, title: edit.title, eyebrow: edit.eyebrow, intro: edit.intro,
      sections: edit.sections.map((s) => ({ heading: s.heading || undefined, body: (Array.isArray(s.body) ? s.body : String(s.body).split("\n")).map((x) => x.trim()).filter(Boolean) })),
      seo: edit.seo, status: edit.status, publishAt: fromLocal(edit.publishAt), unpublishAt: fromLocal(edit.unpublishAt),
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
                <LegalPage {...buildPreviewProps(edit, supportEmail)} />
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
