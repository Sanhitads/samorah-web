import { sanitizeHtml } from "@/lib/cms/richText";

/**
 * Renders staff-authored rich text safely — sanitized through the shared allowlist before it reaches
 * the DOM. Deterministic (server + client identical), so it's a plain server component. Used by the
 * Editorial-content section's paragraph blocks (Phase 4 · point 16).
 */
export function RichText({ html, className }: { html: string | null | undefined; className?: string }) {
  const clean = sanitizeHtml(html);
  if (!clean.trim()) return null;
  return <div className={className} dangerouslySetInnerHTML={{ __html: clean }} />;
}
