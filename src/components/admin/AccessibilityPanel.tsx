"use client";

import { useMemo, useState } from "react";
import type { ComposedSection } from "@/services/pageComposerService";
import type { SectionSchema } from "@/lib/cms/sectionSchema";
import { checkAccessibility } from "@/lib/cms/accessibilityCheck";

/**
 * Accessibility checker (Phase 7 · point 32) — a builder panel that audits the current draft for missing
 * alt text, heading-hierarchy problems, low colour contrast, broken buttons, and empty links. Computed
 * live from the editor's section state (client-side, no render needed) so warnings update as you type.
 */
const RULE_LABEL: Record<string, string> = { alt: "Missing alt text", heading: "Heading hierarchy", contrast: "Low contrast", button: "Broken button", link: "Empty link" };

export function AccessibilityPanel({ sections, schemas, labelOf, onFocus }: {
  sections: ComposedSection[]; schemas: Record<string, SectionSchema>; labelOf: (type: string) => string; onFocus: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const issues = useMemo(
    () => checkAccessibility(sections.map((s) => ({ id: s.id, type: s.type, enabled: s.enabled, settings: (s.settings ?? {}) as Record<string, unknown> })), schemas, labelOf),
    [sections, schemas, labelOf],
  );
  const errors = issues.filter((i) => i.severity === "error").length;
  const warns = issues.length - errors;

  return (
    <div className="hp-seo hp-a11y">
      <button type="button" className="hp-seo__toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>{open ? "▾" : "▸"} Accessibility checker</span>
        <span className="admin__muted">{issues.length ? `${errors ? `${errors} error${errors === 1 ? "" : "s"}` : ""}${errors && warns ? " · " : ""}${warns ? `${warns} warning${warns === 1 ? "" : "s"}` : ""}` : "✓ no issues found"}</span>
      </button>
      {open ? (
        <div className="hp-a11y__body">
          {issues.length ? (
            <ul className="hp-a11y__list">
              {issues.map((i, n) => (
                <li key={n} className={`hp-a11y__item is-${i.severity}`}>
                  <button type="button" className="hp-a11y__jump" onClick={() => onFocus(i.sectionId)} title="Show this section">
                    <span className={`hp-a11y__tag is-${i.severity}`}>{i.severity === "error" ? "✕" : "⚠"} {RULE_LABEL[i.rule] ?? i.rule}</span>
                    <span className="hp-a11y__where">{i.sectionLabel}</span>
                  </button>
                  <span className="hp-a11y__msg admin__muted">{i.message}</span>
                </li>
              ))}
            </ul>
          ) : <p className="admin__muted" style={{ margin: "6px 0" }}>No accessibility issues detected in the current draft. ✓</p>}
          <p className="cfg-hint">Static checks over your content (alt text, headings, contrast, buttons, links). A full audit should still test with a screen reader + keyboard.</p>
        </div>
      ) : null}
    </div>
  );
}
