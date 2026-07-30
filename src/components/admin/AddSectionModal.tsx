"use client";

import type { SectionTemplate, LibraryEntry } from "./PageBuilder";

/**
 * "Add section" picker (Homepage Builder · Phase 2 · points 8 + 9). Three groups: starter Templates
 * (pre-filled real sections), Your Library (saved reusable blocks, deletable), and Blank sections
 * (raw types). Coming-soon templates are shown disabled — honest about what needs a new component.
 */
export function AddSectionModal({ templates, library, blankTypes, onInsert, onDeleteLibrary, onClose }: {
  templates: SectionTemplate[];
  library: LibraryEntry[];
  blankTypes: { type: string; label: string; note: string }[];
  onInsert: (type: string, settings: Record<string, unknown>) => void;
  onDeleteLibrary: (id: string) => void;
  onClose: () => void;
}) {
  const ready = templates.filter((t) => !t.comingSoon);
  const soon = templates.filter((t) => t.comingSoon);
  return (
    <div className="om-modal" role="dialog" aria-modal="true" aria-label="Add a section" onClick={onClose}>
      <div className="om-modal__card om-modal__card--wide" onClick={(e) => e.stopPropagation()}>
        <h2 className="om-modal__title">Add a section</h2>

        <p className="asm-group__title">Templates</p>
        <div className="asm-grid">
          {ready.map((t) => (
            <button key={t.id} type="button" className="asm-card" onClick={() => onInsert(t.type, t.settings)}>
              <span className="asm-card__label">{t.label}</span>
              <span className="asm-card__desc">{t.description}</span>
            </button>
          ))}
        </div>

        <p className="asm-group__title">Your library</p>
        {library.length ? (
          <div className="asm-grid">
            {library.map((e) => (
              <div key={e.id} className="asm-card asm-card--lib">
                <button type="button" className="asm-card__hit" onClick={() => onInsert(e.type, e.settings)}>
                  <span className="asm-card__label">{e.name}</span>
                  <span className="asm-card__desc">{e.type} · saved block</span>
                </button>
                <button type="button" className="asm-card__del" title="Delete from library" aria-label={`Delete ${e.name}`} onClick={() => onDeleteLibrary(e.id)}>✕</button>
              </div>
            ))}
          </div>
        ) : (
          <p className="asm-empty">No saved blocks yet. On any section, click <b>☆ Save to library</b> to reuse it here — and on other pages.</p>
        )}

        <p className="asm-group__title">Blank section</p>
        <div className="asm-grid">
          {blankTypes.map((b) => (
            <button key={b.type} type="button" className="asm-card asm-card--blank" onClick={() => onInsert(b.type, {})}>
              <span className="asm-card__label">{b.label}</span>
              <span className="asm-card__desc">{b.note || "Empty section"}</span>
            </button>
          ))}
        </div>

        {soon.length ? (
          <>
            <p className="asm-group__title">Coming soon <span className="admin__muted">— need a new component</span></p>
            <div className="asm-grid">
              {soon.map((t) => (
                <span key={t.id} className="asm-card asm-card--soon" aria-disabled="true" title="Not available yet">
                  <span className="asm-card__label">{t.label}</span>
                  <span className="asm-card__desc">{t.description}</span>
                </span>
              ))}
            </div>
          </>
        ) : null}

        <div className="om-modal__actions"><button type="button" className="ff-btn" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
