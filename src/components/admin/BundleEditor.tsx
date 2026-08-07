"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MediaPicker } from "@/components/admin/MediaPicker";
import { BundlePreview } from "@/components/bundle/BundlePreview";
import { computeBundleHealth } from "@/lib/bundleHealth";
import { shouldGuardNavigation } from "@/lib/bundleNavGuard";
import { resolveTokens, type BundleConfig, type BundleVesselConfig } from "@/lib/bundleConfig";
import { BUNDLE_DISCOUNT_PCT, type BundleCandle } from "@/lib/bundle";
import {
  isDirty, publicationLabel, afterEdit, afterDiscard, afterSave, afterReset, afterPublish,
  afterRestoreToDraft, afterRestorePublish, type EditorState,
} from "@/lib/bundleEditorState";
import type { BundleAdminState } from "@/services/bundleAdminService";

type Device = "desktop" | "tablet" | "mobile";
type Rev = { id: string; label: string | null; actorId: string | null; createdAt: string };
const DEVICE_W: Record<Device, number> = { desktop: 1280, tablet: 834, mobile: 390 };
const clone = (c: BundleConfig): BundleConfig => JSON.parse(JSON.stringify(c));
// Admin revision timestamp format (shared by the revision list and the Restore+Publish confirmation).
const fmtRevTime = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export function BundleEditor({
  initial,
  candles,
  mediaUrls: initialMedia,
  canPublish,
}: {
  initial: BundleAdminState;
  candles: BundleCandle[];
  mediaUrls: Record<string, string>;
  canPublish: boolean;
}) {
  const [st, setSt] = useState<EditorState>(() => ({ draft: clone(initial.draft), saved: clone(initial.draft), published: initial.published }));
  const { draft, published } = st;
  const [media, setMedia] = useState<Record<string, string>>(initialMedia);
  const [device, setDevice] = useState<Device>("desktop");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn" | "err"; text: string } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [picker, setPicker] = useState<null | ((url: string, assetId?: string) => void)>(null);
  const [revs, setRevs] = useState<Rev[] | null>(null);
  const [showPreviewMobile, setShowPreviewMobile] = useState(false); // narrow-screen Edit/Preview toggle

  const dirty = isDirty(st);
  const neverPublished = !published;
  const publicationState = publicationLabel(st);
  const health = useMemo(() => computeBundleHealth(draft, candles), [draft, candles]);
  const canPub = canPublish && health.errors.length === 0 && !busy;

  // Warn before leaving with unsaved edits (browser refresh / tab close).
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // In-app navigation guard (Phase 2A-1): confirm before an unsaved draft is discarded by client-side
  // navigation to another admin page. Component-local capture-phase click listener (the established
  // PageBuilder pattern) — beats the Next <Link> handler; no router/history monkey-patching, no shell
  // change. Dirty is read from a ref so the once-installed listener always sees the current unsaved
  // state (isDirty(st) is the sole authority). Browser Back/Forward is out of scope here (covered, if
  // at all, by beforeunload) — guarding it would require history interception, which we deliberately avoid.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!dirtyRef.current) return;
      const a = (e.target as HTMLElement)?.closest?.("a") as HTMLAnchorElement | null;
      if (!a) return;
      const guard = shouldGuardNavigation(
        { button: e.button, modified: e.metaKey || e.ctrlKey || e.shiftKey || e.altKey, rawHref: a.getAttribute("href"), absoluteHref: a.href, target: a.target || null, download: a.hasAttribute("download") },
        { origin: window.location.origin, pathname: window.location.pathname },
      );
      if (guard && !window.confirm("You have unsaved Bundle changes. Leave without saving?")) { e.preventDefault(); e.stopPropagation(); }
    };
    document.addEventListener("click", onDocClick, true);
    return () => document.removeEventListener("click", onDocClick, true);
  }, []);

  // ── immutable draft updates (afterEdit keeps the pure state-machine semantics) ──
  const update = useCallback((fn: (d: BundleConfig) => void) => setSt((prev) => { const n = clone(prev.draft); fn(n); return afterEdit(prev, n); }), []);
  const openPicker = (onPick: (url: string, assetId?: string) => void) => setPicker(() => onPick);

  const api = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/admin/bundles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      const body = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, body };
    } finally { setBusy(false); }
  };

  const doSave = async () => {
    const r = await api("save", { config: draft });
    if (r.ok) { setSt(afterSave); setMsg({ tone: "ok", text: "Draft saved. The live Bundle page is unchanged." }); }
    else setMsg({ tone: "err", text: r.body.error ?? r.body.reason ?? "Could not save draft." });
  };
  const doDiscard = () => { setSt(afterDiscard); setWarnings([]); setMsg({ tone: "ok", text: "Unsaved edits discarded." }); }; // client-only
  const doReset = async () => {
    if (!window.confirm("This replaces the current Bundle draft with the default Bundle configuration. Your live Bundle page will not change until you publish.")) return;
    const r = await api("reset");
    if (r.ok) { setSt(afterReset); setMsg({ tone: "ok", text: "Draft reset to default. Publish to make it live." }); }
    else setMsg({ tone: "err", text: r.body.error ?? "Could not reset." });
  };
  const doPublish = async () => {
    const r = await api("publish", { config: draft });
    if (r.ok) { setSt(afterPublish); setWarnings(r.body.warnings ?? []); setMsg({ tone: (r.body.warnings?.length ? "warn" : "ok"), text: r.body.warnings?.length ? "Published live — with warnings (see below)." : "Published live." }); }
    else setMsg({ tone: "err", text: (r.body.errors?.[0]) ?? r.body.error ?? "Publish blocked." });
  };
  const loadRevs = async () => { const r = await api("revisions"); if (r.ok) setRevs(r.body.revisions ?? []); };
  const restoreDraft = async (id: string) => { const r = await api("restore", { revisionId: id }); if (r.ok) { const g = await api("load"); if (g.ok) setSt((prev) => afterRestoreToDraft(prev, g.body.draft)); setMsg({ tone: "ok", text: "Revision restored to draft (live unchanged)." }); } else setMsg({ tone: "err", text: r.body.error ?? "Restore failed." }); };
  const restorePublish = async (id: string) => {
    // Phase 2A-2: an explicit confirmation gates the LIVE-changing action. Cancel → zero restore.publish
    // request, zero editor/live-state mutation. Confirm → the existing canonical action, invoked once.
    const rev = revs?.find((x) => x.id === id);
    const when = rev ? fmtRevTime(rev.createdAt) : "the selected revision";
    if (!window.confirm(`Restore the revision from ${when} and make it the LIVE Bundle page? This replaces the currently published configuration.`)) return;
    const r = await api("restore.publish", { revisionId: id });
    if (r.ok) { const g = await api("load"); if (g.ok) setSt((prev) => afterRestorePublish(prev, g.body.draft)); setMsg({ tone: "ok", text: "Revision restored and published live." }); }
    else setMsg({ tone: "err", text: (r.body.errors?.[0]) ?? r.body.error ?? "Restore+publish failed." });
  };

  const pickInto = (setId: (id: string | undefined) => void) => openPicker((url, assetId) => { setId(assetId); if (assetId) setMedia((m) => ({ ...m, [assetId]: url })); });

  // ── scaled preview stage ──
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageW, setStageW] = useState(0);
  useEffect(() => {
    const el = stageRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setStageW(el.clientWidth)); ro.observe(el); setStageW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const devW = DEVICE_W[device];
  const scale = stageW > 0 ? Math.min(1, stageW / devW) : 1;

  return (
    <main className="admin be">
      <header className="admin__head be-head">
        <div>
          <h1 className="admin__title">Bundle Page Editor</h1>
          <p className="admin__count">
            <span className="be-status" data-s={neverPublished ? "never" : publicationState === "Published — live" ? "live" : "draft"}>{publicationState}</span>
            {dirty ? <span className="be-status be-status--unsaved">● Unsaved edits</span> : null}
          </p>
        </div>
        <div className="be-actions">
          <button className="ff-btn ff-btn--mini" onClick={doDiscard} disabled={!dirty || busy}>Discard changes</button>
          <button className="ff-btn ff-btn--mini" onClick={doReset} disabled={busy}>Reset draft to default</button>
          <button className="ff-btn" onClick={doSave} disabled={!dirty || busy}>Save draft</button>
          <button className="ff-btn ff-btn--primary" onClick={doPublish} disabled={!canPub} title={!canPublish ? "Requires content.publish" : health.errors.length ? "Resolve errors first" : ""}>Publish</button>
        </div>
      </header>
      {msg ? <p className={`cfg-msg cfg-msg--${msg.tone} be-msg`} role="status">{msg.text}</p> : null}

      {/* Narrow-screen Edit/Preview toggle */}
      <div className="be-switch">
        <button className={`pe-live__dev${!showPreviewMobile ? " is-active" : ""}`} onClick={() => setShowPreviewMobile(false)}>Edit</button>
        <button className={`pe-live__dev${showPreviewMobile ? " is-active" : ""}`} onClick={() => setShowPreviewMobile(true)}>Preview</button>
      </div>

      <div className="be-split">
        {/* ── LEFT: editor ── */}
        <div className="be-editor" data-hide={showPreviewMobile}>
          {/* Health */}
          <section className="be-sec">
            <h2 className="be-sec__title">Publish health</h2>
            <p className="admin__muted be-health__meta">Eligible candles: {health.eligibleTotal} · Discount: {BUNDLE_DISCOUNT_PCT}% (canonical) {health.vessels.filter((v) => !v.comingSoon).map((v) => `· ${v.name}: ${v.sellable}/${v.eligible} in stock`).join(" ")}</p>
            {health.errors.map((e, i) => <p key={i} className="be-flag be-flag--err">✕ {e}</p>)}
            {[...health.warnings, ...warnings].map((w, i) => <p key={i} className="be-flag be-flag--warn">! {w}</p>)}
            {!health.errors.length && !health.warnings.length ? <p className="be-flag be-flag--ok">✓ No configuration issues.</p> : null}
          </section>

          {/* Hero */}
          <section className="be-sec">
            <h2 className="be-sec__title">Hero</h2>
            <Field label="Eyebrow" value={draft.hero.eyebrow} onChange={(v) => update((d) => { d.hero.eyebrow = v; })} />
            <Field label="Heading (use a line break for two lines)" textarea value={draft.hero.heading} onChange={(v) => update((d) => { d.hero.heading = v; })} />
            <Field label="Body" textarea value={draft.hero.body} onChange={(v) => update((d) => { d.hero.body = v; })} hint={`Use {{discount_pct}} for the discount — it resolves to ${BUNDLE_DISCOUNT_PCT}% (canonical). Preview: “${resolveTokens(draft.hero.body)}”`} />
            <MediaField label="Desktop hero image" id={draft.hero.imageId} url={draft.hero.imageId ? media[draft.hero.imageId] : undefined} onPick={() => pickInto((id) => update((d) => { d.hero.imageId = id ?? null; }))} onClear={() => update((d) => { d.hero.imageId = null; })} fallback="Bundle gradient" />
            <MediaField label="Mobile hero image (optional)" id={draft.hero.imageMobileId} url={draft.hero.imageMobileId ? media[draft.hero.imageMobileId] : undefined} onPick={() => pickInto((id) => update((d) => { d.hero.imageMobileId = id ?? null; }))} onClear={() => update((d) => { d.hero.imageMobileId = null; })} fallback="Desktop hero → gradient" />
            <Field label="Hero image alt text" value={draft.hero.alt ?? ""} onChange={(v) => update((d) => { d.hero.alt = v || null; })} />
          </section>

          {/* Strip */}
          <section className="be-sec">
            <h2 className="be-sec__title">Discovery strip</h2>
            {draft.strip.map((s, i) => (
              <div key={i} className="be-row">
                <input className="be-input" value={s} onChange={(e) => update((d) => { d.strip[i] = e.target.value; })} aria-label={`Strip item ${i + 1}`} />
                <button className="ff-btn ff-btn--mini" onClick={() => update((d) => { if (i > 0) [d.strip[i - 1], d.strip[i]] = [d.strip[i], d.strip[i - 1]]; })} disabled={i === 0} aria-label="Move up">↑</button>
                <button className="ff-btn ff-btn--mini" onClick={() => update((d) => { if (i < d.strip.length - 1) [d.strip[i + 1], d.strip[i]] = [d.strip[i], d.strip[i + 1]]; })} disabled={i === draft.strip.length - 1} aria-label="Move down">↓</button>
                <button className="ff-btn ff-btn--mini ff-btn--danger" onClick={() => update((d) => { d.strip.splice(i, 1); })} aria-label="Remove">✕</button>
              </div>
            ))}
            <button className="ff-btn ff-btn--mini" onClick={() => update((d) => { d.strip.push("New item"); })}>+ Add strip item</button>
          </section>

          {/* Vessel section */}
          <section className="be-sec">
            <h2 className="be-sec__title">Vessel section</h2>
            <Field label="Eyebrow" value={draft.vesselSection.eyebrow} onChange={(v) => update((d) => { d.vesselSection.eyebrow = v; })} />
            <Field label="Heading" value={draft.vesselSection.heading} onChange={(v) => update((d) => { d.vesselSection.heading = v; })} />
            {[...draft.vessels].sort((a, b) => a.displayOrder - b.displayOrder).map((v) => {
              const idx = draft.vessels.findIndex((x) => x.key === v.key);
              const setV = (fn: (vv: BundleVesselConfig) => void) => update((d) => fn(d.vessels[idx]));
              const move = (dir: number) => update((d) => {
                const sorted = [...d.vessels].sort((a, b) => a.displayOrder - b.displayOrder);
                const pos = sorted.findIndex((x) => x.key === v.key); const swap = sorted[pos + dir]; if (!swap) return;
                const a = d.vessels.find((x) => x.key === v.key)!; const b = d.vessels.find((x) => x.key === swap.key)!;
                [a.displayOrder, b.displayOrder] = [b.displayOrder, a.displayOrder];
              });
              return (
                <div key={v.key} className="be-card">
                  <div className="be-card__head"><strong>{v.key}</strong> <span className="admin__muted">(identity — canonical)</span>
                    <span className="be-spacer" />
                    <button className="ff-btn ff-btn--mini" onClick={() => move(-1)} aria-label="Move vessel up">↑</button>
                    <button className="ff-btn ff-btn--mini" onClick={() => move(1)} aria-label="Move vessel down">↓</button>
                  </div>
                  <Field label="Name override" value={v.nameOverride ?? ""} onChange={(val) => setV((vv) => { vv.nameOverride = val || null; })} placeholder="Use default" />
                  <Field label="Blurb override" value={v.blurbOverride ?? ""} onChange={(val) => setV((vv) => { vv.blurbOverride = val || null; })} placeholder="Use default" />
                  <MediaField label="Vessel image (optional)" id={v.imageId} url={v.imageId ? media[v.imageId] : undefined} onPick={() => pickInto((id) => setV((vv) => { vv.imageId = id ?? null; }))} onClear={() => setV((vv) => { vv.imageId = null; })} fallback="None" />
                  <label className="be-check"><input type="checkbox" checked={!!v.comingSoon} onChange={(e) => setV((vv) => { vv.comingSoon = e.target.checked; })} /> Coming soon (presentation only — cannot make an unavailable vessel purchasable)</label>
                </div>
              );
            })}
          </section>

          {/* Candle section */}
          <section className="be-sec">
            <h2 className="be-sec__title">Candle section</h2>
            <Field label="Heading" value={draft.candleSection.heading} onChange={(v) => update((d) => { d.candleSection.heading = v; })} />
            <Field label="Size line" value={draft.candleSection.sizeLine} onChange={(v) => update((d) => { d.candleSection.sizeLine = v; })} />
            <p className="admin__muted om-field__hint">The “{`{material}`} Collection” eyebrow and the “N Available” count are generated at runtime — not editable.</p>
          </section>

          {/* Flow copy */}
          <section className="be-sec">
            <h2 className="be-sec__title">Composer / flow copy</h2>
            <Field label="Empty hint" value={draft.flowCopy.emptyHint} onChange={(v) => update((d) => { d.flowCopy.emptyHint = v; })} />
            <Field label="Complete line" value={draft.flowCopy.completeLine} onChange={(v) => update((d) => { d.flowCopy.completeLine = v; })} />
            <Field label="Footer line" value={draft.flowCopy.footerLine} onChange={(v) => update((d) => { d.flowCopy.footerLine = v; })} hint={`Preview: “${resolveTokens(draft.flowCopy.footerLine)}”`} />
            <Field label="Editing note" value={draft.flowCopy.editingNote} onChange={(v) => update((d) => { d.flowCopy.editingNote = v; })} />
          </section>

          {/* Candle merchandising */}
          <section className="be-sec">
            <h2 className="be-sec__title">Candle merchandising</h2>
            <p className="admin__muted om-field__hint">Products, identity, price, chapter and stock are canonical (read-only). You can reorder, exclude, and override the card description/image only.</p>
            {orderedCandles(candles, draft).map((c, i, arr) => {
              const ov = draft.productOverrides?.[c.id];
              const usingOverride = !!(ov && ov.cardDescription != null);
              const stockBadge = c.vessels.some((o) => o.inStock) ? (c.vessels.every((o) => o.inStock) ? "in stock" : "some OOS") : "out of stock";
              return (
                <div key={c.id} className="be-card" data-excluded={draft.excludedProductIds?.includes(c.id) ? "1" : "0"}>
                  <div className="be-card__head">
                    <strong>{c.name}</strong>
                    <span className="admin__muted"> · {c.chapter ? c.chapter.short : "—"} · <span data-stock={stockBadge}>{stockBadge}</span></span>
                    <span className="be-spacer" />
                    <button className="ff-btn ff-btn--mini" onClick={() => reorder(draft, c.id, -1, arr, update)} disabled={i === 0} aria-label="Move up">↑</button>
                    <button className="ff-btn ff-btn--mini" onClick={() => reorder(draft, c.id, 1, arr, update)} disabled={i === arr.length - 1} aria-label="Move down">↓</button>
                  </div>
                  <label className="be-check"><input type="checkbox" checked={draft.excludedProductIds?.includes(c.id) ?? false} onChange={(e) => update((d) => { const set = new Set(d.excludedProductIds ?? []); e.target.checked ? set.add(c.id) : set.delete(c.id); d.excludedProductIds = [...set]; })} /> Exclude from this bundle</label>
                  <div className="be-inherit">
                    <label className="be-check"><input type="radio" checked={!usingOverride} onChange={() => update((d) => { if (d.productOverrides?.[c.id]) delete d.productOverrides[c.id].cardDescription; })} /> Use product description<span className="admin__muted"> — “{c.tagline ?? "—"}”</span></label>
                    <label className="be-check"><input type="radio" checked={usingOverride} onChange={() => update((d) => { d.productOverrides = d.productOverrides ?? {}; d.productOverrides[c.id] = { ...d.productOverrides[c.id], cardDescription: ov?.cardDescription ?? (c.tagline ?? "") }; })} /> Override for this bundle</label>
                    {usingOverride ? <textarea className="be-input" value={ov?.cardDescription ?? ""} onChange={(e) => update((d) => { d.productOverrides = d.productOverrides ?? {}; d.productOverrides[c.id] = { ...d.productOverrides[c.id], cardDescription: e.target.value }; })} aria-label={`${c.name} card description override`} /> : null}
                  </div>
                  <MediaField label="Card image override" id={ov?.imageId ?? null} url={ov?.imageId ? media[ov.imageId] : undefined} onPick={() => pickInto((id) => update((d) => { d.productOverrides = d.productOverrides ?? {}; d.productOverrides[c.id] = { ...d.productOverrides[c.id], imageId: id ?? null }; }))} onClear={() => update((d) => { if (d.productOverrides?.[c.id]) delete d.productOverrides[c.id].imageId; })} fallback="Product image → gradient" />
                </div>
              );
            })}
          </section>

          {/* Revisions */}
          <section className="be-sec">
            <h2 className="be-sec__title">Revision history <button className="ff-btn ff-btn--mini" onClick={loadRevs} disabled={busy}>Load</button></h2>
            {revs === null ? <p className="admin__muted">Publish snapshots appear here.</p> : revs.length === 0 ? <p className="admin__muted">No revisions yet (created on publish).</p> : (
              <ul className="be-revs">
                {revs.map((r) => (
                  <li key={r.id} className="be-row">
                    <span className="admin__muted">{fmtRevTime(r.createdAt)}{r.actorId ? " · staff" : ""}</span>
                    <span className="be-spacer" />
                    <button className="ff-btn ff-btn--mini" onClick={() => restoreDraft(r.id)} disabled={busy}>Restore to draft</button>
                    {canPublish ? <button className="ff-btn ff-btn--mini" onClick={() => restorePublish(r.id)} disabled={busy}>Restore + publish</button> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* ── RIGHT: live preview ── */}
        <div className="be-preview" data-hide={!showPreviewMobile}>
          <div className="pe-live__bar">
            <div className="pe-live__devices">
              {(["desktop", "tablet", "mobile"] as Device[]).map((dk) => (
                <button key={dk} className={`pe-live__dev${device === dk ? " is-active" : ""}`} onClick={() => setDevice(dk)}>{dk[0].toUpperCase() + dk.slice(1)}</button>
              ))}
            </div>
            <span className="pe-live__hint">Live draft · not saved · preview interactions are isolated</span>
          </div>
          <div className="be-stage" ref={stageRef}>
            {/* zoom (not transform) so the scaled preview also drives layout height → the stage scrolls
                naturally. Desktop width renders the true desktop bundle layout scaled to fit the column. */}
            <div className="be-stage__inner" style={{ width: devW, zoom: scale }}>
              <BundlePreview config={draft} candles={candles} mediaUrls={media} />
            </div>
          </div>
        </div>
      </div>

      {picker ? <MediaPicker open kind="image" onSelect={(url, _f, _fm, _mu, assetId) => picker(url, assetId)} onClose={() => setPicker(null)} /> : null}
    </main>
  );
}

// ── small field components ──
function Field({ label, value, onChange, textarea, hint, placeholder }: { label: string; value: string; onChange: (v: string) => void; textarea?: boolean; hint?: string; placeholder?: string }) {
  return (
    <label className="cfg-field be-field">
      <span>{label}</span>
      {textarea ? <textarea className="be-input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /> : <input className="be-input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />}
      {hint ? <span className="admin__muted om-field__hint">{hint}</span> : null}
    </label>
  );
}
function MediaField({ label, id, url, onPick, onClear, fallback }: { label: string; id: string | null | undefined; url: string | undefined; onPick: () => void; onClear: () => void; fallback: string }) {
  return (
    <div className="cfg-field be-field">
      <span>{label}</span>
      <div className="be-media">
        {id && url ? <img src={url} alt="" className="be-media__thumb" /> : <span className="be-media__none">Fallback: {fallback}</span>}
        <button type="button" className="ff-btn ff-btn--mini" onClick={onPick}>{id ? "Replace" : "Choose media"}</button>
        {id ? <button type="button" className="ff-btn ff-btn--mini ff-btn--danger" onClick={onClear}>Remove</button> : null}
      </div>
      {id && !url ? <span className="be-flag be-flag--warn">! Referenced media is missing — the fallback is used.</span> : null}
    </div>
  );
}

// ── merchandising ordering helpers (display order → productOrder edits) ──
function orderedCandles(candles: BundleCandle[], cfg: BundleConfig): BundleCandle[] {
  const idx = new Map((cfg.productOrder ?? []).map((id, i) => [id, i]));
  return [...candles].sort((a, b) => (idx.has(a.id) ? idx.get(a.id)! : Infinity) - (idx.has(b.id) ? idx.get(b.id)! : Infinity));
}
function reorder(cfg: BundleConfig, id: string, dir: number, arr: BundleCandle[], update: (fn: (d: BundleConfig) => void) => void) {
  const ids = arr.map((c) => c.id);
  const pos = ids.indexOf(id); const swap = pos + dir; if (swap < 0 || swap >= ids.length) return;
  [ids[pos], ids[swap]] = [ids[swap], ids[pos]];
  update((d) => { d.productOrder = ids; });
}
