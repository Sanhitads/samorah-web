"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RedirectRow, SeoOverrideRow, SeoAnalysis, EffectiveSeo, EffectiveField, RedirectRowH } from "@/services/seoRedirectService";
import { ENTITY_ROUTE, type EntityType, type LinkableEntities } from "@/services/navigationService";
import { MediaPicker } from "./MediaPicker";
import type { MediaOption } from "./SchemaForm";
import { KebabMenu } from "./KebabMenu";
import { parseRobots, buildRobots, titleGuidance, descriptionGuidance } from "@/lib/seo/seoValidation";
import { setTabNotice, noticeFor, type TabNotices, type SeoTab } from "@/lib/seo/tabNotice";
import { HEALTH_LABEL } from "@/lib/seo/redirectHealth";
import { filterSortRedirects, type RedirectFilter, type RedirectSort } from "@/lib/seo/redirectFilter";

const EMPTY_R = { id: "", fromPath: "", toPath: "", code: 301, enabled: true };
const EMPTY_S = { path: "", title: "", description: "", ogImage: "", robots: "", canonical: "", sitemapPriority: "", changeFreq: "" };
type RedirectForm = typeof EMPTY_R;
type SeoForm = typeof EMPTY_S;

const PROV_LABEL: Record<string, string> = { overridden: "Overridden", "site-default": "Site default", "inherited-page": "Inherited from page/entity", "not-overridden": "Not overridden" };

/** Pick a canonical storefront route (Homepage / Page / Product / Collection / Chapter) or a custom path. */
function PathPicker({ entities, onPick, allowExternal }: { entities: LinkableEntities; onPick: (path: string) => void; allowExternal?: boolean }) {
  const [kind, setKind] = useState<"custom" | "home" | EntityType>("custom");
  const list = kind === "page" || kind === "product" || kind === "collection" || kind === "chapter" ? entities[kind] : [];
  return (
    <div className="seo-picker">
      <select aria-label="Target type" value={kind} onChange={(e) => { const k = e.target.value as typeof kind; setKind(k); if (k === "home") onPick("/"); }}>
        <option value="custom">Custom path{allowExternal ? " / URL" : ""}</option>
        <option value="home">Homepage</option>
        <option value="page">Page</option>
        <option value="product">Product</option>
        <option value="collection">Collection</option>
        <option value="chapter">Chapter</option>
      </select>
      {kind !== "custom" && kind !== "home" ? (
        <select aria-label={`Choose ${kind}`} defaultValue="" onChange={(e) => e.target.value && onPick(ENTITY_ROUTE[kind](e.target.value))}>
          <option value="">Choose {kind}…</option>
          {list.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      ) : null}
    </div>
  );
}

function ProvBadge({ f }: { f: EffectiveField }) {
  return <span className={`seo-prov seo-prov--${f.provenance}`}>{PROV_LABEL[f.provenance]}</span>;
}

export function SeoRedirectsManager({ redirects, seo, entities, canPublish }: { redirects: RedirectRowH[]; seo: SeoOverrideRow[]; entities: LinkableEntities; media?: MediaOption[]; canPublish: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [tab, setTab] = useState<SeoTab>("redirects");
  const [rQuery, setRQuery] = useState(""); const [rFilter, setRFilter] = useState<RedirectFilter>("all"); const [rSort, setRSort] = useState<RedirectSort>("created");
  const shownRedirects = useMemo(() => filterSortRedirects(redirects, { query: rQuery, filter: rFilter, sort: rSort }), [redirects, rQuery, rFilter, rSort]);
  const [busy, setBusy] = useState(false);
  const [notices, setNotices] = useState<TabNotices>({});
  const [undo, setUndo] = useState<{ text: string; run: () => void } | null>(null);
  const [nr, setNr] = useState<RedirectForm>(EMPTY_R);
  const [ns, setNs] = useState<SeoForm>(EMPTY_S);
  const [rAnalysis, setRAnalysis] = useState<SeoAnalysis | null>(null);
  const [effective, setEffective] = useState<EffectiveSeo | null>(null);
  const [mediaOpen, setMediaOpen] = useState(false);

  const notify = (t: SeoTab, notice: { tone: "ok" | "err" | "warn"; text: string } | null) => setNotices((s) => setTabNotice(s, t, notice));

  /** POST with a built-in confirmation loop: strong warnings return needs-confirm; we ask, then retry. */
  async function api(body: Record<string, unknown>): Promise<{ ok: boolean; data: any }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const send = (b: Record<string, unknown>) => fetch("/api/admin/seo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(async (r) => ({ r, d: await r.json() as any }));
    setBusy(true);
    try {
      let { r, d } = await send(body);
      if ((!r.ok || d.ok === false) && d.analysis?.confirmations?.length) {
        if (typeof window !== "undefined" && window.confirm(`${d.analysis.confirmations.join("\n\n")}\n\nProceed anyway?`)) ({ r, d } = await send({ ...body, confirmed: true }));
        else { setBusy(false); return { ok: false, data: { cancelled: true } }; }
      }
      setBusy(false);
      const ok = r.ok && d.ok !== false;
      if (ok) startTransition(() => router.refresh());
      return { ok, data: d };
    } catch { setBusy(false); return { ok: false, data: { error: "Network error" } }; }
  }

  // ── Redirects ────────────────────────────────────────────────────────────────────────────────────
  const analyzeR = async (form: RedirectForm) => {
    if (!form.fromPath || !form.toPath) { setRAnalysis(null); return; }
    try {
      const r = await fetch("/api/admin/seo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "redirect.analyze", redirect: form }) });
      const d = await r.json(); setRAnalysis(d.analysis ?? null);
    } catch { /* ignore live-check failure */ }
  };
  const saveRedirect = async () => {
    const { ok, data } = await api({ action: "redirect.save", redirect: nr });
    if (ok) { const warn = data.analysis?.warnings?.[0]; notify("redirects", warn ? { tone: "warn", text: `Saved. Note: ${warn}` } : { tone: "ok", text: nr.id ? "Redirect updated." : "Redirect saved." }); setNr(EMPTY_R); setRAnalysis(null); }
    else if (!data.cancelled) notify("redirects", { tone: "err", text: data.error ?? data.reason ?? "Failed" });
  };
  const toggleRedirect = async (r: RedirectRow) => {
    const { ok, data } = await api({ action: "redirect.save", redirect: { id: r.id, fromPath: r.fromPath, toPath: r.toPath, code: r.code, enabled: !r.enabled }, confirmed: true });
    notify("redirects", ok ? { tone: "ok", text: `${r.fromPath} ${r.enabled ? "disabled" : "enabled"}.` } : { tone: "err", text: data.error ?? "Failed" });
  };
  const editRedirect = (r: RedirectRow) => { setNr({ id: r.id, fromPath: r.fromPath, toPath: r.toPath, code: r.code, enabled: r.enabled }); analyzeR({ id: r.id, fromPath: r.fromPath, toPath: r.toPath, code: r.code, enabled: r.enabled }); };
  const deleteRedirect = async (r: RedirectRow) => {
    if (!window.confirm(`Delete the redirect ${r.fromPath} → ${r.toPath}?\n\nRequests to ${r.fromPath} will stop being redirected.`)) return;
    const snapshot = { fromPath: r.fromPath, toPath: r.toPath, code: r.code, enabled: r.enabled };
    const { ok, data } = await api({ action: "redirect.delete", id: r.id });
    if (ok) { notify("redirects", { tone: "ok", text: "Redirect deleted." }); setUndo({ text: `Deleted ${r.fromPath}`, run: async () => { setUndo(null); await api({ action: "redirect.save", redirect: snapshot, confirmed: true }); notify("redirects", { tone: "ok", text: "Redirect restored." }); } }); }
    else notify("redirects", { tone: "err", text: data.error ?? "Failed" });
  };

  // ── SEO overrides ──────────────────────────────────────────────────────────────────────────────────
  const robots = parseRobots(ns.robots);
  const setRobots = (patch: { index?: boolean; follow?: boolean }) => setNs({ ...ns, robots: buildRobots({ ...robots, ...patch }) });
  const loadEffective = async (path: string) => {
    if (!path) { setEffective(null); return; }
    try { const r = await fetch("/api/admin/seo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "seo.effective", path }) }); const d = await r.json(); setEffective(d.effective ?? null); } catch { /* ignore */ }
  };
  const editSeo = (s: SeoOverrideRow) => { setNs({ path: s.path, title: s.title, description: s.description, ogImage: s.ogImage, robots: s.robots, canonical: s.canonical, sitemapPriority: s.sitemapPriority, changeFreq: s.changeFreq }); loadEffective(s.path); };
  const saveSeo = async () => {
    const { ok, data } = await api({ action: "seo.save", seo: ns });
    if (ok) { const warn = data.analysis?.warnings?.[0]; notify("seo", warn ? { tone: "warn", text: `Saved. Note: ${warn}` } : { tone: "ok", text: "SEO override saved." }); loadEffective(ns.path); }
    else if (!data.cancelled) notify("seo", { tone: "err", text: data.error ?? data.reason ?? "Failed" });
  };
  const deleteSeo = async (s: SeoOverrideRow) => {
    if (!window.confirm(`Remove the SEO override for ${s.path}?\n\nThis route will revert to its inherited / default SEO metadata.`)) return;
    const snap = { path: s.path, title: s.title, description: s.description, ogImage: s.ogImage, robots: s.robots, canonical: s.canonical, sitemapPriority: s.sitemapPriority, changeFreq: s.changeFreq };
    const { ok, data } = await api({ action: "seo.delete", path: s.path });
    if (ok) { notify("seo", { tone: "ok", text: "Override removed — route reverts to inherited SEO." }); setUndo({ text: `Removed override for ${s.path}`, run: async () => { setUndo(null); await api({ action: "seo.save", seo: snap, confirmed: true }); notify("seo", { tone: "ok", text: "Override restored." }); } }); }
    else notify("seo", { tone: "err", text: data.error ?? "Failed" });
  };
  const resetField = (field: keyof SeoForm) => setNs({ ...ns, [field]: "" }); // reset one field to inherited; Save keeps the rest

  const note = noticeFor(notices, tab);
  const titleG = titleGuidance(ns.title.length), descG = descriptionGuidance(ns.description.length);

  return (
    <div className="cfg">
      <nav className="ff-queues" aria-label="Section">
        <button type="button" className="ff-queue" data-active={tab === "redirects" ? "1" : "0"} onClick={() => setTab("redirects")}>Redirects</button>
        <button type="button" className="ff-queue" data-active={tab === "seo" ? "1" : "0"} onClick={() => setTab("seo")}>Meta overrides</button>
        {note ? <span className={`cfg-msg cfg-msg--${note.tone}`} style={{ marginLeft: "auto" }}>{note.text}</span> : null}
      </nav>
      {undo ? <div className="seo-undo">{undo.text}. <button type="button" className="ff-link" onClick={undo.run}>Undo</button></div> : null}
      {!canPublish ? <p className="cfg-hint">You can review and validate here, but saving changes needs the <strong>content.publish</strong> capability.</p> : null}

      {tab === "redirects" ? (
        <div>
          <div className="cfg-row" style={{ gridTemplateColumns: "1.3fr 1.6fr 0.9fr auto" }}>
            <label className="cfg-field"><span>From (old path)</span><input value={nr.fromPath} onChange={(e) => setNr({ ...nr, fromPath: e.target.value })} onBlur={() => analyzeR(nr)} placeholder="/old-path" /></label>
            <label className="cfg-field"><span>To (destination)</span>
              <input value={nr.toPath} onChange={(e) => setNr({ ...nr, toPath: e.target.value })} onBlur={() => analyzeR(nr)} placeholder="/new-path or https://…" />
              <PathPicker entities={entities} allowExternal onPick={(p) => { const f = { ...nr, toPath: p }; setNr(f); analyzeR(f); }} />
            </label>
            <label className="cfg-field"><span>Type</span>
              <select value={nr.code} onChange={(e) => setNr({ ...nr, code: Number(e.target.value) })}>
                <option value={301}>301 — Permanent redirect</option>
                <option value={302}>302 — Temporary redirect</option>
              </select>
            </label>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
              <button type="button" className="ff-btn ff-btn--primary" disabled={busy || !canPublish} onClick={saveRedirect}>{nr.id ? "Update" : "Add"}</button>
              {nr.id ? <button type="button" className="ff-btn" disabled={busy} onClick={() => { setNr(EMPTY_R); setRAnalysis(null); }}>Cancel</button> : null}
            </div>
          </div>
          <p className="cfg-hint">Permanent (301) = the old URL has moved for good. Temporary (302) = the move is short-lived.</p>

          {rAnalysis && (rAnalysis.errors.length || rAnalysis.warnings.length || rAnalysis.confirmations.length || rAnalysis.finalDestination) ? (
            <div className="cfg-validation">
              {rAnalysis.errors.map((e, i) => <p key={`e${i}`} className="cfg-msg cfg-msg--err">⛔ {e}</p>)}
              {rAnalysis.confirmations.map((c, i) => <p key={`c${i}`} className="cfg-msg cfg-msg--warn">⚠ {c} (you'll be asked to confirm)</p>)}
              {rAnalysis.warnings.map((w, i) => <p key={`w${i}`} className="cfg-msg cfg-msg--warn">⚠ {w}</p>)}
              {rAnalysis.finalDestination ? <button type="button" className="ff-btn ff-btn--sm" onClick={() => { const f = { ...nr, toPath: rAnalysis.finalDestination! }; setNr(f); analyzeR(f); }}>Use final destination ({rAnalysis.finalDestination})</button> : null}
            </div>
          ) : null}

          {redirects.length ? (
            <div className="seo-toolbar">
              <input type="search" value={rQuery} onChange={(e) => setRQuery(e.target.value)} placeholder="Search source or destination" aria-label="Search redirects" />
              <select value={rFilter} onChange={(e) => setRFilter(e.target.value as RedirectFilter)} aria-label="Filter">
                <option value="all">All</option><option value="active">Active</option><option value="disabled">Disabled</option>
                <option value="permanent">Permanent (301)</option><option value="temporary">Temporary (302)</option><option value="problems">Problems</option>
              </select>
              <select value={rSort} onChange={(e) => setRSort(e.target.value as RedirectSort)} aria-label="Sort">
                <option value="created">Recently created</option><option value="alpha">Alphabetical</option>
              </select>
            </div>
          ) : null}
          <table className="admin__table admin__table--board" style={{ marginTop: 10 }}>
            <thead><tr><th>From</th><th>To</th><th>Type</th><th>Health</th><th></th></tr></thead>
            <tbody>
              {shownRedirects.map((r) => (
                <tr key={r.id}>
                  <td className="admin__mono">{r.fromPath}</td><td className="admin__mono">{r.toPath}</td><td>{r.code === 302 ? "302 · Temp" : "301 · Perm"}</td>
                  <td><span className={`seo-health seo-health--${r.health}`} title={r.healthDetail ?? ""}><span className="seo-health__dot" />{HEALTH_LABEL[r.health]}</span></td>
                  <td>
                    <div className="rowactions">
                      <button type="button" className="ff-btn ff-btn--sm" disabled={busy} onClick={() => editRedirect(r)}>Edit</button>
                      <KebabMenu items={[
                        { label: r.enabled ? "Disable" : "Enable", onClick: () => toggleRedirect(r), disabled: !canPublish },
                        { label: "Delete", onClick: () => deleteRedirect(r), danger: true, sep: true, disabled: !canPublish },
                      ]} />
                    </div>
                  </td>
                </tr>
              ))}
              {redirects.length && !shownRedirects.length ? <tr><td colSpan={5} className="admin__empty">No redirects match.</td></tr> : null}
              {!redirects.length ? <tr><td colSpan={5} className="admin__empty">No redirects yet.</td></tr> : null}
            </tbody>
          </table>
          <p className="cfg-hint">Redirects apply within ~60s (cached in middleware) and run <strong>before</strong> the page renders. Loops and broken destinations are blocked; redirecting a live page asks for confirmation. Health is derived from the redirect graph — traffic metrics are deferred (post-launch).</p>
        </div>
      ) : (
        <div>
          <div className="cfg-grid">
            <label className="cfg-field" data-wide="1"><span>Route</span>
              <input value={ns.path} onChange={(e) => setNs({ ...ns, path: e.target.value })} onBlur={() => loadEffective(ns.path)} placeholder="/about" />
              <PathPicker entities={entities} onPick={(p) => { setNs({ ...ns, path: p }); loadEffective(p); }} />
            </label>
            <label className="cfg-field" data-wide="1"><span>Meta title <span className="admin__muted">{ns.title.length} chars{titleG ? ` · ${titleG.text}` : ""}</span> {ns.title ? <button type="button" className="seo-reset" onClick={() => resetField("title")}>↺ inherited</button> : null}</span>
              <input value={ns.title} onChange={(e) => setNs({ ...ns, title: e.target.value })} /></label>
            <label className="cfg-field" data-wide="1"><span>Meta description <span className="admin__muted">{ns.description.length} chars{descG ? ` · ${descG.text}` : ""}</span> {ns.description ? <button type="button" className="seo-reset" onClick={() => resetField("description")}>↺ inherited</button> : null}</span>
              <textarea value={ns.description} onChange={(e) => setNs({ ...ns, description: e.target.value })} rows={2} /></label>
            <label className="cfg-field" data-wide="1"><span>OG image {ns.ogImage ? <button type="button" className="seo-reset" onClick={() => resetField("ogImage")}>↺ inherited</button> : null}</span>
              <div style={{ display: "flex", gap: 6 }}><input value={ns.ogImage} onChange={(e) => setNs({ ...ns, ogImage: e.target.value })} placeholder="https://… or pick" style={{ flex: 1 }} /><button type="button" className="ff-btn" onClick={() => setMediaOpen(true)}>Media…</button></div></label>
            <fieldset className="cfg-field"><span>Search indexing</span>
              <div className="seo-radio"><label><input type="radio" name="idx" checked={robots.index} onChange={() => setRobots({ index: true })} /> Index this page</label>
              <label><input type="radio" name="idx" checked={!robots.index} onChange={() => setRobots({ index: false })} /> Do not index</label></div></fieldset>
            <fieldset className="cfg-field"><span>Link crawling</span>
              <div className="seo-radio"><label><input type="radio" name="fol" checked={robots.follow} onChange={() => setRobots({ follow: true })} /> Follow links</label>
              <label><input type="radio" name="fol" checked={!robots.follow} onChange={() => setRobots({ follow: false })} /> Do not follow</label></div></fieldset>
            <label className="cfg-field" data-wide="1"><span>Canonical URL {ns.canonical ? <button type="button" className="seo-reset" onClick={() => resetField("canonical")}>↺ inherited</button> : null}</span>
              <input value={ns.canonical} onChange={(e) => setNs({ ...ns, canonical: e.target.value })} placeholder="Leave blank unless this page duplicates another URL" /></label>
            <div className="cfg-field" data-wide="1"><span>Sitemap hints <span className="admin__muted">— not yet applied to the generated sitemap</span></span>
              <div style={{ display: "flex", gap: 8, opacity: 0.7 }}>
                <input value={ns.sitemapPriority} onChange={(e) => setNs({ ...ns, sitemapPriority: e.target.value })} placeholder="priority 0–1" title="Stored, but the sitemap does not read this yet (Phase 2)" />
                <input value={ns.changeFreq} onChange={(e) => setNs({ ...ns, changeFreq: e.target.value })} placeholder="change frequency" title="Stored, but the sitemap does not read this yet (Phase 2)" />
              </div></div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
              <button type="button" className="ff-btn ff-btn--primary" disabled={busy || !canPublish} onClick={saveSeo}>Save</button>
              {ns.path ? <button type="button" className="ff-btn" disabled={busy} onClick={() => { setNs(EMPTY_S); setEffective(null); }}>Clear</button> : null}
            </div>
          </div>

          {effective ? (
            <div className="seo-effective">
              <h3>Resolved SEO &amp; inheritance <span className="admin__muted">— what the storefront resolver returns for {ns.path || "this route"}</span></h3>
              {([["Title", effective.title], ["Description", effective.description], ["Canonical", effective.canonical], ["Robots", effective.robots], ["OG image", effective.ogImage]] as [string, EffectiveField][]).map(([label, f]) => (
                <div className="seo-eff-row" key={label}>
                  <span className="seo-eff-label">{label}</span>
                  <span className="seo-eff-value">{f.value ?? <em className="admin__muted">supplied by the page — not shown here</em>}</span>
                  <ProvBadge f={f} />
                </div>
              ))}
              <p className="cfg-hint">Values shown come from the same resolver the storefront uses (site defaults + this override). A value the page itself sets in code (e.g. an entity title) shows as “Inherited from page/entity”.</p>
            </div>
          ) : null}

          <table className="admin__table admin__table--board" style={{ marginTop: 10 }}>
            <thead><tr><th>Route</th><th>Title</th><th>Robots</th><th>Actions</th></tr></thead>
            <tbody>
              {seo.map((s) => (
                <tr key={s.path}><td className="admin__mono">{s.path}</td><td>{s.title || <span className="admin__muted">—</span>}</td><td>{s.robots || <span className="admin__muted">index,follow</span>}</td>
                  <td><button type="button" className="ff-btn ff-btn--sm" disabled={busy} onClick={() => editSeo(s)}>Edit</button> <button type="button" className="ff-btn ff-btn--danger ff-btn--sm" disabled={busy || !canPublish} onClick={() => deleteSeo(s)}>Delete</button></td></tr>
              ))}
              {!seo.length ? <tr><td colSpan={4} className="admin__empty">No per-route overrides — routes use the global SEO defaults (Settings).</td></tr> : null}
            </tbody>
          </table>
          <p className="cfg-hint">Overrides layer over the global defaults (Settings), read by pages via getRouteSeo() in generateMetadata.</p>
        </div>
      )}

      <MediaPicker open={mediaOpen} kind="image" onSelect={(url) => { setNs((s) => ({ ...s, ogImage: url })); setMediaOpen(false); }} onClose={() => setMediaOpen(false)} />
    </div>
  );
}
