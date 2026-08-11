/**
 * Pure helpers for rendering CMS "Pages" (policy/info) content — shared by the
 * public LegalPage renderer and unit-tested in isolation. No I/O, framework-free.
 *
 *  - groupBody: turns a section's paragraph array into ordered blocks, grouping
 *    consecutive "- " lines into a single semantic list (accessible <ul>). Content
 *    with no "- " lines is unaffected, so every existing policy page renders exactly
 *    as before.
 *  - injectSupportEmail: resolves the {{supportEmail}} token from Site Settings at
 *    render time (never hard-coded). If the email is unavailable, the line degrades
 *    gracefully to a fixed, honest fallback.
 */
import type { PageSection } from "@/services/cmsService";

export const SUPPORT_EMAIL_TOKEN = "{{supportEmail}}";
export const SUPPORT_UNAVAILABLE = "Support information unavailable.";

export type BodyBlock = { type: "p"; text: string } | { type: "list"; items: string[] };

const LIST_PREFIX = /^[-•]\s+/; // "- item" or "• item"

/** Group a paragraph array into paragraphs + bullet lists (consecutive "- " lines). */
export function groupBody(body: string[]): BodyBlock[] {
  const blocks: BodyBlock[] = [];
  for (const raw of body) {
    const line = raw ?? "";
    if (LIST_PREFIX.test(line.trimStart())) {
      const item = line.trimStart().replace(LIST_PREFIX, "").trim();
      const last = blocks[blocks.length - 1];
      if (last && last.type === "list") last.items.push(item);
      else blocks.push({ type: "list", items: [item] });
    } else {
      blocks.push({ type: "p", text: line });
    }
  }
  return blocks;
}

/**
 * Separate a trailing heading-less section (the "closing statement") from the body
 * sections, so it can be rendered as the page's quiet closing signature rather than
 * another content paragraph. Pure — no CMS field is added; the closing simply lives
 * as the last heading-less section in the existing sections array.
 */
export function splitClosing(sections: PageSection[]): { sections: PageSection[]; closing?: string } {
  const last = sections[sections.length - 1];
  if (last && !last.heading && (last.body ?? []).some((b) => b.trim())) {
    return { sections: sections.slice(0, -1), closing: (last.body ?? []).map((b) => b.trim()).filter(Boolean).join(" ") };
  }
  return { sections };
}

/**
 * Replace the {{supportEmail}} token across all section bodies with the resolved
 * Site Settings email. When the email is blank/absent, the whole line becomes the
 * graceful fallback ("Support information unavailable.") rather than leaking a token.
 */
export function injectSupportEmail(sections: PageSection[], email?: string | null): PageSection[] {
  const clean = (email ?? "").trim();
  if (!sections.some((s) => s.body?.some((b) => b.includes(SUPPORT_EMAIL_TOKEN)))) return sections;
  return sections.map((s) => ({
    ...s,
    body: (s.body ?? []).map((line) => {
      if (!line.includes(SUPPORT_EMAIL_TOKEN)) return line;
      return clean ? line.split(SUPPORT_EMAIL_TOKEN).join(clean) : SUPPORT_UNAVAILABLE;
    }),
  }));
}
