"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { NavBranch, NavItem, FooterSection, MenuAdminView, LinkableEntities, EntityType, LinkAttrs } from "@/services/navigationService";
import type { Revision } from "@/services/cms/revisions";

const ENTITY_TYPES: EntityType[] = ["page", "chapter", "collection", "product"];

/** Compact per-link editor for entity linking (pt 5) + SEO attrs (pt 11). */
function LinkEditor({ link, entities, onChange }: { link: LinkAttrs & { href?: string }; entities: LinkableEntities; onChange: (patch: Partial<LinkAttrs>) => void }) {
  const isEntity = link.linkType === "entity";
  const et = link.entity?.type ?? "page";
  return (
    <div className="nav-linkedit">
      <select value={link.linkType ?? "url"} onChange={(e) => onChange({ linkType: e.target.value as "url" | "entity", entity: e.target.value === "entity" ? (link.entity ?? { type: "page", id: entities.page[0]?.id ?? "" }) : undefined })}>
        <option value="url">Manual URL</option>
        <option value="entity">Link to entity</option>
      </select>
      {isEntity ? (
        <>
          <select value={et} onChange={(e) => { const t = e.target.value as EntityType; onChange({ entity: { type: t, id: entities[t][0]?.id ?? "" } }); }}>{ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          <select value={link.entity?.id ?? ""} onChange={(e) => onChange({ entity: { type: et, id: e.target.value } })}>{(entities[et] ?? []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
        </>
      ) : null}
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
const toLocal = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

export function NavigationManager({ header, footer, entities, canPublish = true }: { header: MenuAdminView; footer: MenuAdminView; entities: LinkableEntities; canPublish?: boolean }) {
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
  const [revs, setRevs] = useState<Revision[] | null>(null);

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

  const saveDraft = async () => { const d = await post({ action: "save", data }); if (d?.ok) setMsg({ tone: "ok", text: "Draft saved." }); };
  const publish = async () => { const d = await post({ action: "publish", data, publishAt: fromLocal(pubAt), unpublishAt: fromLocal(unpubAt) }); if (d?.ok) setMsg({ tone: "ok", text: pubAt ? "Scheduled." : "Published live." }); };
  const reset = async () => { const d = await post({ action: "reset" }); if (d?.ok) setMsg({ tone: "ok", text: "Reset to default." }); };
  const openRevs = async () => { const d = await post({ action: "revisions" }); if (d?.revisions) setRevs(d.revisions); };
  const restore = async (id: string) => { const d = await post({ action: "restore", id }); if (d?.ok) { setRevs(null); setMsg({ tone: "ok", text: "Restored into draft — review, then publish." }); } };
  const preview = async () => {
    await post({ action: "save", data });          // preview the latest edits
    document.cookie = "nav_preview=1; path=/; max-age=300";
    window.open("/", "_blank", "noopener");
  };

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
            <div key={bi} className="nav-branch">
              <div className="nav-branch__head">
                <input className="nav-branch__label" value={b.label} onChange={(e) => setBranch(bi, { label: e.target.value })} placeholder="Branch label" />
                <input className="nav-branch__id" value={b.id} onChange={(e) => setBranch(bi, { id: e.target.value })} placeholder="id" />
                <span className="ff-actions">
                  <button type="button" className="ff-btn" onClick={() => setHdr((h) => move(h, bi, -1))}>↑</button>
                  <button type="button" className="ff-btn" onClick={() => setHdr((h) => move(h, bi, 1))}>↓</button>
                  <button type="button" className="ff-btn ff-btn--danger" onClick={() => setHdr((h) => h.filter((_, i) => i !== bi))}>Remove branch</button>
                </span>
              </div>
              {b.items.map((it, ii) => (
                <div key={ii}>
                  <div className="cfg-row" style={{ gridTemplateColumns: "1.3fr 1.3fr 0.7fr auto auto auto auto auto" }}>
                    <input value={it.label} onChange={(e) => setItem(bi, ii, { label: e.target.value })} placeholder="Label" />
                    <input value={it.href ?? ""} onChange={(e) => setItem(bi, ii, { href: e.target.value })} placeholder={it.linkType === "entity" ? "(from entity)" : "/href"} disabled={it.linkType === "entity"} />
                    <select value={it.tier ?? ""} onChange={(e) => setItem(bi, ii, { tier: (e.target.value || undefined) as NavItem["tier"] })}>{TIERS.map((t) => <option key={t} value={t}>{t || "flat"}</option>)}</select>
                    <button type="button" className="cfg-toggle" data-on={it.isComingSoon ? "1" : "0"} onClick={() => setItem(bi, ii, { isComingSoon: !it.isComingSoon })}>{it.isComingSoon ? "Soon" : "Live"}</button>
                    <button type="button" className="ff-btn" data-active={openLink === `h${bi}-${ii}` ? "1" : "0"} onClick={() => setOpenLink(openLink === `h${bi}-${ii}` ? null : `h${bi}-${ii}`)} title="Link & SEO">🔗</button>
                    <button type="button" className="ff-btn" onClick={() => setBranch(bi, { items: move(b.items, ii, -1) })}>↑</button>
                    <button type="button" className="ff-btn" onClick={() => setBranch(bi, { items: move(b.items, ii, 1) })}>↓</button>
                    <button type="button" className="ff-btn ff-btn--danger" onClick={() => setBranch(bi, { items: b.items.filter((_, j) => j !== ii) })}>×</button>
                  </div>
                  {openLink === `h${bi}-${ii}` ? <LinkEditor link={it} entities={entities} onChange={(patch) => setItem(bi, ii, patch)} /> : null}
                </div>
              ))}
              <button type="button" className="ff-btn" onClick={() => setBranch(bi, { items: [...b.items, { label: "New link", href: "/" }] })}>+ link</button>
              <p className="cfg-sub" style={{ marginTop: 12 }}>Campaign panel</p>
              <div className="cfg-grid">
                <label className="cfg-field"><span>Eyebrow</span><input value={b.campaign.eyebrow} onChange={(e) => setCampaign(bi, { eyebrow: e.target.value })} /></label>
                <label className="cfg-field"><span>Title</span><input value={b.campaign.title} onChange={(e) => setCampaign(bi, { title: e.target.value })} /></label>
                <label className="cfg-field"><span>Link</span><input value={b.campaign.href} onChange={(e) => setCampaign(bi, { href: e.target.value })} /></label>
                <label className="cfg-field"><span>Gradient</span><select value={b.campaign.gradient} onChange={(e) => setCampaign(bi, { gradient: e.target.value })}>{GRADS.map((g) => <option key={g} value={g}>{g}</option>)}</select></label>
                <label className="cfg-field"><span>Description</span><input value={b.campaign.description} onChange={(e) => setCampaign(bi, { description: e.target.value })} /></label>
                <label className="cfg-field"><span>Media id (optional — overrides gradient)</span><input value={b.campaign.mediaId ?? ""} onChange={(e) => setCampaign(bi, { mediaId: e.target.value || undefined })} placeholder="media asset id" /></label>
              </div>
            </div>
          ))}
          <button type="button" className="ff-btn" onClick={() => setHdr((h) => [...h, { id: `branch-${h.length + 1}`, label: "New branch", items: [{ label: "Link", href: "/" }], campaign: { eyebrow: "Featured", title: "Title", description: "", href: "/", gradient: "grad-chai" } }])}>+ branch</button>
        </div>
      ) : (
        <div>
          {ftr.map((s, si) => (
            <div key={si} className="nav-branch">
              <div className="nav-branch__head">
                <input className="nav-branch__label" value={s.title} onChange={(e) => setFtr((f) => f.map((x, i) => (i === si ? { ...x, title: e.target.value } : x)))} placeholder="Column title" />
                <span className="ff-actions">
                  <button type="button" className="ff-btn" onClick={() => setFtr((f) => move(f, si, -1))}>↑</button>
                  <button type="button" className="ff-btn" onClick={() => setFtr((f) => move(f, si, 1))}>↓</button>
                  <button type="button" className="ff-btn ff-btn--danger" onClick={() => setFtr((f) => f.filter((_, i) => i !== si))}>Remove column</button>
                </span>
              </div>
              {s.links.map((l, li) => (
                <div key={li}>
                  <div className="cfg-row" style={{ gridTemplateColumns: "1.4fr 1.5fr auto auto auto auto auto" }}>
                    <input value={l.label} onChange={(e) => setFtrLink(si, li, { label: e.target.value })} placeholder="Label" />
                    <input value={l.href ?? ""} onChange={(e) => setFtrLink(si, li, { href: e.target.value })} placeholder={l.linkType === "entity" ? "(from entity)" : "/href or https://"} disabled={l.linkType === "entity"} />
                    <button type="button" className="cfg-toggle" data-on={l.external ? "1" : "0"} onClick={() => setFtrLink(si, li, { external: !l.external })}>{l.external ? "External" : "Internal"}</button>
                    <button type="button" className="ff-btn" data-active={openLink === `f${si}-${li}` ? "1" : "0"} onClick={() => setOpenLink(openLink === `f${si}-${li}` ? null : `f${si}-${li}`)} title="Link & SEO">🔗</button>
                    <button type="button" className="ff-btn" onClick={() => setFtr((f) => f.map((x, i) => (i === si ? { ...x, links: move(x.links, li, -1) } : x)))}>↑</button>
                    <button type="button" className="ff-btn" onClick={() => setFtr((f) => f.map((x, i) => (i === si ? { ...x, links: move(x.links, li, 1) } : x)))}>↓</button>
                    <button type="button" className="ff-btn ff-btn--danger" onClick={() => setFtr((f) => f.map((x, i) => (i === si ? { ...x, links: x.links.filter((_, j) => j !== li) } : x)))}>×</button>
                  </div>
                  {openLink === `f${si}-${li}` ? <LinkEditor link={l} entities={entities} onChange={(patch) => setFtrLink(si, li, patch)} /> : null}
                </div>
              ))}
              <button type="button" className="ff-btn" onClick={() => setFtr((f) => f.map((x, i) => (i === si ? { ...x, links: [...x.links, { label: "New link", href: "/" }] } : x)))}>+ link</button>
            </div>
          ))}
          <button type="button" className="ff-btn" onClick={() => setFtr((f) => [...f, { title: "New column", links: [{ label: "Link", href: "/" }] }])}>+ column</button>
        </div>
      )}

      {warnings.length ? <ul className="nav-warn">{warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}</ul> : null}

      <div className="nav-publish">
        <div className="cfg-grid">
          <label className="cfg-field"><span>Publish at (optional — schedule)</span><input type="datetime-local" value={pubAt} onChange={(e) => setPubAt(e.target.value)} /></label>
          <label className="cfg-field"><span>Unpublish at (optional)</span><input type="datetime-local" value={unpubAt} onChange={(e) => setUnpubAt(e.target.value)} /></label>
        </div>
        <div className="cfg-actions">
          <button type="button" className="ff-btn" disabled={busy || pending} onClick={saveDraft}>Save draft</button>
          <button type="button" className="ff-btn" disabled={busy} onClick={preview}>Preview</button>
          <button type="button" className="ff-btn ff-btn--primary" disabled={busy || !canPublish} onClick={publish} title={canPublish ? undefined : "Publishing needs the content.publish capability"}>{pubAt ? "Schedule" : "Publish"}</button>
          <button type="button" className="ff-btn" disabled={busy} onClick={openRevs}>History</button>
          {view.source === "db" && canPublish ? <button type="button" className="ff-btn ff-btn--danger" disabled={busy} onClick={reset}>Reset to default</button> : null}
          {msg ? <span className={`cfg-msg cfg-msg--${msg.tone}`}>{msg.text}</span> : null}
        </div>
        {!canPublish ? <p className="cfg-sub" style={{ marginTop: 6 }}>You can prepare and save drafts. Publishing to the live storefront needs the <code>content.publish</code> capability.</p> : null}
      </div>

      {revs ? (
        <div className="om-modal" role="dialog" aria-modal="true" onClick={() => setRevs(null)}>
          <div className="om-modal__card" onClick={(e) => e.stopPropagation()}>
            <h2 className="om-modal__title">History · {tab}</h2>
            {revs.length ? (
              <ul className="rev-list">{revs.map((r) => (
                <li key={r.id} className="rev-item">
                  <span className="rev-item__when">{new Date(r.createdAt).toLocaleString()}</span>
                  <span className="rev-item__meta admin__muted">{r.label ?? "published"}</span>
                  <button type="button" className="ff-btn" disabled={busy} onClick={() => restore(r.id)}>Restore to draft</button>
                </li>
              ))}</ul>
            ) : <p className="admin__empty">No published versions yet.</p>}
            <div className="om-modal__actions"><button type="button" className="ff-btn" onClick={() => setRevs(null)}>Close</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
