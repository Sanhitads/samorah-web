/**
 * Rich-text sanitizer (Homepage Builder · Phase 4 · point 16) — a strict ALLOWLIST run both when the
 * editor emits HTML and when the storefront renders it. Only a small set of formatting tags + safe
 * attributes survive; scripts, styles, iframes, event handlers, and javascript:/data: URLs are stripped.
 * Deterministic + dependency-free, so it runs identically on the server and the client (no hydration
 * mismatch). Content is authored only by staff with catalog.manage — a trusted role — so an allowlist
 * regex is sufficient here; if untrusted users ever author rich text, swap in a DOM sanitizer.
 */
const ALLOWED_TAGS = new Set(["a", "b", "strong", "i", "em", "u", "ul", "ol", "li", "blockquote", "h2", "h3", "h4", "p", "br", "img"]);
const ALLOWED_ATTRS: Record<string, Set<string>> = { a: new Set(["href", "title"]), img: new Set(["src", "alt"]) };
const DANGEROUS_SCHEME = /^(?:javascript|data|vbscript):/i;

/**
 * Decide if a URL attribute value carries a dangerous scheme AFTER the browser would decode it. The
 * naive check tested the raw value, which HTML-entity/control-char encoding could slip past (e.g.
 * `&#106;avascript:` or `java&#9;script:`). Here we decode numeric + scheme-relevant named entities and
 * strip all ASCII whitespace/control chars (which browsers ignore inside a scheme) before testing.
 * The check drives rejection only — the original (safe) value is what gets stored/rendered.
 */
function isDangerousUrl(raw: string): boolean {
  const decoded = raw
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ""; } })
    .replace(/&#(\d+);?/g, (_, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch { return ""; } })
    .replace(/&colon;/gi, ":").replace(/&tab;/gi, "\t").replace(/&newline;/gi, "\n").replace(/&sol;/gi, "/");
  const stripped = decoded.replace(/[\x00-\x20 ]+/g, ""); // browsers ignore whitespace/control chars in a scheme
  return DANGEROUS_SCHEME.test(stripped);
}

export function sanitizeHtml(input: string | null | undefined): string {
  if (!input || typeof input !== "string") return "";
  let html = input;
  // 1. Drop dangerous elements together with their content.
  html = html.replace(/<(script|style|iframe|object|embed|noscript|template|title)[\s\S]*?<\/\1\s*>/gi, "");
  html = html.replace(/<(script|style|iframe|object|embed|link|meta|base)[^>]*\/?>/gi, "");
  // 2. Remove comments.
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  // 3. Keep allowlisted tags (with only allowlisted, safe attributes); unwrap everything else (keep text).
  html = html.replace(/<(\/?)([a-zA-Z0-9]+)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (_m, close: string, tagRaw: string, attrs: string) => {
    const tag = tagRaw.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    if (close) return `</${tag}>`;
    const allowed = ALLOWED_ATTRS[tag];
    if (!allowed) return `<${tag}>`;
    const kept: string[] = [];
    const attrRe = /([a-zA-Z0-9-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let a: RegExpExecArray | null;
    while ((a = attrRe.exec(attrs))) {
      const name = a[1].toLowerCase();
      const val = a[2] ?? a[3] ?? "";
      if (!allowed.has(name)) continue;
      if ((name === "href" || name === "src") && isDangerousUrl(val)) continue;
      kept.push(`${name}="${val.replace(/"/g, "&quot;")}"`);
    }
    return `<${tag}${kept.length ? " " + kept.join(" ") : ""}>`;
  });
  return html;
}

/** Plain-text preview of rich HTML (for search / validation / empties). */
export function richTextToPlain(html: string | null | undefined): string {
  return sanitizeHtml(html).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}
