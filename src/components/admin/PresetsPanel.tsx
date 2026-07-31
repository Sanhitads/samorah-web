"use client";

import { useState } from "react";
import type { ComposedSection } from "@/services/pageComposerService";
import type { PagePreset } from "@/services/pagePresetsService";

/**
 * Homepage presets + seasonal homepages (Phase 7 · points 29/30). Save the current composition as a
 * named/seasonal preset ("Christmas Homepage", "Launch Homepage"), then **Apply** it into the draft
 * (clone) or **Activate** it (publish live) with one click — the seasonal switch. Mirrors the SEO/
 * analytics panels. Client-safe: the season list is declared here (the service is server-only).
 */
const SEASONS = ["Default", "Autumn", "Summer", "Christmas", "Diwali", "Launch"];

export function PresetsPanel({ presets, currentSections, busy, onSave, onDelete, onApply, onActivate }: {
  presets: PagePreset[];
  currentSections: ComposedSection[];
  busy: boolean;
  onSave: (name: string, season: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onApply: (sections: ComposedSection[]) => void;
  onActivate: (sections: ComposedSection[]) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [season, setSeason] = useState("Default");
  const [confirmActivate, setConfirmActivate] = useState<string | null>(null);

  // A name is auto-derived from the season when none is typed, so Save is never stuck disabled.
  const derivedName = name.trim() || (season && season !== "Default" ? `${season} Homepage` : "Homepage preset");
  const doSave = async () => { await onSave(derivedName, season); setName(""); };

  return (
    <div className="hp-seo hp-presets">
      <button type="button" className="hp-seo__toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>{open ? "▾" : "▸"} Presets &amp; seasonal homepages</span>
        <span className="admin__muted">{presets.length ? `${presets.length} saved` : "save this homepage as a preset"}</span>
      </button>
      {open ? (
        <div className="hp-presets__body">
          <div className="hp-presets__save">
            <input className="hp-presets__name" value={name} onChange={(e) => setName(e.target.value)} placeholder={`Preset name (default: “${derivedName}”)`} maxLength={80} />
            <select value={season} onChange={(e) => setSeason(e.target.value)} title="Season">
              {SEASONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button type="button" className="ff-btn ff-btn--primary ff-btn--mini" disabled={busy} onClick={doSave}>Save current as preset</button>
          </div>

          {presets.length ? (
            <ul className="hp-presets__list">
              {presets.map((p) => (
                <li key={p.id} className="hp-presets__item">
                  <span className="hp-presets__meta">
                    <span className="hp-presets__pname">{p.name}</span>
                    {p.season ? <span className="hp-presets__season">{p.season}</span> : null}
                    <span className="admin__muted"> · {p.sections.length} section{p.sections.length === 1 ? "" : "s"}</span>
                  </span>
                  <span className="ff-actions">
                    <button type="button" className="ff-btn ff-btn--mini" disabled={busy} title="Load into the draft to review" onClick={() => onApply(p.sections)}>Apply to draft</button>
                    {confirmActivate === p.id ? (
                      <>
                        <span className="admin__muted" style={{ fontSize: 11 }}>Publish live?</span>
                        <button type="button" className="ff-btn ff-btn--mini ff-btn--primary" disabled={busy} onClick={async () => { setConfirmActivate(null); await onActivate(p.sections); }}>Yes, activate</button>
                        <button type="button" className="ff-btn ff-btn--mini" onClick={() => setConfirmActivate(null)}>No</button>
                      </>
                    ) : (
                      <button type="button" className="ff-btn ff-btn--mini" disabled={busy} title="Publish this preset live now" onClick={() => setConfirmActivate(p.id)}>Activate</button>
                    )}
                    <button type="button" className="ff-btn ff-btn--mini ff-btn--danger" disabled={busy} onClick={() => onDelete(p.id)}>×</button>
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="admin__muted" style={{ margin: "8px 0" }}>No presets yet. Save the current homepage above, then clone or one-click activate it seasonally.</p>}
          <p className="cfg-hint">Save clones the whole composition. <b>Apply</b> loads a preset into the draft (review, then Save/Publish). <b>Activate</b> publishes it live immediately — the one-click seasonal switch ({currentSections.length} sections currently in the draft).</p>
        </div>
      ) : null}
    </div>
  );
}
