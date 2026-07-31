"use client";

import { useState } from "react";
import type { PageAuditEntry } from "@/services/pageAuditService";

/**
 * Audit timeline (Phase 8 · point 35) — a builder panel showing every homepage change: who, what, when,
 * and the previous → new value per field. Reads the immutable audit stream; each edit row expands to the
 * field-level diff. Read-only history.
 */
const EVENT_LABEL: Record<string, string> = {
  "page.edited": "Edited", "page.published": "Published", "page.scheduled": "Scheduled",
  "page.published_sections": "Published sections", "page.reset": "Reset", "page.restored": "Restored",
};
const when = (iso: string) => { try { return new Date(iso).toLocaleString(); } catch { return iso; } };

export function AuditTimelinePanel({ audit, onRefresh, labelOf }: {
  audit: PageAuditEntry[]; onRefresh: () => void; labelOf: (type: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="hp-seo hp-audit">
      <button type="button" className="hp-seo__toggle" aria-expanded={open} onClick={() => { if (!open) onRefresh(); setOpen((v) => !v); }}>
        <span>{open ? "▾" : "▸"} Audit timeline</span>
        <span className="admin__muted">{audit.length ? `${audit.length} change${audit.length === 1 ? "" : "s"}` : "no changes yet"}</span>
      </button>
      {open ? (
        <div className="hp-audit__body">
          <div className="hp-audit__head">
            <span className="admin__muted">Who · what · when — every change is recorded.</span>
            <button type="button" className="ff-btn ff-btn--mini" onClick={onRefresh}>Refresh</button>
          </div>
          {audit.length ? (
            <ul className="hp-audit__list">
              {audit.map((e) => (
                <li key={e.id} className="hp-audit__item">
                  <button type="button" className="hp-audit__row" disabled={!e.changes.length} onClick={() => setExpanded(expanded === e.id ? null : e.id)}>
                    <span className={`hp-audit__badge is-${e.event === "page.published" ? "pub" : "edit"}`}>{EVENT_LABEL[e.event] ?? e.event}</span>
                    <span className="hp-audit__who">{e.actorName}</span>
                    <span className="hp-audit__what admin__muted">{e.summary}</span>
                    <span className="hp-audit__when admin__muted">{when(e.when)}</span>
                    {e.changes.length ? <span className="hp-audit__caret">{expanded === e.id ? "▾" : "▸"}</span> : null}
                  </button>
                  {expanded === e.id && e.changes.length ? (
                    <div className="hp-audit__diff">
                      {e.changes.map((c, i) => (
                        <div key={i} className="hp-audit__change">
                          <span className="hp-audit__section">{c.kind === "added" ? "＋ " : c.kind === "removed" ? "－ " : ""}{labelOf(c.sectionType)}</span>
                          {c.fields.map((f, j) => (
                            <div key={j} className="hp-audit__field">
                              <span className="hp-audit__fname">{f.field}</span>
                              <span className="hp-audit__prev" title={f.prev}>{f.prev || "—"}</span>
                              <span className="hp-audit__arrow">→</span>
                              <span className="hp-audit__next" title={f.next}>{f.next || "—"}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : <p className="admin__muted" style={{ margin: "8px 0" }}>No changes recorded yet. Edits, publishes and restores appear here.</p>}
        </div>
      ) : null}
    </div>
  );
}
