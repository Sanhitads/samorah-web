"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RedirectRow, SeoOverrideRow } from "@/services/seoRedirectService";

export function SeoRedirectsManager({ redirects, seo }: { redirects: RedirectRow[]; seo: SeoOverrideRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<"redirects" | "seo">("redirects");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: string; text: string } | null>(null);
  const [nr, setNr] = useState({ fromPath: "", toPath: "", code: 301 });
  const [ns, setNs] = useState({ path: "", title: "", description: "", ogImage: "", robots: "" });

  const post = async (body: Record<string, unknown>) => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/admin/seo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json(); setBusy(false);
      if (!res.ok || d.ok === false) { setMsg({ tone: "err", text: d.error ?? d.reason ?? "Failed" }); return false; }
      startTransition(() => router.refresh()); return true;
    } catch { setBusy(false); setMsg({ tone: "err", text: "Network error" }); return false; }
  };

  const addRedirect = async () => { if (await post({ action: "redirect.save", redirect: nr })) { setNr({ fromPath: "", toPath: "", code: 301 }); setMsg({ tone: "ok", text: "Redirect saved." }); } };
  const toggleRedirect = (r: RedirectRow) => post({ action: "redirect.save", redirect: { id: r.id, fromPath: r.fromPath, toPath: r.toPath, code: r.code, enabled: !r.enabled } });
  const delRedirect = (id: string) => post({ action: "redirect.delete", id });
  const addSeo = async () => { if (await post({ action: "seo.save", seo: ns })) { setNs({ path: "", title: "", description: "", ogImage: "", robots: "" }); setMsg({ tone: "ok", text: "SEO override saved." }); } };
  const delSeo = (path: string) => post({ action: "seo.delete", path });

  return (
    <div className="cfg">
      <nav className="ff-queues" aria-label="Section">
        <button type="button" className="ff-queue" data-active={tab === "redirects" ? "1" : "0"} onClick={() => setTab("redirects")}>Redirects</button>
        <button type="button" className="ff-queue" data-active={tab === "seo" ? "1" : "0"} onClick={() => setTab("seo")}>Meta overrides</button>
        {msg ? <span className={`cfg-msg cfg-msg--${msg.tone}`} style={{ marginLeft: "auto" }}>{msg.text}</span> : null}
      </nav>

      {tab === "redirects" ? (
        <div>
          <div className="cfg-row" style={{ gridTemplateColumns: "1.4fr 1.6fr 0.6fr auto" }}>
            <input value={nr.fromPath} onChange={(e) => setNr({ ...nr, fromPath: e.target.value })} placeholder="/old-path" />
            <input value={nr.toPath} onChange={(e) => setNr({ ...nr, toPath: e.target.value })} placeholder="/new-path" />
            <select value={nr.code} onChange={(e) => setNr({ ...nr, code: Number(e.target.value) })}><option value={301}>301</option><option value={302}>302</option></select>
            <button type="button" className="ff-btn ff-btn--primary" disabled={busy} onClick={addRedirect}>Add</button>
          </div>
          <table className="admin__table admin__table--board" style={{ marginTop: 10 }}>
            <thead><tr><th>From</th><th>To</th><th>Code</th><th>Hits</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {redirects.map((r) => (
                <tr key={r.id}>
                  <td className="admin__mono">{r.fromPath}</td><td className="admin__mono">{r.toPath}</td><td>{r.code}</td><td className="admin__mono">{r.hits}</td>
                  <td><button type="button" className="cfg-toggle" data-on={r.enabled ? "1" : "0"} onClick={() => toggleRedirect(r)}>{r.enabled ? "On" : "Off"}</button></td>
                  <td><button type="button" className="ff-btn ff-btn--danger" disabled={busy} onClick={() => delRedirect(r.id)}>Delete</button></td>
                </tr>
              ))}
              {!redirects.length ? <tr><td colSpan={6} className="admin__empty">No redirects yet.</td></tr> : null}
            </tbody>
          </table>
          <p className="cfg-hint">Redirects apply within ~60s of saving (cached in middleware). Loops (from = to) are rejected.</p>
        </div>
      ) : (
        <div>
          <div className="cfg-grid">
            <label className="cfg-field"><span>Path</span><input value={ns.path} onChange={(e) => setNs({ ...ns, path: e.target.value })} placeholder="/about" /></label>
            <label className="cfg-field"><span>Meta title</span><input value={ns.title} onChange={(e) => setNs({ ...ns, title: e.target.value })} /></label>
            <label className="cfg-field"><span>Meta description</span><input value={ns.description} onChange={(e) => setNs({ ...ns, description: e.target.value })} /></label>
            <label className="cfg-field"><span>OG image URL</span><input value={ns.ogImage} onChange={(e) => setNs({ ...ns, ogImage: e.target.value })} /></label>
            <label className="cfg-field"><span>Robots</span><input value={ns.robots} onChange={(e) => setNs({ ...ns, robots: e.target.value })} placeholder="noindex,nofollow" /></label>
            <div style={{ display: "flex", alignItems: "flex-end" }}><button type="button" className="ff-btn ff-btn--primary" disabled={busy} onClick={addSeo}>Save</button></div>
          </div>
          <table className="admin__table admin__table--board" style={{ marginTop: 10 }}>
            <thead><tr><th>Path</th><th>Title</th><th>Robots</th><th>Actions</th></tr></thead>
            <tbody>
              {seo.map((s) => (
                <tr key={s.path}><td className="admin__mono">{s.path}</td><td>{s.title || <span className="admin__muted">—</span>}</td><td>{s.robots || <span className="admin__muted">index</span>}</td>
                  <td><button type="button" className="ff-btn ff-btn--danger" disabled={busy} onClick={() => delSeo(s.path)}>Delete</button></td></tr>
              ))}
              {!seo.length ? <tr><td colSpan={4} className="admin__empty">No per-route overrides — routes use the global SEO defaults (Settings).</td></tr> : null}
            </tbody>
          </table>
          <p className="cfg-hint">Overrides layer over the global defaults in Settings. Used by pages that read getRouteSeo() in generateMetadata.</p>
        </div>
      )}
    </div>
  );
}
