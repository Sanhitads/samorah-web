"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { NavBranch, NavItem, FooterSection, FooterLink } from "@/services/navigationService";

const TIERS = ["", "parent", "child", "cta"];
const GRADS = ["grad-chai", "grad-gajar", "grad-air", "grad-smoke", "grad-story"];

/** Move item i of arr in a direction (−1 up / +1 down), returning a new array. */
function move<T>(arr: T[], i: number, dir: number): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function NavigationManager({ branches, footer, headerSource, footerSource }: {
  branches: NavBranch[]; footer: FooterSection[]; headerSource: string; footerSource: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<"header" | "footer">("header");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: string; text: string } | null>(null);
  const [hdr, setHdr] = useState<NavBranch[]>(branches);
  const [ftr, setFtr] = useState<FooterSection[]>(footer);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/admin/navigation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json(); setBusy(false);
      if (!res.ok || d.ok === false) { setMsg({ tone: "err", text: d.error ?? d.reason ?? "Failed" }); return false; }
      setMsg({ tone: "ok", text: "Saved." }); startTransition(() => router.refresh()); return true;
    } catch { setBusy(false); setMsg({ tone: "err", text: "Network error" }); return false; }
  };
  const saveHeader = () => post({ action: "save", menu: "header", data: hdr });
  const saveFooter = () => post({ action: "save", menu: "footer", data: ftr });
  const reset = (menu: "header" | "footer") => post({ action: "reset", menu });

  // ── header mutators ──
  const setBranch = (bi: number, patch: Partial<NavBranch>) => setHdr((h) => h.map((b, i) => (i === bi ? { ...b, ...patch } : b)));
  const setItem = (bi: number, ii: number, patch: Partial<NavItem>) => setHdr((h) => h.map((b, i) => (i === bi ? { ...b, items: b.items.map((it, j) => (j === ii ? { ...it, ...patch } : it)) } : b)));
  const setCampaign = (bi: number, patch: Partial<NavBranch["campaign"]>) => setHdr((h) => h.map((b, i) => (i === bi ? { ...b, campaign: { ...b.campaign, ...patch } } : b)));

  return (
    <div className="cfg">
      <nav className="ff-queues" aria-label="Menu">
        <button type="button" className="ff-queue" data-active={tab === "header" ? "1" : "0"} onClick={() => setTab("header")}>Header · mega-menu</button>
        <button type="button" className="ff-queue" data-active={tab === "footer" ? "1" : "0"} onClick={() => setTab("footer")}>Footer</button>
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
                <div key={ii} className="cfg-row" style={{ gridTemplateColumns: "1.4fr 1.4fr 0.8fr auto auto auto auto" }}>
                  <input value={it.label} onChange={(e) => setItem(bi, ii, { label: e.target.value })} placeholder="Label" />
                  <input value={it.href} onChange={(e) => setItem(bi, ii, { href: e.target.value })} placeholder="/href" />
                  <select value={it.tier ?? ""} onChange={(e) => setItem(bi, ii, { tier: (e.target.value || undefined) as NavItem["tier"] })}>{TIERS.map((t) => <option key={t} value={t}>{t || "flat"}</option>)}</select>
                  <button type="button" className="cfg-toggle" data-on={it.isComingSoon ? "1" : "0"} onClick={() => setItem(bi, ii, { isComingSoon: !it.isComingSoon })}>{it.isComingSoon ? "Soon" : "Live"}</button>
                  <button type="button" className="ff-btn" onClick={() => setBranch(bi, { items: move(b.items, ii, -1) })}>↑</button>
                  <button type="button" className="ff-btn" onClick={() => setBranch(bi, { items: move(b.items, ii, 1) })}>↓</button>
                  <button type="button" className="ff-btn ff-btn--danger" onClick={() => setBranch(bi, { items: b.items.filter((_, j) => j !== ii) })}>×</button>
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

          <div className="cfg-actions">
            <button type="button" className="ff-btn ff-btn--primary" disabled={busy || pending} onClick={saveHeader}>{busy ? "Saving…" : "Save header"}</button>
            {headerSource === "db" ? <button type="button" className="ff-btn" disabled={busy} onClick={() => reset("header")}>Reset to default</button> : null}
            {msg ? <span className={`cfg-msg cfg-msg--${msg.tone}`}>{msg.text}</span> : null}
          </div>
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
                <div key={li} className="cfg-row" style={{ gridTemplateColumns: "1.4fr 1.6fr auto auto auto auto" }}>
                  <input value={l.label} onChange={(e) => setFtr((f) => f.map((x, i) => (i === si ? { ...x, links: x.links.map((y, j) => (j === li ? { ...y, label: e.target.value } : y)) } : x)))} placeholder="Label" />
                  <input value={l.href} onChange={(e) => setFtr((f) => f.map((x, i) => (i === si ? { ...x, links: x.links.map((y, j) => (j === li ? { ...y, href: e.target.value } : y)) } : x)))} placeholder="/href or https://" />
                  <button type="button" className="cfg-toggle" data-on={l.external ? "1" : "0"} onClick={() => setFtr((f) => f.map((x, i) => (i === si ? { ...x, links: x.links.map((y, j) => (j === li ? { ...y, external: !y.external } : y)) } : x)))}>{l.external ? "External" : "Internal"}</button>
                  <button type="button" className="ff-btn" onClick={() => setFtr((f) => f.map((x, i) => (i === si ? { ...x, links: move(x.links, li, -1) } : x)))}>↑</button>
                  <button type="button" className="ff-btn" onClick={() => setFtr((f) => f.map((x, i) => (i === si ? { ...x, links: move(x.links, li, 1) } : x)))}>↓</button>
                  <button type="button" className="ff-btn ff-btn--danger" onClick={() => setFtr((f) => f.map((x, i) => (i === si ? { ...x, links: x.links.filter((_, j) => j !== li) } : x)))}>×</button>
                </div>
              ))}
              <button type="button" className="ff-btn" onClick={() => setFtr((f) => f.map((x, i) => (i === si ? { ...x, links: [...x.links, { label: "New link", href: "/" }] } : x)))}>+ link</button>
            </div>
          ))}
          <button type="button" className="ff-btn" onClick={() => setFtr((f) => [...f, { title: "New column", links: [{ label: "Link", href: "/" }] }])}>+ column</button>

          <div className="cfg-actions">
            <button type="button" className="ff-btn ff-btn--primary" disabled={busy || pending} onClick={saveFooter}>{busy ? "Saving…" : "Save footer"}</button>
            {footerSource === "db" ? <button type="button" className="ff-btn" disabled={busy} onClick={() => reset("footer")}>Reset to default</button> : null}
            {msg ? <span className={`cfg-msg cfg-msg--${msg.tone}`}>{msg.text}</span> : null}
          </div>
        </div>
      )}
    </div>
  );
}
