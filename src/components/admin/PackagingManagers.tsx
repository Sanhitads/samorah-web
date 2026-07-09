"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PackagingAsset, PackagingProfile, PackagingRule } from "@/lib/packaging/types";

const ASSET_TYPES = ["outer_box", "rigid_box", "mailer", "pouch", "gift_box", "insert", "tissue", "foam", "filler", "wrap", "tape", "leak_seal"];
const ROLES = ["box", "insert", "filler", "wrap", "seal"];

function usePost() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const post = async (body: Record<string, unknown>): Promise<boolean> => {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/admin/packaging", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      setBusy(false);
      if (!res.ok || d.ok === false) { setErr(d.error ?? d.reason ?? "Failed"); return false; }
      startTransition(() => router.refresh());
      return true;
    } catch { setBusy(false); setErr("Network error"); return false; }
  };
  return { post, busy, pending, err, setErr };
}

const numOr = (v: string) => (v === "" ? undefined : Number(v));

// ── Assets ───────────────────────────────────────────────────────────────────
type AssetForm = Omit<Partial<PackagingAsset>, "type"> & { name: string; type: string };
export function AssetsManager({ assets }: { assets: PackagingAsset[] }) {
  const { post, busy, pending, err, setErr } = usePost();
  const [edit, setEdit] = useState<AssetForm | null>(null);
  const [adjust, setAdjust] = useState<{ id: string; name: string } | null>(null);
  const [delta, setDelta] = useState("");
  const blank: AssetForm = { name: "", type: "outer_box", weightG: 0, fragile: false, active: true, currentStock: 0, minStock: 0, reorderLevel: 0 };

  const save = async (a: AssetForm) => {
    const asset = { name: a.name, type: a.type, lengthCm: a.lengthCm, widthCm: a.widthCm, heightCm: a.heightCm, weightG: a.weightG ?? 0, maxWeightG: a.maxWeightG, maxProducts: a.maxProducts, fragile: a.fragile ?? false, costInr: a.costInr, vendor: a.vendor, barcode: a.barcode, active: a.active ?? true, currentStock: a.currentStock ?? 0, minStock: a.minStock ?? 0, reorderLevel: a.reorderLevel ?? 0 };
    if (await post(a.id ? { action: "asset.update", id: a.id, asset } : { action: "asset.create", asset })) setEdit(null);
  };
  const low = (a: PackagingAsset) => (a.currentStock ?? 0) <= (a.minStock ?? 0);

  return (
    <div className="cfg">
      <div className="cfg-actions"><button type="button" className="ff-btn ff-btn--primary" onClick={() => { setErr(""); setEdit({ ...blank }); }}>New asset</button>{pending ? <span className="ff-refreshing">updating…</span> : null}{err && !edit && !adjust ? <span className="ff-err">{err}</span> : null}</div>
      <table className="admin__table admin__table--board">
        <thead><tr><th>Name</th><th>Type</th><th>Dims (cm)</th><th>Weight (g)</th><th>Stock</th><th>Cost</th><th>Actions</th></tr></thead>
        <tbody>
          {assets.map((a) => (
            <tr key={a.id}>
              <td>{a.name}{!a.active ? <span className="admin__muted"> (inactive)</span> : null}{a.fragile ? <span className="bc-tag" data-derived="0"> fragile</span> : null}</td>
              <td className="admin__muted">{a.type}</td>
              <td className="admin__muted">{a.lengthCm ? `${a.lengthCm}×${a.widthCm}×${a.heightCm}` : "—"}</td>
              <td className="admin__mono">{a.weightG}</td>
              <td><span className="bc-inv" data-inv={low(a) ? "missing" : "allocated"}>{a.currentStock ?? 0}{low(a) ? " ⚠" : ""}</span><span className="admin__muted"> /min {a.minStock ?? 0}</span></td>
              <td className="admin__mono">{a.costInr != null ? `₹${a.costInr}` : "—"}</td>
              <td><div className="ff-actions">
                <button type="button" className="ff-btn" onClick={() => { setErr(""); setEdit({ ...a }); }}>Edit</button>
                <button type="button" className="ff-btn" onClick={() => { setErr(""); setDelta(""); setAdjust({ id: a.id, name: a.name }); }}>Stock</button>
                <button type="button" className="ff-btn ff-btn--danger" disabled={busy} onClick={() => post({ action: "asset.delete", id: a.id })}>Delete</button>
              </div></td>
            </tr>
          ))}
          {assets.length === 0 ? <tr><td colSpan={7} className="admin__empty">No packaging assets yet. Add boxes, mailers, inserts, wraps — with real measurements — to drive parcel weights.</td></tr> : null}
        </tbody>
      </table>

      {edit ? (
        <div className="om-modal" role="dialog" aria-modal="true" onClick={() => !busy && setEdit(null)}>
          <div className="om-modal__card om-modal__card--wide" onClick={(e) => e.stopPropagation()}>
            <h2 className="om-modal__title">{edit.id ? "Edit asset" : "New asset"}</h2>
            <div className="cfg-grid">
              <label className="cfg-field"><span>Name</span><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
              <label className="cfg-field"><span>Type</span><select value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}>{ASSET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
              <label className="cfg-field"><span>Weight (g)</span><input type="number" value={edit.weightG ?? 0} onChange={(e) => setEdit({ ...edit, weightG: Number(e.target.value) })} /></label>
              <label className="cfg-field"><span>Length (cm)</span><input type="number" value={edit.lengthCm ?? ""} onChange={(e) => setEdit({ ...edit, lengthCm: numOr(e.target.value) })} /></label>
              <label className="cfg-field"><span>Width (cm)</span><input type="number" value={edit.widthCm ?? ""} onChange={(e) => setEdit({ ...edit, widthCm: numOr(e.target.value) })} /></label>
              <label className="cfg-field"><span>Height (cm)</span><input type="number" value={edit.heightCm ?? ""} onChange={(e) => setEdit({ ...edit, heightCm: numOr(e.target.value) })} /></label>
              <label className="cfg-field"><span>Max content (g)</span><input type="number" value={edit.maxWeightG ?? ""} onChange={(e) => setEdit({ ...edit, maxWeightG: numOr(e.target.value) })} /></label>
              <label className="cfg-field"><span>Max products</span><input type="number" value={edit.maxProducts ?? ""} onChange={(e) => setEdit({ ...edit, maxProducts: numOr(e.target.value) })} /></label>
              <label className="cfg-field"><span>Unit cost (₹)</span><input type="number" value={edit.costInr ?? ""} onChange={(e) => setEdit({ ...edit, costInr: numOr(e.target.value) })} /></label>
              <label className="cfg-field"><span>Current stock</span><input type="number" value={edit.currentStock ?? 0} onChange={(e) => setEdit({ ...edit, currentStock: Number(e.target.value) })} /></label>
              <label className="cfg-field"><span>Min stock</span><input type="number" value={edit.minStock ?? 0} onChange={(e) => setEdit({ ...edit, minStock: Number(e.target.value) })} /></label>
              <label className="cfg-field"><span>Reorder level</span><input type="number" value={edit.reorderLevel ?? 0} onChange={(e) => setEdit({ ...edit, reorderLevel: Number(e.target.value) })} /></label>
              <label className="cfg-field"><span>Vendor</span><input value={edit.vendor ?? ""} onChange={(e) => setEdit({ ...edit, vendor: e.target.value })} /></label>
              <label className="cfg-field"><span>Barcode</span><input value={edit.barcode ?? ""} onChange={(e) => setEdit({ ...edit, barcode: e.target.value })} /></label>
            </div>
            <div className="cfg-checks">
              <label className="om-check"><input type="checkbox" checked={edit.fragile ?? false} onChange={(e) => setEdit({ ...edit, fragile: e.target.checked })} /><span>Fragile</span></label>
              <label className="om-check"><input type="checkbox" checked={edit.active ?? true} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /><span>Active</span></label>
            </div>
            {err ? <p className="ff-err">{err}</p> : null}
            <div className="om-modal__actions"><button type="button" className="ff-btn" disabled={busy} onClick={() => setEdit(null)}>Cancel</button><button type="button" className="ff-btn ff-btn--primary" disabled={busy || !edit.name.trim()} onClick={() => save(edit)}>{busy ? "Saving…" : "Save"}</button></div>
          </div>
        </div>
      ) : null}

      {adjust ? (
        <div className="om-modal" role="dialog" aria-modal="true" onClick={() => !busy && setAdjust(null)}>
          <div className="om-modal__card" onClick={(e) => e.stopPropagation()}>
            <h2 className="om-modal__title">Adjust stock — {adjust.name}</h2>
            <p className="om-modal__note">Positive receives, negative consumes. Clamps at zero.</p>
            <label className="cfg-field"><span>Change (± units)</span><input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="e.g. 100 or -20" /></label>
            {err ? <p className="ff-err">{err}</p> : null}
            <div className="om-modal__actions"><button type="button" className="ff-btn" disabled={busy} onClick={() => setAdjust(null)}>Cancel</button><button type="button" className="ff-btn ff-btn--primary" disabled={busy || delta === ""} onClick={async () => { if (await post({ action: "asset.adjust", id: adjust.id, delta: Number(delta) })) setAdjust(null); }}>{busy ? "Saving…" : "Apply"}</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Profiles ─────────────────────────────────────────────────────────────────
type ProfileForm = { id?: string; name: string; description?: string; active: boolean; items: { assetId: string; quantity: number; role: string }[] };
export function ProfilesManager({ profiles, assets }: { profiles: PackagingProfile[]; assets: PackagingAsset[] }) {
  const { post, busy, pending, err, setErr } = usePost();
  const [edit, setEdit] = useState<ProfileForm | null>(null);
  const assetName = (id: string) => assets.find((a) => a.id === id)?.name ?? id.slice(0, 8);
  const blank: ProfileForm = { name: "", active: true, items: [] };

  const save = async (p: ProfileForm) => {
    const profile = { name: p.name, description: p.description, active: p.active, items: p.items };
    if (await post(p.id ? { action: "profile.update", id: p.id, profile } : { action: "profile.create", profile })) setEdit(null);
  };

  return (
    <div className="cfg">
      <div className="cfg-actions"><button type="button" className="ff-btn ff-btn--primary" onClick={() => { setErr(""); setEdit({ ...blank }); }}>New profile</button>{pending ? <span className="ff-refreshing">updating…</span> : null}{err && !edit ? <span className="ff-err">{err}</span> : null}</div>
      <table className="admin__table admin__table--board">
        <thead><tr><th>Name</th><th>Contents</th><th>Active</th><th>Actions</th></tr></thead>
        <tbody>
          {profiles.map((p) => (
            <tr key={p.id}>
              <td>{p.name}{p.description ? <div className="admin__muted">{p.description}</div> : null}</td>
              <td className="cfg-rule-summary">{p.items.length ? p.items.map((i) => `${i.quantity}× ${assetName(i.assetId)} (${i.role})`).join(", ") : "—"}</td>
              <td>{p.active ? "On" : "Off"}</td>
              <td><div className="ff-actions"><button type="button" className="ff-btn" onClick={() => { setErr(""); setEdit({ id: p.id, name: p.name, description: p.description, active: p.active, items: p.items.map((i) => ({ ...i })) }); }}>Edit</button><button type="button" className="ff-btn ff-btn--danger" disabled={busy} onClick={() => post({ action: "profile.delete", id: p.id })}>Delete</button></div></td>
            </tr>
          ))}
          {profiles.length === 0 ? <tr><td colSpan={4} className="admin__empty">No profiles yet. A profile is a recipe of assets (box + insert + wrap) the engine picks per order.</td></tr> : null}
        </tbody>
      </table>

      {edit ? (
        <div className="om-modal" role="dialog" aria-modal="true" onClick={() => !busy && setEdit(null)}>
          <div className="om-modal__card om-modal__card--wide" onClick={(e) => e.stopPropagation()}>
            <h2 className="om-modal__title">{edit.id ? "Edit profile" : "New profile"}</h2>
            <div className="cfg-grid">
              <label className="cfg-field"><span>Name</span><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
              <label className="cfg-field"><span>Description</span><input value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></label>
              <label className="om-check" style={{ alignSelf: "end" }}><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /><span>Active</span></label>
            </div>
            <p className="cfg-sub">Contents</p>
            {edit.items.map((it, i) => (
              <div key={i} className="cfg-row">
                <select value={it.assetId} onChange={(e) => setEdit({ ...edit, items: edit.items.map((x, j) => j === i ? { ...x, assetId: e.target.value } : x) })}><option value="">— asset —</option>{assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
                <input type="number" value={it.quantity} onChange={(e) => setEdit({ ...edit, items: edit.items.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x) })} />
                <select value={it.role} onChange={(e) => setEdit({ ...edit, items: edit.items.map((x, j) => j === i ? { ...x, role: e.target.value } : x) })}>{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select>
                <button type="button" className="ff-btn" onClick={() => setEdit({ ...edit, items: edit.items.filter((_, j) => j !== i) })}>×</button>
              </div>
            ))}
            <button type="button" className="ff-btn" onClick={() => setEdit({ ...edit, items: [...edit.items, { assetId: "", quantity: 1, role: "box" }] })}>+ item</button>
            {err ? <p className="ff-err">{err}</p> : null}
            <div className="om-modal__actions"><button type="button" className="ff-btn" disabled={busy} onClick={() => setEdit(null)}>Cancel</button><button type="button" className="ff-btn ff-btn--primary" disabled={busy || !edit.name.trim()} onClick={() => save(edit)}>{busy ? "Saving…" : "Save"}</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Packaging rules ──────────────────────────────────────────────────────────
type PkgRuleForm = { id?: string; name: string; kind: "select" | "modifier"; priority: number; active: boolean; minProducts?: number; maxProducts?: number; productType?: string; vessel?: string; isGift?: boolean; profileId?: string; addFragileWrap?: boolean; addLeakSeal?: boolean };
export function PackagingRulesManager({ rules, profiles }: { rules: PackagingRule[]; profiles: PackagingProfile[] }) {
  const { post, busy, pending, err, setErr } = usePost();
  const [edit, setEdit] = useState<PkgRuleForm | null>(null);
  const profName = (id?: string) => profiles.find((p) => p.id === id)?.name ?? (id ? id.slice(0, 8) : "—");
  const blank: PkgRuleForm = { name: "", kind: "select", priority: 100, active: true };

  const save = async (r: PkgRuleForm) => {
    const rule = { name: r.name, kind: r.kind, priority: r.priority, active: r.active, minProducts: r.minProducts, maxProducts: r.maxProducts, productType: r.productType, vessel: r.vessel, isGift: r.isGift, profileId: r.kind === "select" ? r.profileId : undefined, addFragileWrap: r.addFragileWrap, addLeakSeal: r.addLeakSeal };
    if (await post(r.id ? { action: "rule.update", id: r.id, rule } : { action: "rule.create", rule })) setEdit(null);
  };
  const cond = (r: PackagingRule) => [r.minProducts != null ? `≥${r.minProducts}` : null, r.maxProducts != null ? `≤${r.maxProducts}` : null, r.productType, r.vessel, r.isGift != null ? `gift=${r.isGift}` : null].filter(Boolean).join(" · ") || "any";
  const act = (r: PackagingRule) => r.kind === "select" ? `→ ${profName(r.profileId)}` : [r.addFragileWrap ? "+fragile wrap" : null, r.addLeakSeal ? "+leak seal" : null].filter(Boolean).join(", ") || "—";

  return (
    <div className="cfg">
      <div className="cfg-actions"><button type="button" className="ff-btn ff-btn--primary" onClick={() => { setErr(""); setEdit({ ...blank }); }}>New rule</button>{pending ? <span className="ff-refreshing">updating…</span> : null}{err && !edit ? <span className="ff-err">{err}</span> : null}</div>
      <table className="admin__table admin__table--board">
        <thead><tr><th>Name</th><th>Kind</th><th>When</th><th>Then</th><th>Priority</th><th>Active</th><th>Actions</th></tr></thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td><td className="admin__muted">{r.kind}</td>
              <td className="cfg-rule-summary">{cond(r)}</td><td className="cfg-rule-summary">{act(r)}</td>
              <td className="admin__mono">{r.priority}</td>
              <td><button type="button" className="cfg-toggle" data-on={r.active ? "1" : "0"} disabled={busy} onClick={() => post({ action: "rule.toggle", id: r.id, active: !r.active })}>{r.active ? "On" : "Off"}</button></td>
              <td><div className="ff-actions"><button type="button" className="ff-btn" onClick={() => { setErr(""); setEdit({ ...r }); }}>Edit</button><button type="button" className="ff-btn ff-btn--danger" disabled={busy} onClick={() => post({ action: "rule.delete", id: r.id })}>Delete</button></div></td>
            </tr>
          ))}
          {rules.length === 0 ? <tr><td colSpan={7} className="admin__empty">No packaging rules. A select rule picks a profile; a modifier adds fragile wrap / leak seal.</td></tr> : null}
        </tbody>
      </table>

      {edit ? (
        <div className="om-modal" role="dialog" aria-modal="true" onClick={() => !busy && setEdit(null)}>
          <div className="om-modal__card om-modal__card--wide" onClick={(e) => e.stopPropagation()}>
            <h2 className="om-modal__title">{edit.id ? "Edit packaging rule" : "New packaging rule"}</h2>
            <div className="cfg-grid">
              <label className="cfg-field"><span>Name</span><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
              <label className="cfg-field"><span>Kind</span><select value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as "select" | "modifier" })}><option value="select">select (choose profile)</option><option value="modifier">modifier (add wrap/seal)</option></select></label>
              <label className="cfg-field"><span>Priority</span><input type="number" value={edit.priority} onChange={(e) => setEdit({ ...edit, priority: Number(e.target.value) })} /></label>
            </div>
            <p className="cfg-sub">When (blank = any)</p>
            <div className="cfg-grid">
              <label className="cfg-field"><span>Min products</span><input type="number" value={edit.minProducts ?? ""} onChange={(e) => setEdit({ ...edit, minProducts: numOr(e.target.value) })} /></label>
              <label className="cfg-field"><span>Max products</span><input type="number" value={edit.maxProducts ?? ""} onChange={(e) => setEdit({ ...edit, maxProducts: numOr(e.target.value) })} /></label>
              <label className="cfg-field"><span>Product type</span><input value={edit.productType ?? ""} onChange={(e) => setEdit({ ...edit, productType: e.target.value })} placeholder="candle / room_spray" /></label>
              <label className="cfg-field"><span>Vessel</span><input value={edit.vessel ?? ""} onChange={(e) => setEdit({ ...edit, vessel: e.target.value })} placeholder="glass / ceramic" /></label>
              <label className="cfg-field"><span>Gift?</span><select value={edit.isGift == null ? "" : String(edit.isGift)} onChange={(e) => setEdit({ ...edit, isGift: e.target.value === "" ? undefined : e.target.value === "true" })}><option value="">any</option><option value="true">yes</option><option value="false">no</option></select></label>
            </div>
            <p className="cfg-sub">Then</p>
            {edit.kind === "select" ? (
              <label className="cfg-field"><span>Profile</span><select value={edit.profileId ?? ""} onChange={(e) => setEdit({ ...edit, profileId: e.target.value })}><option value="">— profile —</option>{profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            ) : (
              <div className="cfg-checks">
                <label className="om-check"><input type="checkbox" checked={edit.addFragileWrap ?? false} onChange={(e) => setEdit({ ...edit, addFragileWrap: e.target.checked })} /><span>Add fragile wrap</span></label>
                <label className="om-check"><input type="checkbox" checked={edit.addLeakSeal ?? false} onChange={(e) => setEdit({ ...edit, addLeakSeal: e.target.checked })} /><span>Add leak seal</span></label>
              </div>
            )}
            <label className="om-check"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /><span>Active</span></label>
            {err ? <p className="ff-err">{err}</p> : null}
            <div className="om-modal__actions"><button type="button" className="ff-btn" disabled={busy} onClick={() => setEdit(null)}>Cancel</button><button type="button" className="ff-btn ff-btn--primary" disabled={busy || !edit.name.trim()} onClick={() => save(edit)}>{busy ? "Saving…" : "Save"}</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
