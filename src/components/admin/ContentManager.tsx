"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

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

export function ContentManager({ pages }: { pages: PageRow[] }) {
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
          <div className="om-modal__card om-modal__card--wide" onClick={(e) => e.stopPropagation()}>
            <h2 className="om-modal__title">{edit.slug ? `Edit /${edit.slug}` : "New page"}</h2>
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

            <p className="cfg-sub">Sections</p>
            {edit.sections.map((s, i) => (
              <div key={i} className="cms-section">
                <input value={s.heading ?? ""} onChange={(e) => setSection(i, { heading: e.target.value })} placeholder="Section heading" />
                <textarea rows={3} value={Array.isArray(s.body) ? s.body.join("\n") : s.body} onChange={(e) => setSection(i, { body: e.target.value.split("\n") })} placeholder="One paragraph per line" />
                <button type="button" className="ff-btn ff-btn--danger" onClick={() => setEdit({ ...edit, sections: edit.sections.filter((_, j) => j !== i) })}>Remove section</button>
              </div>
            ))}
            <button type="button" className="ff-btn" onClick={() => setEdit({ ...edit, sections: [...edit.sections, { heading: "", body: [""] }] })}>+ section</button>

            <p className="cfg-sub">SEO</p>
            <div className="cfg-grid">
              <label className="cfg-field"><span>Meta title</span><input value={edit.seo.title ?? ""} onChange={(e) => setEdit({ ...edit, seo: { ...edit.seo, title: e.target.value } })} /></label>
              <label className="cfg-field"><span>Meta description</span><input value={edit.seo.description ?? ""} onChange={(e) => setEdit({ ...edit, seo: { ...edit.seo, description: e.target.value } })} /></label>
            </div>

            {err ? <p className="ff-err">{err}</p> : null}
            <div className="om-modal__actions"><button type="button" className="ff-btn" disabled={busy} onClick={() => setEdit(null)}>Cancel</button><button type="button" className="ff-btn ff-btn--primary" disabled={busy || !edit.slug.trim() || !edit.title.trim() || (edit.status === "scheduled" && !edit.publishAt)} onClick={save}>{busy ? "Saving…" : "Save page"}</button></div>
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
