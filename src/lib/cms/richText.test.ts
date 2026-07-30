import { describe, it, expect } from "vitest";
import { sanitizeHtml, richTextToPlain } from "@/lib/cms/richText";
import { validateContent, type SectionSchema } from "@/lib/cms/sectionSchema";

describe("sanitizeHtml (Phase 4 · point 16 — allowlist)", () => {
  it("keeps allowlisted formatting tags", () => {
    const out = sanitizeHtml("<p>Hello <strong>bold</strong> <em>italic</em> <a href='/shop'>link</a></p><ul><li>a</li></ul><blockquote>q</blockquote><h2>H</h2>");
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<em>italic</em>");
    expect(out).toContain('<a href="/shop">link</a>');
    expect(out).toContain("<li>a</li>");
    expect(out).toContain("<blockquote>q</blockquote>");
    expect(out).toContain("<h2>H</h2>");
  });
  it("strips <script> and its content", () => {
    expect(sanitizeHtml("<p>ok</p><script>alert(1)</script>")).toBe("<p>ok</p>");
    expect(sanitizeHtml("before<script>steal()</script>after")).toBe("beforeafter");
  });
  it("strips style / iframe / object", () => {
    expect(sanitizeHtml("<style>*{}</style><iframe src=x></iframe><object></object><p>x</p>")).toBe("<p>x</p>");
  });
  it("removes event-handler attributes and javascript: URLs", () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeHtml('<p onclick="evil()">x</p>')).toBe("<p>x</p>");
    expect(sanitizeHtml('<img src="javascript:alert(1)" alt="a">')).toBe('<img alt="a">');
    expect(sanitizeHtml('<img src="x" onerror="alert(1)" alt="a">')).toBe('<img src="x" alt="a">');
  });
  it("unwraps disallowed tags but keeps their text", () => {
    expect(sanitizeHtml("<div><span style='color:red'>hi</span> <marquee>go</marquee></div>")).toBe("hi go");
  });
  it("keeps safe http/relative/anchor links + images", () => {
    expect(sanitizeHtml('<a href="https://x.com" title="t">x</a>')).toContain('href="https://x.com"');
    expect(sanitizeHtml('<img src="https://res.cloudinary.com/x.jpg" alt="a">')).toContain('src="https://res.cloudinary.com/x.jpg"');
  });
  it("richTextToPlain flattens to text (for search/empties)", () => {
    expect(richTextToPlain("<p>Hello <strong>world</strong></p>")).toBe("Hello world");
    expect(richTextToPlain("<script>x</script>")).toBe("");
  });
});

const CONTENT_SCHEMA: SectionSchema = {
  type: "content-blocks", label: "Editorial content", note: "",
  fields: [
    {
      key: "blocks", label: "Content blocks", type: "blocks", required: true, minBlocks: 1,
      blockVariants: [
        { key: "paragraph", label: "Paragraph", fields: [{ key: "html", label: "Text", type: "richtext", required: true }] },
        { key: "cta", label: "Button", fields: [{ key: "label", label: "Button label", type: "text", required: true }, { key: "href", label: "Button URL", type: "url", required: true }] },
      ],
    },
  ],
};

describe("blockVariants validation (Phase 4 · points 17/18)", () => {
  it("validates each block against its own variant's fields", () => {
    const errs = validateContent(CONTENT_SCHEMA, { blocks: [{ _type: "cta", label: "Go" /* href missing */ }] });
    expect(errs.some((e) => /Button URL.*required/i.test(e))).toBe(true);
  });
  it("a complete heterogeneous set passes", () => {
    const errs = validateContent(CONTENT_SCHEMA, { blocks: [{ _type: "paragraph", html: "<p>hi</p>" }, { _type: "cta", label: "Shop", href: "/shop" }] });
    expect(errs).toEqual([]);
  });
});
