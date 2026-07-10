/**
 * Email body authoring (review point 2) — the email body is STRUCTURED BLOCKS edited
 * through the same schema DSL as the Homepage, then rendered to inline-styled email
 * HTML here. No TinyMCE, no drag-drop, no freeform HTML — a small typed block set
 * (heading / paragraph / button / note / divider / details-placeholder). {{tokens}}
 * interpolate against the send-time variables.
 */
import type { SectionSchema } from "@/lib/cms/sectionSchema";
import { C, emailLayout, sectionHeader, sectionHero, sectionFooter } from "./templates";

const serif = "Georgia,'Times New Roman',serif";
const sans = "Arial,Helvetica,sans-serif";

export interface EmailBlock { type: string; text?: string; ctaLabel?: string; ctaHref?: string }

/** The editor schema (drives the admin form via SchemaForm — same engine as pages). */
export const EMAIL_TEMPLATE_SCHEMA: SectionSchema = {
  type: "email", label: "Email", note: "Structured email — blocks, not HTML",
  fields: [
    { key: "subject", label: "Subject", type: "text", required: true, maxLength: 120, help: "{{tokens}} supported" },
    { key: "preheader", label: "Preheader", type: "text", maxLength: 140, description: "Inbox preview text shown after the subject." },
    { key: "eyebrow", label: "Hero eyebrow", type: "text", maxLength: 40 },
    { key: "heading", label: "Hero heading", type: "text", maxLength: 80 },
    {
      key: "blocks", label: "Body", type: "blocks", blockLabel: "Block", maxBlocks: 20,
      description: "The email body, block by block. Reorder freely.",
      blockFields: [
        { key: "type", label: "Type", type: "select", default: "paragraph", options: [
          { value: "paragraph", label: "Paragraph" }, { value: "heading", label: "Heading" }, { value: "cta", label: "Button" },
          { value: "note", label: "Small note" }, { value: "divider", label: "Divider" }, { value: "details", label: "Order/details placeholder" },
        ] },
        { key: "text", label: "Text", type: "textarea", help: "paragraph / heading / note. {{tokens}} supported." },
        { key: "ctaLabel", label: "Button label", type: "text", maxLength: 24, showIf: { field: "type", equals: "cta" } },
        { key: "ctaHref", label: "Button URL", type: "url", showIf: { field: "type", equals: "cta" } },
      ],
    },
  ],
};

export function interpolate(str: string, vars: Record<string, string>): string {
  return String(str ?? "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{{${k}}}`));
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function blockHtml(b: EmailBlock, vars: Record<string, string>): string {
  const t = (b.text ? interpolate(b.text, vars) : "");
  switch (b.type) {
    case "heading": return `<tr><td style="padding:14px 40px 4px;text-align:center;font:400 20px/1.3 ${serif};color:${C.ink};">${esc(t)}</td></tr>`;
    case "note": return `<tr><td style="padding:6px 40px;text-align:center;font:400 12px/1.6 ${serif};color:${C.smoke};">${esc(t)}</td></tr>`;
    case "divider": return `<tr><td style="padding:8px 40px;"><div style="border-top:1px solid ${C.hair};"></div></td></tr>`;
    case "cta": {
      const label = interpolate(b.ctaLabel ?? "", vars); const href = interpolate(b.ctaHref ?? "#", vars);
      return `<tr><td style="padding:16px 40px;text-align:center;"><a href="${href}" style="display:inline-block;padding:14px 30px;background:${C.ink};color:${C.ivory};font:400 11px/1 ${sans};letter-spacing:2px;text-transform:uppercase;text-decoration:none;">${esc(label)}</a></td></tr>`;
    }
    case "details": return vars.details ?? ""; // injected transactional HTML (order table etc.)
    case "paragraph":
    default: return `<tr><td style="padding:8px 40px;font:400 14px/1.7 ${serif};color:${C.smoke};text-align:center;">${esc(t).replace(/\n/g, "<br/>")}</td></tr>`;
  }
}

export interface AuthoredTemplate { subject: string; preheader?: string; eyebrow?: string; heading?: string; blocks: EmailBlock[] }

/** Render an authored template + vars → a full inline-styled email {html, text}. */
export function renderEmailBlocks(tpl: AuthoredTemplate, vars: Record<string, string>): { html: string; text: string } {
  const heading = tpl.heading ? interpolate(tpl.heading, vars) : "";
  const hero = heading ? sectionHero(tpl.eyebrow ? interpolate(tpl.eyebrow, vars) : "", heading, "") : "";
  const body = (tpl.blocks ?? []).map((b) => blockHtml(b, vars)).join("");
  const preheaderSpan = tpl.preheader ? `<span style="display:none;max-height:0;overflow:hidden;">${esc(interpolate(tpl.preheader, vars))}</span>` : "";
  const html = emailLayout(preheaderSpan + sectionHeader() + hero + body + sectionFooter());
  const text = [heading, ...(tpl.blocks ?? []).map((b) => (b.type === "cta" ? `${interpolate(b.ctaLabel ?? "", vars)}: ${interpolate(b.ctaHref ?? "", vars)}` : b.type === "divider" || b.type === "details" ? "" : interpolate(b.text ?? "", vars)))].filter(Boolean).join("\n\n");
  return { html, text };
}
