"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { NavBranch, NavItem, FooterSection, MenuAdminView, LinkableEntities, EntityType, LinkAttrs, MenuRevision, FooterMeta } from "@/services/navigationService";
import { istLocalToUtc, formatIST } from "@/lib/istTime";
import { MediaPicker } from "@/components/admin/MediaPicker";
import { LivePreviewPanel } from "@/components/admin/LivePreviewPanel";

const gradName = (g: string) => g.replace(/^grad-/, "").replace(/^\w/, (c) => c.toUpperCase());

/** Miniature campaign-panel preview — reuses the real gradient class + selected media so the preview
 *  cannot visually diverge from the storefront campaign panel (point 21). */
function MiniCampaign({ campaign }: { campaign: NavBranch["campaign"] }) {
  const style = campaign.image ? { backgroundImage: `url(${campaign.image})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined;
  return (
    <div className={`nav-campaign-mini ${campaign.image ? "" : campaign.gradient || ""}`} style={style}>
      <span className="nav-campaign-mini__eyebrow">{campaign.eyebrow || "Eyebrow"}</span>
      <span className="nav-campaign-mini__title">{campaign.title || "Campaign title"}</span>
      <span className="nav-campaign-mini__desc">{campaign.description || "Description…"}</span>
    </div>
  );
}

/** Flatten a nav/footer snapshot to a set of "branch ▸ label → href" strings, for a lightweight diff. */
function flattenNav(tree: any[]): Set<string> {
  const out = new Set<string>();
  for (const node of tree ?? []) {
    const branch = node.label ?? node.title ?? node.id ?? "";
    const items = node.items ?? node.links ?? [];
    for (const it of items) out.add(`${branch} ▸ ${it.label ?? ""} → ${it.href ?? (it.entity ? `${it.entity.type}:${it.entity.id}` : "")}`);
    if (node.campaign) out.add(`${branch} ▸ [campaign] ${node.campaign.title ?? ""} → ${node.campaign.href ?? ""}`);
  }
  return out;
}
/** Short human diff between two snapshots (newer vs older). */
function diffRevisions(newer: any[], older: any[] | undefined): string {
  if (!older) return "First published version";
  const a = flattenNav(newer), b = flattenNav(older);
  let added = 0, removed = 0;
  for (const x of a) if (!b.has(x)) added++;
  for (const x of b) if (!a.has(x)) removed++;
  if (!added && !removed) return "No link changes";
  return [added ? `+${added} link${added > 1 ? "s" : ""}` : "", removed ? `−${removed} link${removed > 1 ? "s" : ""}` : ""].filter(Boolean).join(", ");
}

const ENTITY_TYPES: EntityType[] = ["page", "chapter", "collection", "product"];
const ENTITY_LABEL: Record<EntityType, string> = { page: "Page", chapter: "Chapter", collection: "Collection", product: "Product" };

/**
 * PRIMARY destination control (point 1) — pick a canonical entity (Page/Chapter/Collection/Product) so
 * the URL is derived and can't be mistyped; "Custom URL" is the escape hatch for unusual destinations.
 * Entity links store the slug (not a frozen path), so a later slug change resolves automatically.
 */
function DestinationPicker({ link, entities, onChange }: { link: LinkAttrs & { href?: string }; entities: LinkableEntities; onChange: (patch: Partial<LinkAttrs & { href?: string }>) => void }) {
  const isEntity = link.linkType === "entity";
  const et = link.entity?.type ?? "page";
  const kind = isEntity ? et : "url";
  return (
    <div className="nav-dest">
      <select className="nav-dest__kind" value={kind} onChange={(e) => {
        const v = e.target.value;
        if (v === "url") onChange({ linkType: "url", entity: undefined });
        else { const t = v as EntityType; onChange({ linkType: "entity", entity: { type: t, id: entities[t]?.[0]?.id ?? "" } }); }
      }}>
        {ENTITY_TYPES.map((t) => <option key={t} value={t}>{ENTITY_LABEL[t]}</option>)}
        <option value="url">Custom URL</option>
      </select>
      {isEntity ? (
        <select className="nav-dest__val" value={link.entity?.id ?? ""} onChange={(e) => onChange({ entity: { type: et, id: e.target.value } })}>
          {(entities[et] ?? []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          {(entities[et] ?? []).length === 0 ? <option value="">(none available)</option> : null}
        </select>
      ) : (
        <input className="nav-dest__val" value={link.href ?? ""} onChange={(e) => onChange({ href: e.target.value })} placeholder="/custom-path or https://…" />
      )}
    </div>
  );
}

/** SEO attributes popover (point 11) — new-tab + nofollow. Destination is chosen inline via DestinationPicker. */
function LinkEditor({ link, onChange }: { link: LinkAttrs; onChange: (patch: Partial<LinkAttrs>) => void }) {
  return (
    <div className="nav-linkedit">
      <span className="admin__muted">SEO:</span>
      <label className="nav-linkedit__chk"><input type="checkbox" checked={link.target === "_blank"} onChange={(e) => onChange({ target: e.target.checked ? "_blank" : undefined })} /> new tab</label>
      <label className="nav-linkedit__chk"><input type="checkbox" checked={!!link.nofollow} onChange={(e) => onChange({ nofollow: e.target.checked })} /> nofollow</label>
    </div>
  );
}

const TIERS = ["", "parent", "child", "cta"];
const GRADS = ["grad-chai", "grad-gajar", "grad-air", "grad-smoke", "grad-story"];

function move<T>(arr: T[], i: number, dir: number): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
// Schedule times are entered/read in IST (fixed +05:30) and stored canonically as UTC — same discipline
// as Coupons. istLocalToUtc turns a datetime-local IST wall-clock into a UTC ISO string.
const schedUtc = (v: string) => (v ? istLocalToUtc(v) : null);

export function NavigationManager({ header, footer, entities, canPublish = true, footerMeta }: { header: MenuAdminView; footer: MenuAdminView; entities: LinkableEntities; canPublish?: boolean; footerMeta: FooterMeta }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<"header" | "footer">("header");
  const [openLink, setOpenLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: string; text: string } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [hdr, setHdr] = useState<NavBranch[]>(header.draft as NavBranch[]);
  const [ftr, setFtr] = useState<FooterSection[]>(footer.draft as FooterSection[]);
  const [pubAt, setPubAt] = useState("");
  const [unpubAt, setUnpubAt] = useState("");
  const [revs, setRevs] = useState<MenuRevision[] | null>(null);
  const [openRev, setOpenRev] = useState<string | null>(null); // preview-before-restore expansion
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set()); // collapsed branches (P1)
  const [mediaFor, setMediaFor] = useState<number | null>(null); // campaign media picker target branch (point 20)
  const [showPreview, setShowPreview] = useState(false); // device-framed storefront preview (point 15)
  const [fm, setFm] = useState<FooterMeta>(footerMeta); // editable footer text (tagline/copyright/made-in)
  const [dragItem, setDragItem] = useState<{ bi: number; ii: number } | null>(null); // drag-reorder within a branch
  const toggleCollapse = (k: string) => setCollapsed((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const dropItem = (bi: number, target: number) => {
    if (!dragItem || dragItem.bi !== bi || dragItem.ii === target) { setDragItem(null); return; }
    setHdr((h) => h.map((b, i) => { if (i !== bi) return b; const items = [...b.items]; const [m] = items.splice(dragItem.ii, 1); items.splice(target, 0, m); return { ...b, items }; }));
    setDragItem(null);
  };
  const [savedAt, setSavedAt] = useState<string | null>(null); // ✓ Draft saved · time (point 23)
  const [undo, setUndo] = useState<{ text: string; run: () => void } | null>(null); // draft-only Undo (point 22)
  const stampSaved = () => setSavedAt(new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }));
  // Deep clone with fresh " (copy)" label; branch clones also get a fresh stable id (point 24).
  const cloneBranch = (b: NavBranch): NavBranch => ({ ...JSON.parse(JSON.stringify(b)), id: `${b.id || "branch"}-copy-${Math.abs((JSON.stringify(hdr).length * 31 + b.items.length))%9973}`, label: `${b.label} (copy)` });
  const clone = <T extends { label?: string; title?: string }>(x: T): T => { const c = JSON.parse(JSON.stringify(x)); if (c.label != null) c.label = `${c.label} (copy)`; if (c.title != null) c.title = `${c.title} (copy)`; return c; };
  // Remove a header branch with impact-aware confirm + draft-only Undo (no save/revision until Save).
  const removeBranch = (bi: number) => {
    const b = hdr[bi]; const n = b.items.length;
    if (!window.confirm(`Remove "${b.label || b.id}"? This removes ${n} link${n === 1 ? "" : "s"}${b.campaign?.title ? " and its campaign panel" : ""} from this draft.`)) return;
    const snapshot = hdr;
    setHdr((h) => h.filter((_, i) => i !== bi));
    setUndo({ text: `Removed "${b.label || b.id}"`, run: () => { setHdr(snapshot); setUndo(null); } });
  };
  const removeColumn = (si: number) => {
    const s = ftr[si]; const n = s.links.length;
    if (!window.confirm(`Remove "${s.title}"? This removes ${n} link${n === 1 ? "" : "s"} from this draft.`)) return;
    const snapshot = ftr;
    setFtr((f) => f.filter((_, i) => i !== si));
    setUndo({ text: `Removed "${s.title}"`, run: () => { setFtr(snapshot); setUndo(null); } });
  };
  const removeItem = (bi: number, ii: number) => { const snapshot = hdr; setHdr((h) => h.map((b, i) => (i === bi ? { ...b, items: b.items.filter((_, j) => j !== ii) } : b))); setUndo({ text: "Link removed", run: () => { setHdr(snapshot); setUndo(null); } }); };
  const removeFtrLink = (si: number, li: number) => { const snapshot = ftr; setFtr((f) => f.map((x, i) => (i === si ? { ...x, links: x.links.filter((_, j) => j !== li) } : x))); setUndo({ text: "Link removed", run: () => { setFtr(snapshot); setUndo(null); } }); };
  // Drag-reorder for branches + footer columns/links (point 18); ↑ ↓ remain the accessible fallback.
  const [dragBranch, setDragBranch] = useState<number | null>(null);
  const dropBranch = (target: number) => { if (dragBranch === null || dragBranch === target) { setDragBranch(null); return; } setHdr((h) => { const a = [...h]; const [m] = a.splice(dragBranch, 1); a.splice(target, 0, m); return a; }); setDragBranch(null); };
  const [dragCol, setDragCol] = useState<number | null>(null);
  const dropCol = (target: number) => { if (dragCol === null || dragCol === target) { setDragCol(null); return; } setFtr((f) => { const a = [...f]; const [m] = a.splice(dragCol, 1); a.splice(target, 0, m); return a; }); setDragCol(null); };
  const [dragFtr, setDragFtr] = useState<{ si: number; li: number } | null>(null);
  const dropFtrLink = (si: number, target: number) => { if (!dragFtr || dragFtr.si !== si || dragFtr.li === target) { setDragFtr(null); return; } setFtr((f) => f.map((x, i) => (i === si ? { ...x, links: (() => { const a = [...x.links]; const [m] = a.splice(dragFtr.li, 1); a.splice(target, 0, m); return a; })() } : x))); setDragFtr(null); };

  // Unsaved-change protection (point 7). Dirty = current tree differs from the last saved snapshot.
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify([header.draft, footer.draft]));
  const dirty = JSON.stringify([hdr, ftr]) !== savedSnapshot;
  const markSaved = () => setSavedSnapshot(JSON.stringify([hdr, ftr]));

  // Warn on browser refresh/close while there are unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
  // Guard in-app navigation (e.g. clicking "Orders" in the sidebar) — App Router has no route-block API,
  // so intercept anchor clicks in the capture phase and confirm before leaving.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
      const a = (e.target as HTMLElement)?.closest?.("a");
      if (!a || !a.getAttribute("href") || a.target === "_blank") return;
      if (!window.confirm("You have unsaved navigation changes. Leave this page and discard them?")) { e.preventDefault(); e.stopPropagation(); }
    };
    document.addEventListener("click", h, true);
    return () => document.removeEventListener("click", h, true);
  }, [dirty]);

  const view = tab === "header" ? header : footer;
  const data = tab === "header" ? hdr : ftr;

  const post = async (body: Record<string, unknown>) => {
    setBusy(true); setMsg(null); setWarnings([]);
    try {
      const res = await fetch("/api/admin/navigation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ menu: tab, ...body }) });
      const d = await res.json(); setBusy(false);
      if (Array.isArray(d.warnings)) setWarnings(d.warnings);
      if (!res.ok || d.ok === false) { setMsg({ tone: "err", text: d.error ?? d.reason ?? "Failed" }); return d; }
      startTransition(() => router.refresh());
      return d;
    } catch { setBusy(false); setMsg({ tone: "err", text: "Network error" }); return null; }
  };

  const saveDraft = async () => { const d = await post({ action: "save", data }); if (d?.ok) { markSaved(); stampSaved(); setUndo(null); setMsg(null); } };
  const publish = async () => {
    // Client-side guard mirrors the server: unpublish must be after publish (or after now, for immediate).
    if (unpubAt) {
      const pubTs = pubAt ? Date.parse(istLocalToUtc(pubAt)!) : Date.now();
      if (!(Date.parse(istLocalToUtc(unpubAt)!) > pubTs)) { setMsg({ tone: "err", text: "Unpublish time (IST) must be after the publish time." }); return; }
    }
    const d = await post({ action: "publish", data, publishAt: schedUtc(pubAt), unpublishAt: schedUtc(unpubAt) });
    if (d?.ok) { markSaved(); setMsg({ tone: "ok", text: pubAt ? "Scheduled." : "Published live." }); }
  };
  const reset = async () => { const d = await post({ action: "reset" }); if (d?.ok) setMsg({ tone: "ok", text: "Reset to default." }); };
  // Footer editorial text — live on save (settings KV, not the draft/publish tree). Needs content.publish.
  const saveFooterText = async () => { const d = await post({ action: "save-footer-meta", meta: fm }); if (d?.ok) setMsg({ tone: "ok", text: "Footer text saved — live on the storefront." }); };
  const openRevs = async () => { const d = await post({ action: "revisions" }); if (d?.revisions) setRevs(d.revisions); };
  const restore = async (id: string) => { const d = await post({ action: "restore", id }); if (d?.ok) { setRevs(null); setMsg({ tone: "ok", text: "Restored into draft — review, then publish." }); } };
  // Device-framed preview (point 15): save the draft, arm the staff nav_preview cookie, then show the
  // real storefront in LivePreviewPanel (cookie mode — no postMessage). Preview = the last SAVED draft.
  const armPreview = async () => { const d = await post({ action: "save", data }); if (d?.ok) { markSaved(); stampSaved(); } document.cookie = "nav_preview=1; path=/; max-age=600"; return d; };
  const openPreview = async () => { const d = await armPreview(); if (d?.ok || d) setShowPreview(true); };

  // header mutators
  const setBranch = (bi: number, patch: Partial<NavBranch>) => setHdr((h) => h.map((b, i) => (i === bi ? { ...b, ...patch } : b)));
  const setItem = (bi: number, ii: number, patch: Partial<NavItem>) => setHdr((h) => h.map((b, i) => (i === bi ? { ...b, items: b.items.map((it, j) => (j === ii ? { ...it, ...patch } : it)) } : b)));
  const setCampaign = (bi: number, patch: Partial<NavBranch["campaign"]>) => setHdr((h) => h.map((b, i) => (i === bi ? { ...b, campaign: { ...b.campaign, ...patch } } : b)));
  const setFtrLink = (si: number, li: number, patch: Partial<FooterSection["links"][number]>) => setFtr((f) => f.map((x, i) => (i === si ? { ...x, links: x.links.map((y, j) => (j === li ? { ...y, ...patch } : y)) } : x)));

  return (
    <div className="cfg">
      <nav className="ff-queues" aria-label="Menu">
        <button type="button" className="ff-queue" data-active={tab === "header" ? "1" : "0"} onClick={() => setTab("header")}>Header · mega-menu</button>
        <button type="button" className="ff-queue" data-active={tab === "footer" ? "1" : "0"} onClick={() => setTab("footer")}>Footer</button>
        <span className="adm-badge" style={{ marginLeft: "auto" }}>{view.state}</span>
      </nav>

      {tab === "header" ? (
        <div>
          {hdr.map((b, bi) => (
            <div key={bi} className="nav-branch" onDragOver={(e) => { if (dragBranch !== null) e.preventDefault(); }} onDrop={() => dropBranch(bi)}>
              <div className="nav-branch__head">
                <span className="nav-drag nav-drag--branch" draggable onDragStart={() => setDragBranch(bi)} title="Drag to reorder branch (↑ ↓ also work)">⋮⋮</span>
                <button type="button" className="nav-collapse" onClick={() => toggleCollapse(`h${bi}`)} aria-expanded={!collapsed.has(`h${bi}`)} title="Collapse / expand branch">{collapsed.has(`h${bi}`) ? "▸" : "▾"}</button>
                <input className="nav-branch__label" value={b.label} onChange={(e) => setBranch(bi, { label: e.target.value })} placeholder="Branch label" />
                <input className="nav-branch__id" value={b.id} onChange={(e) => setBranch(bi, { id: e.target.value })} placeholder="id" />
                <span className="nav-branch__summary admin__muted">{b.items.length} link{b.items.length === 1 ? "" : "s"}{b.campaign?.title ? " · campaign" : ""}</span>
                <span className="ff-actions">
                  <button type="button" className="ff-btn" onClick={() => setHdr((h) => move(h, bi, -1))} title="Move up">↑</button>
                  <button type="button" className="ff-btn" onClick={() => setHdr((h) => move(h, bi, 1))} title="Move down">↓</button>
                  <button type="button" className="ff-btn" onClick={() => setHdr((h) => [...h.slice(0, bi + 1), cloneBranch(h[bi]), ...h.slice(bi + 1)])} title="Duplicate branch">Duplicate</button>
                  <button type="button" className="ff-btn ff-btn--danger" onClick={() => removeBranch(bi)}>Remove branch</button>
                </span>
              </div>
              {collapsed.has(`h${bi}`) ? null : (<>
              {b.items.map((it, ii) => (
                <div key={ii} className="nav-item" data-tier={it.tier || "flat"} draggable onDragStart={() => setDragItem({ bi, ii })} onDragOver={(e) => e.preventDefault()} onDrop={() => dropItem(bi, ii)}>
                  <div className="cfg-row" style={{ gridTemplateColumns: "auto 1fr 1.6fr 0.7fr auto auto auto auto auto auto" }}>
                    <span className="nav-drag" title="Drag to reorder (↑ ↓ also work)" aria-hidden>⋮⋮</span>
                    <input value={it.label} onChange={(e) => setItem(bi, ii, { label: e.target.value })} placeholder="Label" />
                    <DestinationPicker link={it} entities={entities} onChange={(patch) => setItem(bi, ii, patch)} />
                    <select value={it.tier ?? ""} onChange={(e) => setItem(bi, ii, { tier: (e.target.value || undefined) as NavItem["tier"] })}>{TIERS.map((t) => <option key={t} value={t}>{t || "flat"}</option>)}</select>
                    <button type="button" className="cfg-toggle" data-on={it.isComingSoon ? "1" : "0"} onClick={() => setItem(bi, ii, { isComingSoon: !it.isComingSoon })}>{it.isComingSoon ? "Soon" : "Live"}</button>
                    <button type="button" className="ff-btn" data-active={openLink === `h${bi}-${ii}` ? "1" : "0"} onClick={() => setOpenLink(openLink === `h${bi}-${ii}` ? null : `h${bi}-${ii}`)} title="SEO options">🔗</button>
                    <button type="button" className="ff-btn" onClick={() => setBranch(bi, { items: [...b.items.slice(0, ii + 1), clone(it), ...b.items.slice(ii + 1)] })} title="Duplicate link">⎘</button>
                    <button type="button" className="ff-btn" onClick={() => setBranch(bi, { items: move(b.items, ii, -1) })} title="Move up">↑</button>
                    <button type="button" className="ff-btn" onClick={() => setBranch(bi, { items: move(b.items, ii, 1) })} title="Move down">↓</button>
                    <button type="button" className="ff-btn ff-btn--danger" onClick={() => removeItem(bi, ii)} title="Remove link">×</button>
                  </div>
                  {openLink === `h${bi}-${ii}` ? <LinkEditor link={it} onChange={(patch) => setItem(bi, ii, patch)} /> : null}
                </div>
              ))}
              <button type="button" className="ff-btn" onClick={() => setBranch(bi, { items: [...b.items, { label: "New link", href: "/" }] })}>+ link</button>
              <p className="cfg-sub" style={{ marginTop: 12 }}>Campaign panel</p>
              <div className="nav-campaign">
                <div>
                  <div className="cfg-grid">
                    <label className="cfg-field"><span>Eyebrow</span><input value={b.campaign.eyebrow} onChange={(e) => setCampaign(bi, { eyebrow: e.target.value })} /></label>
                    <label className="cfg-field"><span>Title</span><input value={b.campaign.title} onChange={(e) => setCampaign(bi, { title: e.target.value })} /></label>
                    <label className="cfg-field"><span>Destination</span><DestinationPicker link={b.campaign} entities={entities} onChange={(patch) => setCampaign(bi, patch)} /></label>
                    <label className="cfg-field" data-wide="1"><span>Description</span><input value={b.campaign.description} onChange={(e) => setCampaign(bi, { description: e.target.value })} /></label>
                  </div>
                  <div className="nav-field"><span className="cfg-sub">Background gradient</span>
                    <div className="nav-swatches">
                      {GRADS.map((g) => <button key={g} type="button" className={`nav-swatch ${g}`} data-on={b.campaign.gradient === g && !b.campaign.mediaId ? "1" : "0"} onClick={() => setCampaign(bi, { gradient: g })} title={gradName(g)} aria-label={gradName(g)} />)}
                      <span className="admin__muted" style={{ marginLeft: 8 }}>{gradName(b.campaign.gradient || "")}{b.campaign.mediaId ? " · media overrides" : ""}</span>
                    </div>
                  </div>
                  <div className="nav-field"><span className="cfg-sub">Media (overrides gradient)</span>
                    {b.campaign.mediaId || b.campaign.image ? (
                      <div className="nav-media">
                        {b.campaign.image ? <img src={b.campaign.image} className="nav-media__thumb" alt="" /> : <span className="admin__muted">media set · {b.campaign.mediaId?.slice(0, 8)}</span>}
                        <button type="button" className="ff-btn ff-btn--mini" onClick={() => setMediaFor(bi)}>Replace</button>
                        <button type="button" className="ff-btn ff-btn--mini ff-btn--danger" onClick={() => setCampaign(bi, { mediaId: undefined, image: undefined })}>Remove</button>
                      </div>
                    ) : <button type="button" className="ff-btn ff-btn--mini" onClick={() => setMediaFor(bi)}>Choose media</button>}
                  </div>
                </div>
                <div className="nav-campaign__preview">
                  <span className="cfg-sub">Preview</span>
                  <MiniCampaign campaign={b.campaign} />
                </div>
              </div>
              </>)}
            </div>
          ))}
          <button type="button" className="ff-btn" onClick={() => setHdr((h) => [...h, { id: `branch-${h.length + 1}`, label: "New branch", items: [{ label: "Link", href: "/" }], campaign: { eyebrow: "Featured", title: "Title", description: "", href: "/", gradient: "grad-chai" } }])}>+ branch</button>
        </div>
      ) : (
        <div>
          <div className="nav-branch nav-footer-text">
            <p className="cfg-sub">Footer text (tagline · copyright · made-in)</p>
            <div className="cfg-grid">
              <label className="cfg-field" data-wide="1"><span>Tagline (leave blank to hide)</span><input value={fm.poetic} onChange={(e) => setFm({ ...fm, poetic: e.target.value })} placeholder="Fragrance designed to linger beyond the flame." /></label>
              <label className="cfg-field"><span>Copyright</span><input value={fm.copyright} onChange={(e) => setFm({ ...fm, copyright: e.target.value })} placeholder="© Samorah Studio" /></label>
              <label className="cfg-field"><span>Made in</span><input value={fm.madeIn} onChange={(e) => setFm({ ...fm, madeIn: e.target.value })} placeholder="Made with care in India." /></label>
            </div>
            <div className="cfg-actions">
              <button type="button" className="ff-btn ff-btn--primary" disabled={busy || !canPublish} onClick={saveFooterText} title={canPublish ? undefined : "Publishing needs the content.publish capability"}>Save footer text</button>
              <span className="admin__muted">Saves immediately &amp; goes live — it's site text, not part of the draft/publish menu.</span>
            </div>
          </div>
          {ftr.map((s, si) => (
            <div key={si} className="nav-branch" onDragOver={(e) => { if (dragCol !== null) e.preventDefault(); }} onDrop={() => dropCol(si)}>
              <div className="nav-branch__head">
                <span className="nav-drag nav-drag--branch" draggable onDragStart={() => setDragCol(si)} title="Drag to reorder column (↑ ↓ also work)">⋮⋮</span>
                <button type="button" className="nav-collapse" onClick={() => toggleCollapse(`f${si}`)} aria-expanded={!collapsed.has(`f${si}`)} title="Collapse / expand column">{collapsed.has(`f${si}`) ? "▸" : "▾"}</button>
                <input className="nav-branch__label" value={s.title} onChange={(e) => setFtr((f) => f.map((x, i) => (i === si ? { ...x, title: e.target.value } : x)))} placeholder="Column title" />
                <span className="nav-branch__summary admin__muted">{s.links.length} link{s.links.length === 1 ? "" : "s"}</span>
                <span className="ff-actions">
                  <button type="button" className="ff-btn" onClick={() => setFtr((f) => move(f, si, -1))} title="Move up">↑</button>
                  <button type="button" className="ff-btn" onClick={() => setFtr((f) => move(f, si, 1))} title="Move down">↓</button>
                  <button type="button" className="ff-btn" onClick={() => setFtr((f) => [...f.slice(0, si + 1), clone(f[si]), ...f.slice(si + 1)])} title="Duplicate column">Duplicate</button>
                  <button type="button" className="ff-btn ff-btn--danger" onClick={() => removeColumn(si)}>Remove column</button>
                </span>
              </div>
              {collapsed.has(`f${si}`) ? null : (<>
              {s.links.map((l, li) => (
                <div key={li} draggable onDragStart={() => setDragFtr({ si, li })} onDragOver={(e) => e.preventDefault()} onDrop={() => dropFtrLink(si, li)} className="nav-item">
                  <div className="cfg-row" style={{ gridTemplateColumns: "auto 1.2fr 1.7fr auto auto auto auto auto" }}>
                    <span className="nav-drag" title="Drag to reorder (↑ ↓ also work)" aria-hidden>⋮⋮</span>
                    <input value={l.label} onChange={(e) => setFtrLink(si, li, { label: e.target.value })} placeholder="Label" />
                    <DestinationPicker link={l} entities={entities} onChange={(patch) => setFtrLink(si, li, patch)} />
                    <button type="button" className="ff-btn" data-active={openLink === `f${si}-${li}` ? "1" : "0"} onClick={() => setOpenLink(openLink === `f${si}-${li}` ? null : `f${si}-${li}`)} title="SEO options">🔗</button>
                    <button type="button" className="ff-btn" onClick={() => setFtr((f) => f.map((x, i) => (i === si ? { ...x, links: [...x.links.slice(0, li + 1), clone(l), ...x.links.slice(li + 1)] } : x)))} title="Duplicate link">⎘</button>
                    <button type="button" className="ff-btn" onClick={() => setFtr((f) => f.map((x, i) => (i === si ? { ...x, links: move(x.links, li, -1) } : x)))} title="Move up">↑</button>
                    <button type="button" className="ff-btn" onClick={() => setFtr((f) => f.map((x, i) => (i === si ? { ...x, links: move(x.links, li, 1) } : x)))} title="Move down">↓</button>
                    <button type="button" className="ff-btn ff-btn--danger" onClick={() => removeFtrLink(si, li)} title="Remove link">×</button>
                  </div>
                  {openLink === `f${si}-${li}` ? <LinkEditor link={l} onChange={(patch) => setFtrLink(si, li, patch)} /> : null}
                </div>
              ))}
              <button type="button" className="ff-btn" onClick={() => setFtr((f) => f.map((x, i) => (i === si ? { ...x, links: [...x.links, { label: "New link", href: "/" }] } : x)))}>+ link</button>
              </>)}
            </div>
          ))}
          <button type="button" className="ff-btn" onClick={() => setFtr((f) => [...f, { title: "New column", links: [{ label: "Link", href: "/" }] }])}>+ column</button>
        </div>
      )}

      {warnings.length ? <ul className="nav-warn">{warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}</ul> : null}

      <div className="nav-publish">
        <div className="cfg-grid">
          <label className="cfg-field"><span>Publish at (IST — optional schedule)</span><input type="datetime-local" value={pubAt} onChange={(e) => setPubAt(e.target.value)} /><small className="admin__muted">{pubAt ? formatIST(istLocalToUtc(pubAt)!) : "publish immediately"}</small></label>
          <label className="cfg-field"><span>Unpublish at (IST — optional)</span><input type="datetime-local" value={unpubAt} onChange={(e) => setUnpubAt(e.target.value)} /><small className="admin__muted">{unpubAt ? `${formatIST(istLocalToUtc(unpubAt)!)} · then reverts to the previous published version` : "stays live"}</small></label>
        </div>
        <div className="cfg-actions">
          {dirty ? <span className="cfg-msg cfg-msg--warn" title="Unsaved edits — Save draft to keep them">● Unsaved changes</span> : savedAt ? <span className="cfg-msg cfg-msg--ok">✓ Draft saved · {savedAt} IST</span> : null}
          {undo ? <span className="cfg-msg admin__muted">{undo.text} · <button type="button" className="cpn-clear" onClick={undo.run}>Undo</button></span> : null}
          <button type="button" className="ff-btn" disabled={busy || pending} onClick={saveDraft}>Save draft</button>
          <button type="button" className="ff-btn" disabled={busy} onClick={openPreview}>{showPreview ? "Update preview" : "Preview"}</button>
          {showPreview ? <button type="button" className="ff-btn" onClick={() => setShowPreview(false)}>Close preview</button> : null}
          <button type="button" className="ff-btn ff-btn--primary" disabled={busy || !canPublish} onClick={publish} title={canPublish ? undefined : "Publishing needs the content.publish capability"}>{pubAt ? "Schedule" : "Publish"}</button>
          <button type="button" className="ff-btn" disabled={busy} onClick={openRevs}>History</button>
          {view.source === "db" && canPublish ? <button type="button" className="ff-btn ff-btn--danger" disabled={busy} onClick={reset}>Reset to default</button> : null}
          {msg ? <span className={`cfg-msg cfg-msg--${msg.tone}`}>{msg.text}</span> : null}
        </div>
        {!canPublish ? <p className="cfg-sub" style={{ marginTop: 6 }}>You can prepare and save drafts. Publishing to the live storefront needs the <code>content.publish</code> capability.</p> : null}
        {showPreview ? (
          <div className="nav-preview-wrap">
            <LivePreviewPanel
              src="/"
              desktopWidth={1280}
              hint={dirty ? "Showing last saved draft — Save draft to update preview" : "Showing saved draft · real storefront navigation"}
              onRefresh={() => { void armPreview(); }}
            />
          </div>
        ) : null}
      </div>

      {revs ? (
        <div className="om-modal" role="dialog" aria-modal="true" onClick={() => setRevs(null)}>
          <div className="om-modal__card" onClick={(e) => e.stopPropagation()}>
            <h2 className="om-modal__title">History · {tab}</h2>
            {revs.length ? (
              <ul className="rev-list">{revs.map((r, i) => (
                <li key={r.id} className="rev-item rev-item--rich">
                  <div className="rev-item__row">
                    <span className="rev-item__when">{formatIST(r.createdAt)}{i === 0 ? <span className="adm-badge" style={{ marginLeft: 8 }}>current</span> : null}</span>
                    <span className="rev-item__meta admin__muted">by {r.actorName} · {diffRevisions(r.snapshot, revs[i + 1]?.snapshot)}{r.label ? ` · ${r.label}` : ""}</span>
                    <span className="ff-actions">
                      <button type="button" className="ff-btn ff-btn--mini" onClick={() => setOpenRev(openRev === r.id ? null : r.id)}>{openRev === r.id ? "Hide" : "Preview"}</button>
                      <button type="button" className="ff-btn ff-btn--mini" disabled={busy} onClick={() => restore(r.id)} title="Loads this version into the draft — review, then publish normally">Restore to draft</button>
                    </span>
                  </div>
                  {openRev === r.id ? (
                    <div className="rev-item__preview">
                      {[...flattenNav(r.snapshot)].map((line, k) => <div key={k} className="rev-item__line admin__mono">{line}</div>)}
                      {flattenNav(r.snapshot).size === 0 ? <div className="admin__muted">(empty)</div> : null}
                    </div>
                  ) : null}
                </li>
              ))}</ul>
            ) : <p className="admin__empty">No changes recorded yet.</p>}
            <div className="om-modal__actions"><button type="button" className="ff-btn" onClick={() => setRevs(null)}>Close</button></div>
          </div>
        </div>
      ) : null}

      {/* Canonical media library picker for campaign imagery (point 20) — stores the asset id, not a URL. */}
      <MediaPicker open={mediaFor !== null} kind="image" onSelect={(url, _f, _fm, _mu, assetId) => { if (mediaFor !== null) setCampaign(mediaFor, { mediaId: assetId, image: url }); }} onClose={() => setMediaFor(null)} />
    </div>
  );
}
