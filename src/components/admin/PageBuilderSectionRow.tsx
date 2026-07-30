"use client";

import { Reorder, useDragControls } from "framer-motion";
import type { ComposedSection } from "@/services/pageComposerService";
import type { FieldDef } from "@/lib/cms/sectionSchema";
import { SchemaForm, type MediaOption, type EntityOptions } from "./SchemaForm";
import { sectionState, type SectionState, type EffectiveState } from "@/lib/cms/sectionState";

const STATE_OPTS: { v: SectionState; l: string }[] = [
  { v: "visible", l: "Visible" }, { v: "hidden", l: "Hidden" }, { v: "scheduled", l: "Scheduled" }, { v: "archived", l: "Archived" },
];
const EFF_LABEL: Record<EffectiveState, string> = { published: "Published", draft: "Draft", hidden: "Hidden", scheduled: "Scheduled", expired: "Expired", archived: "Archived" };

/**
 * One draggable section row in the Homepage Builder (Phase 2). Uses framer-motion Reorder + a dedicated
 * drag handle (so dragging never fights the inline form), a visibility status dropdown (visible/hidden/
 * scheduled/archived), duplicate, save-to-library, and a guarded remove. Keeps ↑/↓ for keyboard users.
 */
export function PageBuilderSectionRow({
  section, index, total, open, focused, flashing, statusTone, statusLabel, note, label, fields, media, entities, confirming, draggable = true,
  effState, errors, selected, dimmed, matched,
  onFocus, onToggle, onField, onSetState, onSchedule, onDuplicate, onSaveToLibrary, onMove, onToggleSelect, onAskRemove, onRemove, onCancelRemove,
}: {
  section: ComposedSection; index: number; total: number; open: boolean; focused: boolean; flashing: boolean;
  statusTone: string; statusLabel: string; note: string; label: string; fields: FieldDef[]; media: MediaOption[]; entities: EntityOptions; confirming: boolean; draggable?: boolean;
  effState: EffectiveState; errors: string[]; selected: boolean; dimmed?: boolean; matched?: boolean;
  onFocus: (id: string) => void; onToggle: (id: string) => void; onField: (i: number, k: string, v: unknown) => void;
  onSetState: (i: number, s: SectionState) => void; onSchedule: (i: number, k: "__from" | "__until", v: string) => void;
  onDuplicate: (i: number) => void; onSaveToLibrary: (i: number) => void; onMove: (i: number, dir: -1 | 1) => void; onToggleSelect: (id: string) => void;
  onAskRemove: (id: string) => void; onRemove: (i: number) => void; onCancelRemove: () => void;
}) {
  const controls = useDragControls();
  const s = section;
  const state = sectionState(s.settings);
  const from = String(s.settings?.__from ?? "");
  const until = String(s.settings?.__until ?? "");
  const cls = `hp-section${flashing ? " is-flash" : ""}${focused ? " is-active" : ""}${state === "archived" ? " is-archived" : ""}${selected ? " is-selected" : ""}${dimmed ? " is-dim" : ""}${matched ? " is-match" : ""}`;
  const inner = (
    <>
      <div className="hp-section__row">
        <input type="checkbox" className="hp-select" checked={selected} onChange={() => onToggleSelect(s.id)} title="Select to publish only this section" aria-label={`Select ${label} to publish`} />
        <button type="button" className="hp-drag" title="Drag to reorder" aria-label="Drag to reorder" disabled={!draggable} onPointerDown={(e) => { if (draggable) controls.start(e); }}>⠿</button>
        <span className="hp-section__ord admin__mono">{index + 1}</span>
        <button type="button" className="hp-section__name" onClick={() => onFocus(s.id)} title="Show in preview">{label}<span className="admin__muted"> · {s.type}</span></button>
        <span className={`hp-eff hp-eff--${effState}`} title="Publishing state">{EFF_LABEL[effState]}</span>
        {errors.length ? <button type="button" className="hp-errbadge" title={errors.join(" · ")} onClick={() => onToggle(s.id)}>⚠ {errors.length}</button> : null}
        <span className={`hp-status hp-status--${statusTone}`} title="Save status">{statusLabel}</span>
        <select className="cfg-toggle" value={state} onChange={(e) => onSetState(index, e.target.value as SectionState)} title="Visibility" aria-label={`Visibility for ${label}`}>
          {STATE_OPTS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
        <span className="ff-actions">
          <button type="button" className="ff-btn" data-active={open ? "1" : "0"} onClick={() => onToggle(s.id)}>Edit content</button>
          <button type="button" className="ff-btn ff-btn--mini" title="Duplicate section" onClick={() => onDuplicate(index)}>⧉</button>
          <button type="button" className="ff-btn ff-btn--mini" title="Save to library" onClick={() => onSaveToLibrary(index)}>☆</button>
          <button type="button" className="ff-btn ff-btn--mini" disabled={index === 0} title="Move up" onClick={() => onMove(index, -1)}>↑</button>
          <button type="button" className="ff-btn ff-btn--mini" disabled={index === total - 1} title="Move down" onClick={() => onMove(index, 1)}>↓</button>
          {confirming ? (
            <>
              <span className="admin__muted" style={{ marginRight: 2 }}>Delete?</span>
              <button type="button" className="ff-btn ff-btn--mini ff-btn--danger" onClick={() => onRemove(index)}>Yes</button>
              <button type="button" className="ff-btn ff-btn--mini" onClick={onCancelRemove}>No</button>
            </>
          ) : (
            <button type="button" className="ff-btn ff-btn--mini ff-btn--danger" title="Remove (prefer Hidden / Archived)" onClick={() => onAskRemove(s.id)}>🗑</button>
          )}
        </span>
      </div>
      {state === "scheduled" ? (
        <div className="hp-sched">
          <label className="cfg-field cfg-field--sm"><span>Publish on</span><input type="datetime-local" value={from} onChange={(e) => onSchedule(index, "__from", e.target.value)} /></label>
          <label className="cfg-field cfg-field--sm"><span>Unpublish on</span><input type="datetime-local" value={until} onChange={(e) => onSchedule(index, "__until", e.target.value)} /></label>
        </div>
      ) : null}
      {open ? (
        <div className="hp-settings">
          {errors.length ? <ul className="hp-errs">{errors.map((e, i) => <li key={i}>⚠ {e}</li>)}</ul> : null}
          <p className="cfg-hint">{note}</p>
          <SchemaForm fields={fields} values={s.settings ?? {}} media={media} entities={entities} onChange={(k, v) => onField(index, k, v)} />
        </div>
      ) : null}
    </>
  );
  // Server + first client render use a plain <li> (identical markup) to avoid a framer-motion drag
  // hydration mismatch; the draggable Reorder.Item is swapped in only after mount (draggable=true).
  if (!draggable) return <li className={cls} data-sid={s.id} data-off={s.enabled ? "0" : "1"}>{inner}</li>;
  return (
    <Reorder.Item value={s.id} dragListener={false} dragControls={controls} className={cls} data-sid={s.id} data-off={s.enabled ? "0" : "1"}>
      {inner}
    </Reorder.Item>
  );
}
