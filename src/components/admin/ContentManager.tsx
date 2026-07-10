"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Section = { heading?: string; body: string[] };
type PageForm = { slug: string; title: string; eyebrow: string; intro: string; sections: Section[]; seo: { title?: string; description?: string; ogImage?: string }; status: "draft" | "published" };

export function ContentManager({ pages }: { pages: { slug: string; title: string; status: string; source: string }[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState<PageForm | null>(null);

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
      setEdit({ slug: p.slug, title: p.title, eyebrow: p.eyebrow ?? "", intro: p.intro ?? "", sections: p.sections ?? [], seo: p.seo ?? {}, status: p.status ?? "published" });
    }
  };
  const newPage = () => { setErr(""); setEdit({ slug: "", title: "", eyebrow: "", intro: "", sections: [{ heading: "", body: [""] }], seo: {}, status: "published" }); };
  const save = async () => {
    if (!edit) return;
    const page = { ...edit, sections: edit.sections.map((s) => ({ heading: s.heading || undefined, body: (Array.isArray(s.body) ? s.body : String(s.body).split("\n")).map((x) => x.trim()).filter(Boolean) })) };
    if (await post({ action: "save", page })) { setEdit(null); refresh(); }
  };
  const del = async (slug: string) => { if (await post({ action: "delete", slug })) refresh(); };

  const setSection = (i: number, patch: Partial<Section>) => edit && setEdit({ ...edit, sections: edit.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  return (
    <div className="cfg">
      <div className="cfg-actions">
        <button type="button" className="ff-btn ff-btn--primary" onClick={newPage}>New page</button>
        {pending ? <span className="ff-refreshing">updating…</span> : null}
        {err && !edit ? <span className="ff-err">{err}</span> : null}
      </div>
      <table className="admin__table admin__table--board">
        <thead><tr><th>Slug</th><th>Title</th><th>Source</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {pages.map((p) => (
            <tr key={p.slug}>
              <td className="admin__mono">/{p.slug}</td>
              <td>{p.title}</td>
              <td>{p.source === "config" ? <span className="admin__muted">config (seedable)</span> : <span className="om-pay" data-tone="paid">CMS</span>}</td>
              <td>{p.status === "config" ? "—" : p.status}</td>
              <td><div className="ff-actions"><button type="button" className="ff-btn" onClick={() => open(p.slug)}>{p.source === "config" ? "Edit → CMS" : "Edit"}</button>{p.source === "db" ? <button type="button" className="ff-btn ff-btn--danger" disabled={busy} onClick={() => del(p.slug)}>Delete</button> : null}</div></td>
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
              <label className="cfg-field"><span>Status</span><select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as "draft" | "published" })}><option value="published">published</option><option value="draft">draft</option></select></label>
            </div>
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
            <div className="om-modal__actions"><button type="button" className="ff-btn" disabled={busy} onClick={() => setEdit(null)}>Cancel</button><button type="button" className="ff-btn ff-btn--primary" disabled={busy || !edit.slug.trim() || !edit.title.trim()} onClick={save}>{busy ? "Saving…" : "Save page"}</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
