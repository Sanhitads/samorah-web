/**
 * Homepage accessibility checker (Phase 7 · point 32). A pure, schema-aware audit of the draft sections
 * that flags the five requested issues: missing alt text, heading-hierarchy problems, low colour
 * contrast, broken buttons (label without a working link), and empty links (link without a label).
 * Best-effort + static (no DOM) — it reads the content the editor controls, so it runs instantly in the
 * builder without rendering. Reused for the Accessibility panel.
 */
import type { SectionSchema, FieldDef } from "./sectionSchema";
import { contrastRatio, AA_NORMAL } from "@/lib/a11y/contrast";

export type A11ySeverity = "error" | "warn";
export interface A11yIssue { sectionId: string; sectionLabel: string; severity: A11ySeverity; rule: string; message: string }
export interface A11ySection { id: string; type: string; enabled: boolean; settings: Record<string, unknown> }

const str = (v: unknown) => (typeof v === "string" ? v : "");
const isRealImage = (v: unknown) => typeof v === "string" && /^https?:\/\//.test(v);
const isHex = (v: unknown) => typeof v === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);
const brokenHref = (h: string) => !h.trim() || h.trim() === "#";
const keyLike = (obj: Record<string, unknown>, re: RegExp) => Object.keys(obj).find((k) => re.test(k) && isHex(obj[k]));

interface Heading { sectionId: string; sectionLabel: string; level: number; text: string }

/** Fields for a block, honouring heterogeneous `blockVariants` (keyed by `_type`). */
function blockFieldsFor(f: FieldDef, block: Record<string, unknown>): FieldDef[] {
  if (f.blockVariants) return f.blockVariants.find((bv) => bv.key === block._type)?.fields ?? [];
  return f.blockFields ?? [];
}

export function checkAccessibility(
  sections: A11ySection[],
  schemas: Record<string, SectionSchema>,
  labelOf: (type: string) => string,
): A11yIssue[] {
  const issues: A11yIssue[] = [];
  const headings: Heading[] = [];

  for (const s of sections) {
    if (!s.enabled) continue;
    const schema = schemas[s.type];
    if (!schema) continue;
    const label = labelOf(s.type);
    const push = (severity: A11ySeverity, rule: string, message: string) => issues.push({ sectionId: s.id, sectionLabel: label, severity, rule, message });

    // Walk a record (section settings, or a block) against its field defs, running the per-field checks.
    const walk = (fields: FieldDef[], content: Record<string, unknown>) => {
      // Missing alt — schema-driven via `altFor` (a text field bound to a sibling image).
      for (const f of fields) {
        if (f.altFor) {
          const img = content[f.altFor];
          const decorative = !!content[`${f.altFor}__decorative`];
          if (isRealImage(img) && !str(content[f.key]).trim() && !decorative) push("warn", "alt", `An image is missing alt text (or mark it decorative).`);
        }
      }
      // Buttons / links — a label without a working href is a broken button; an href without a label is an empty link.
      const labelKey = Object.keys(content).find((k) => /(^|_)(label|ctalabel)$/i.test(k) || k === "label" || k === "ctaLabel");
      const hrefKey = Object.keys(content).find((k) => /(href|url)$/i.test(k) || k === "href" || k === "ctaHref");
      if (labelKey || hrefKey) {
        const lbl = str(content[labelKey ?? ""]).trim();
        const href = str(content[hrefKey ?? ""]).trim();
        const ctaEnabled = content.ctaEnabled === undefined ? true : !!content.ctaEnabled;
        if (ctaEnabled && lbl && (!hrefKey || brokenHref(href))) push("error", "button", `Button "${lbl}" has no working link.`);
        if (ctaEnabled && href && !brokenHref(href) && hrefKey && labelKey && !lbl) push("error", "link", `A link points to ${href} but has no visible text.`);
      }
      // Low contrast — a text colour + background colour pair that fails WCAG AA (4.5:1).
      const fg = keyLike(content, /(text|ink|fg|foreground|heading).*colou?r|^colou?r$/i);
      const bg = keyLike(content, /(bg|background|surface|fill).*colou?r|^background$/i);
      if (fg && bg) {
        const ratio = contrastRatio(str(content[fg]), str(content[bg]));
        if (ratio !== null && ratio < AA_NORMAL) push("warn", "contrast", `Text/background contrast is ${ratio.toFixed(1)}:1 — below the 4.5:1 minimum.`);
      }
      // Recurse into blocks.
      for (const f of fields) {
        if (f.type === "blocks" && Array.isArray(content[f.key])) {
          for (const block of content[f.key] as Record<string, unknown>[]) {
            walk(blockFieldsFor(f, block), block);
            // Collect heading blocks (content-blocks) with an explicit level.
            if (block._type === "heading" && str(block.text).trim()) headings.push({ sectionId: s.id, sectionLabel: label, level: block.level === "h3" ? 3 : 2, text: str(block.text) });
          }
        }
      }
    };

    walk(schema.fields, s.settings ?? {});

    // Section-level headings: the hero headline is the page's H1; other sections' `heading`/`title` are H2.
    const headText = str((s.settings as Record<string, unknown>)?.heading) || str((s.settings as Record<string, unknown>)?.title);
    if (headText.trim()) headings.push({ sectionId: s.id, sectionLabel: label, level: s.type === "hero" ? 1 : 2, text: headText });
  }

  // Heading hierarchy: exactly one H1, and no skipped levels (e.g. H2 → H4).
  const h1s = headings.filter((h) => h.level === 1);
  if (h1s.length === 0 && headings.length) issues.push({ sectionId: headings[0].sectionId, sectionLabel: headings[0].sectionLabel, severity: "warn", rule: "heading", message: "No H1 heading on the page — the Hero headline should be the H1." });
  if (h1s.length > 1) for (const h of h1s.slice(1)) issues.push({ sectionId: h.sectionId, sectionLabel: h.sectionLabel, severity: "error", rule: "heading", message: `More than one H1 — "${h.text}" should be H2 or lower.` });
  let prev = 0;
  for (const h of headings) {
    if (prev && h.level > prev + 1) issues.push({ sectionId: h.sectionId, sectionLabel: h.sectionLabel, severity: "warn", rule: "heading", message: `Heading level jumps from H${prev} to H${h.level} ("${h.text}") — don't skip levels.` });
    prev = h.level;
  }

  return issues;
}
