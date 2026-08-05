"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RedirectRow, SeoOverrideRow, SeoAnalysis, EffectiveSeo, EffectiveField, RedirectRowH } from "@/services/seoRedirectService";
import { type LinkableEntities } from "@/services/navigationService";
import { valueForKind, entityPath, isEntityKind, type PickerKind } from "@/lib/seo/pathPicker";
import type { MediaOption } from "./SchemaForm";
import { KebabMenu } from "./KebabMenu";
import { postSeo } from "./seo/postSeo";
import { RobotsControls, OgImageField, CharCount, SerpCard, SocialCard, ProvenanceBadge } from "./seo/SeoPrimitives";
import { draftPreview } from "@/lib/seo/effectivePreview";
import { isNoindex, isMajorRoute, parseRobots } from "@/lib/seo/seoValidation";
import { findOverrideDuplicates } from "@/lib/seo/duplicateMeta";
import { setTabNotice, noticeFor, type TabNotices, type SeoTab } from "@/lib/seo/tabNotice";
import { HEALTH_LABEL } from "@/lib/seo/redirectHealth";
import { filterSortRedirects, type RedirectFilter, type RedirectSort } from "@/lib/seo/redirectFilter";

const EMPTY_R = { id: "", fromPath: "", toPath: "", code: 301, enabled: true };
const EMPTY_S = { path: "", title: "", description: "", ogImage: "", robots: "", canonical: "", sitemapPriority: "", changeFreq: "" };
type RedirectForm = typeof EMPTY_R;
type SeoForm = typeof EMPTY_S;

/**
 * Type-first destination/route picker (#2/#7). The KIND (Custom / Homepage / Page / Product / Collection
 * / Chapter) leads; the matching control follows. It is CONTROLLED by `value` and emits a single canonical
 * path via `onChange` (state) / `onCommit` (run analysis on blur/select). Switching kind clears any prior
 * path (valueForKind) so a stale entity/custom path can never be submitted under a different kind. Reuses
 * the canonical entity list + ENTITY_ROUTE — no second resolver.
 */
function PathPicker({ value, entities, onChange, onCommit }: { value: string; entities: LinkableEntities; onChange: (path: string) => void; onCommit?: (path: string) => void }) {
  const [kind, setKind] = useState<PickerKind>("custom");
  const list = isEntityKind(kind) ? entities[kind] : [];
  const setBoth = (p: string) => { onChange(p); onCommit?.(p); };
  const changeKind = (k: PickerKind) => { setKind(k); setBoth(valueForKind(k)); };
  return (
    <div className="seo-picker">
      <select aria-label="Destination type" value={kind} onChange={(e) => changeKind(e.target.value as PickerKind)}>
        <option value="custom">Custom path</option>
        <option value="home">Homepage</option>
        <option value="page">Page</option>
        <option value="product">Product</option>
        <option value="collection">Collection</option>
        <option value="chapter">Chapter</option>
      </select>
      {kind === "custom" ? (
        <input aria-label="Custom path" value={value} onChange={(e) => onChange(e.target.value)} onBlur={() => onCommit?.(value)} placeholder="/custom-path" />
      ) : kind === "home" ? (
        <span className="seo-picker__resolved">Homepage → <code>/</code></span>
      ) : (
        <>
          <select aria-label={`Choose ${kind}`} value="" onChange={(e) => e.target.value && setBoth(entityPath(kind, e.target.value))}>
            <option value="">Choose {kind}…</option>
            {list.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          {value ? <span className="seo-picker__resolved">→ <code>{value}</code></span> : null}
        </>
      )}
    </div>
  );
}

export function SeoRedirectsManager({ redirects, seo, entities, canPublish, origin }: { redirects: RedirectRowH[]; seo: SeoOverrideRow[]; entities: LinkableEntities; media?: MediaOption[]; canPublish: boolean; origin: string }) {
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
  const [advOpen, setAdvOpen] = useState(false); // Advanced sitemap disclosure — auto-opens when editing an override that already has values

  const notify = (t: SeoTab, notice: { tone: "ok" | "err" | "warn"; text: string } | null) => setNotices((s) => setTabNotice(s, t, notice));

  /** Mutate via the shared confirmation-loop client (same semantics as PageSeoPanel — one backend). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function api(body: Record<string, unknown>): Promise<{ ok: boolean; data: any }> {
    setBusy(true);
    const res = await postSeo(body, (msgs) => typeof window !== "undefined" && window.confirm(`${msgs.join("\n\n")}\n\nProceed anyway?`));
    setBusy(false);
    if (res.ok) startTransition(() => router.refresh());
    return res;
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
  const loadEffective = async (path: string) => {
    if (!path) { setEffective(null); return; }
    try { const r = await fetch("/api/admin/seo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "seo.effective", path }) }); const d = await r.json(); setEffective(d.effective ?? null); } catch { /* ignore */ }
  };
  const editSeo = (s: SeoOverrideRow) => { setNs({ path: s.path, title: s.title, description: s.description, ogImage: s.ogImage, robots: s.robots, canonical: s.canonical, sitemapPriority: s.sitemapPriority, changeFreq: s.changeFreq }); setAdvOpen(Boolean(s.sitemapPriority || s.changeFreq)); loadEffective(s.path); };
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
  const preview = draftPreview(effective, ns);
  // Deterministic issue count for the summary — no SEO score. Redirect problems (broken/chain) +
  // overrides that noindex a major route (a likely mistake). All from pure, already-computed data.
  const issues = redirects.filter((r) => r.health === "broken" || r.health === "chain").length
    + seo.filter((s) => isNoindex(s.robots) && isMajorRoute(s.path)).length;
  const activeCount = redirects.filter((r) => r.enabled).length;
  const overrideDups = useMemo(() => findOverrideDuplicates(seo.map((s) => ({ path: s.path, title: s.title, description: s.description }))), [seo]);

  return (
    <div className="cfg">
      <div className="seo-summary">
        <span className="seo-stat"><b>{activeCount}</b> active redirect{activeCount === 1 ? "" : "s"}</span>
        <span className="seo-stat"><b>{seo.length}</b> SEO override{seo.length === 1 ? "" : "s"}</span>
        <span className={`seo-stat${issues ? " seo-stat--warn" : ""}`}><b>{issues}</b> issue{issues === 1 ? "" : "s"}</span>
      </div>
      <nav className="ff-queues" role="tablist" aria-label="SEO & Redirects sections">
        <button type="button" role="tab" id="tab-redirects" aria-selected={tab === "redirects"} aria-controls="panel-redirects" className="ff-queue" data-active={tab === "redirects" ? "1" : "0"} onClick={() => setTab("redirects")}>Redirects</button>
        <button type="button" role="tab" id="tab-seo" aria-selected={tab === "seo"} aria-controls="panel-seo" className="ff-queue" data-active={tab === "seo" ? "1" : "0"} onClick={() => setTab("seo")}>Meta overrides</button>
        {note ? <span className={`cfg-msg cfg-msg--${note.tone}`} role="status" style={{ marginLeft: "auto" }}>{note.text}</span> : null}
      </nav>
      {undo ? <div className="seo-undo">{undo.text}. <button type="button" className="ff-link" onClick={undo.run}>Undo</button></div> : null}
      {!canPublish ? <p className="cfg-hint">You can review and validate here, but saving changes needs the <strong>content.publish</strong> capability.</p> : null}

      {tab === "redirects" ? (
        <div id="panel-redirects" role="tabpanel" aria-labelledby="tab-redirects">
          <div className="cfg-row" style={{ gridTemplateColumns: "1.3fr 1.6fr 0.9fr auto" }}>
            <label className="cfg-field"><span>From (old path)</span><input value={nr.fromPath} onChange={(e) => setNr({ ...nr, fromPath: e.target.value })} onBlur={() => analyzeR(nr)} placeholder="/old-path" /></label>
            <label className="cfg-field"><span>To (destination)</span>
              <PathPicker value={nr.toPath} entities={entities} onChange={(p) => setNr((r) => ({ ...r, toPath: p }))} onCommit={(p) => analyzeR({ ...nr, toPath: p })} />
            </label>
            <label className="cfg-field"><span>Type</span>
              <select value={nr.code} onChange={(e) => setNr({ ...nr, code: Number(e.target.value) })}>
                <option value={301}>301 — Permanent redirect</option>
                <option value={302}>302 — Temporary redirect</option>
              </select>
              <span className="cfg-hint">{nr.code === 302 ? "Temporary — use when the move is temporary." : "Permanent — use when the old URL has permanently moved."}</span>
            </label>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
              <button type="button" className="ff-btn ff-btn--primary" disabled={busy || !canPublish} onClick={saveRedirect}>{nr.id ? "Update redirect" : "Add redirect"}</button>
              {nr.id ? <button type="button" className="ff-btn" disabled={busy} onClick={() => { setNr(EMPTY_R); setRAnalysis(null); }}>Cancel</button> : null}
            </div>
          </div>

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
              {!redirects.length ? <tr><td colSpan={5}><div className="seo-empty"><strong>No redirects yet</strong><span>Redirect old URLs when a page moves or its URL changes. This helps visitors and search engines reach the correct page.</span></div></td></tr> : null}
            </tbody>
          </table>
          <p className="cfg-hint">Redirects apply within ~60s (cached in middleware) and run <strong>before</strong> the page renders. Loops and broken destinations are blocked; redirecting a live page asks for confirmation. Health is derived from the redirect graph — traffic metrics are deferred (post-launch).</p>
        </div>
      ) : (
        <div className="seo-editor" id="panel-seo" role="tabpanel" aria-labelledby="tab-seo">
          <section className="seo-group">
            <h4 className="seo-group__title">Route</h4>
            <label className="cfg-field" data-wide="1"><span>Which page is this SEO for?</span>
              <PathPicker value={ns.path} entities={entities} onChange={(p) => setNs((s) => ({ ...s, path: p }))} onCommit={(p) => loadEffective(p)} />
            </label>
          </section>

          <section className="seo-group">
            <h4 className="seo-group__title">Search appearance</h4>
            <label className="cfg-field" data-wide="1"><span>Meta title <CharCount value={ns.title} kind="title" /> {ns.title ? <button type="button" className="seo-reset" onClick={() => resetField("title")}>↺ inherited</button> : null}</span>
              <input value={ns.title} onChange={(e) => setNs({ ...ns, title: e.target.value })} /></label>
            <label className="cfg-field" data-wide="1"><span>Meta description <CharCount value={ns.description} kind="description" /> {ns.description ? <button type="button" className="seo-reset" onClick={() => resetField("description")}>↺ inherited</button> : null}</span>
              <textarea value={ns.description} onChange={(e) => setNs({ ...ns, description: e.target.value })} rows={2} /></label>
            <p className="seo-preview__cap admin__muted">Search preview</p>
            <SerpCard preview={preview} origin={origin} path={ns.path} />
            <p className="cfg-hint">Search engines may rewrite titles and descriptions — this is a guide, not a guarantee.</p>
          </section>

          <section className="seo-group">
            <h4 className="seo-group__title">Indexing &amp; canonical</h4>
            <RobotsControls value={ns.robots} onChange={(r) => setNs({ ...ns, robots: r })} />
            <p className="cfg-hint">Most storefront pages should stay Index + Follow.</p>
            <label className="cfg-field" data-wide="1"><span>Canonical URL {ns.canonical ? <button type="button" className="seo-reset" onClick={() => resetField("canonical")}>↺ inherited</button> : null}</span>
              <input value={ns.canonical} onChange={(e) => setNs({ ...ns, canonical: e.target.value })} placeholder="https://samorahstudio.com/…" />
              <span className="cfg-hint">Leave blank for normal pages. Set a canonical only when this page duplicates or closely matches another URL.</span></label>
          </section>

          <section className="seo-group">
            <h4 className="seo-group__title">Social sharing</h4>
            <div className="cfg-field" data-wide="1"><span>OG image {ns.ogImage ? <button type="button" className="seo-reset" onClick={() => resetField("ogImage")}>↺ inherited</button> : null}</span>
              <OgImageField value={ns.ogImage} onChange={(url) => setNs({ ...ns, ogImage: url })} /></div>
            <p className="seo-preview__cap admin__muted">Social preview</p>
            <SocialCard preview={preview} origin={origin} />
          </section>

          <details className="seo-group seo-details" open={advOpen} onToggle={(e) => setAdvOpen((e.target as HTMLDetailsElement).open)}>
            <summary className="seo-group__title">Advanced sitemap settings</summary>
            <div className="cfg-field" data-wide="1"><span>These tune this route in the generated sitemap.xml.</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input value={ns.sitemapPriority} onChange={(e) => setNs({ ...ns, sitemapPriority: e.target.value })} placeholder="priority (0–1)" aria-label="Sitemap priority" />
                <select value={ns.changeFreq} onChange={(e) => setNs({ ...ns, changeFreq: e.target.value })} aria-label="Change frequency">
                  <option value="">change frequency (default)</option>
                  {["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"].map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              {ns.sitemapPriority && (Number.isNaN(Number(ns.sitemapPriority)) || Number(ns.sitemapPriority) < 0 || Number(ns.sitemapPriority) > 1) ? <span className="cfg-msg cfg-msg--warn">Priority must be between 0 and 1 — an out-of-range value is ignored.</span> : null}
            </div>
          </details>

          <div className="cfg-actions">
            <button type="button" className="ff-btn ff-btn--primary" disabled={busy || !canPublish} onClick={saveSeo}>Save</button>
            {ns.path ? <button type="button" className="ff-btn ff-btn--ghost" disabled={busy} onClick={() => { setNs(EMPTY_S); setEffective(null); setAdvOpen(false); }}>Discard changes</button> : null}
          </div>

          {effective ? (
            <div className="seo-effective">
              <h3>Effective storefront SEO <span className="admin__muted">— what the storefront currently resolves for {ns.path || "this route"}</span></h3>
              {([["Title", effective.title], ["Description", effective.description], ["Canonical", effective.canonical], ["Robots", effective.robots], ["OG image", effective.ogImage]] as [string, EffectiveField][]).map(([label, f]) => (
                <div className="seo-eff-row" key={label}>
                  <span className="seo-eff-label">{label}</span>
                  <span className="seo-eff-value">{f.value ?? <em className="admin__muted">Inherited from page/entity</em>}</span>
                  <ProvenanceBadge f={f} />
                </div>
              ))}
              <p className="cfg-hint">From the same resolver the storefront uses (site defaults + this override). A value the page sets in code (e.g. an entity title) is shown honestly as “Inherited from page/entity”, not fabricated.</p>
            </div>
          ) : null}

          {overrideDups.length ? (
            <div className="cfg-validation" style={{ marginTop: 10 }}>
              {overrideDups.map((d, i) => <p key={i} className="cfg-msg cfg-msg--warn">⚠ Duplicate {d.field}: {d.paths.join(", ")} share “{d.value.length > 50 ? d.value.slice(0, 50) + "…" : d.value}”.</p>)}
              <p className="admin__muted" style={{ fontSize: 11 }}>Checks your stored overrides only — not a full-site duplicate scan (effective titles of un-overridden routes aren’t stored).</p>
            </div>
          ) : null}
          <table className="admin__table admin__table--board" style={{ marginTop: 10 }}>
            <thead><tr><th>Route</th><th>Search title</th><th>Indexing</th><th>Overrides</th><th></th></tr></thead>
            <tbody>
              {seo.map((s) => {
                const rc = parseRobots(s.robots);
                const fields = [s.title && "Title", s.description && "Desc", s.ogImage && "OG", s.canonical && "Canonical"].filter(Boolean).join(" · ");
                return (
                  <tr key={s.path}>
                    <td className="admin__mono">{s.path}</td>
                    <td>{s.title || <span className="admin__muted">—</span>}</td>
                    <td className={rc.index ? "" : "admin__warn"}>{rc.index ? "Index" : "Noindex"} · {rc.follow ? "Follow" : "Nofollow"}</td>
                    <td className="admin__muted">{fields || "—"}</td>
                    <td><div className="rowactions"><button type="button" className="ff-btn ff-btn--sm" disabled={busy} onClick={() => editSeo(s)}>Edit</button>
                      <KebabMenu items={[{ label: "Remove override", onClick: () => deleteSeo(s), danger: true, disabled: !canPublish }]} /></div></td>
                  </tr>
                );
              })}
              {!seo.length ? <tr><td colSpan={5}><div className="seo-empty"><strong>No SEO overrides yet</strong><span>Routes use the global SEO defaults (Settings). Add an override to customise a specific page’s search &amp; social appearance.</span></div></td></tr> : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
