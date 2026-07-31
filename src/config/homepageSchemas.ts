/**
 * Homepage section schemas (review points 2·3·9) — each section type declares its
 * editable fields + a config-derived default provider. The admin builds the editor
 * from `schema`; the storefront resolves content = schemaDefaults ⊕ configDefaults ⊕
 * saved settings. Object-based sections (hero/words/brand-story/letters) are fully
 * DB-editable; list-based sections are `sourced` (their items come from their own
 * config until the Page Builder generalises them).
 */
import type { SectionSchema } from "@/lib/cms/sectionSchema";
import { ALIGN_OPTIONS } from "@/lib/cms/sectionSchema";
import { registerPageType, type SectionDefinition } from "@/lib/cms/pageRegistry";
import type { SectionType } from "@/services/homepageService";
import { getActiveCampaign } from "@/config/campaigns";
import { getBrandStory } from "@/config/brandStory";
import { getEditorialVoice } from "@/config/voices";
import { getLettersInvitation } from "@/config/letters";
import { getHomeInvitations } from "@/config/invitations";
import { getVisibleChapters } from "@/config/chapters";
import { getFeaturedExperiences, ATMOSPHERE_HEADING } from "@/config/experiences";
import { getEditorialWorld } from "@/config/editorialWorld";

const IMPORTANCE_OPTIONS = ["Opening", "Ritual", "Detail", "Still Life", "Closing"].map((v) => ({ value: v, label: v }));

// Featured-content picker (point 28): copy these entity data keys → the section's display fields on pick.
const FEATURED_FILL = { title: "title", image: "image", imageAlt: "imageAlt", href: "href", blurb: "blurb" };

export const SECTION_DEFS: Record<SectionType, SectionDefinition> = {
  hero: {
    schema: {
      type: "hero", label: "Hero", note: "The opening threshold",
      fields: [
        { key: "eyebrow", label: "Eyebrow", type: "text", maxLength: 40 },
        { key: "heading", label: "Headline", type: "text", required: true, maxLength: 60, help: "Keep it short — long headlines wrap awkwardly on mobile" },
        { key: "subheading", label: "Subheading", type: "textarea", maxLength: 180 },
        // Conditional CTA (points 2 + 5): toggle reveals + requires the button fields.
        { key: "ctaEnabled", label: "Show call-to-action button", type: "boolean", default: true },
        { key: "ctaLabel", label: "Button label", type: "text", maxLength: 24, required: true, showIf: { field: "ctaEnabled", truthy: true } },
        { key: "ctaHref", label: "Button URL", type: "url", required: true, showIf: { field: "ctaEnabled", truthy: true } },
        { key: "heroImage", label: "Background image", type: "media", help: "Media URL or gradient:name placeholder" },
        { key: "imageFit", label: "Image fit", type: "select", help: "Fill crops to cover the hero (use the focal point to choose what stays); Fit shows the whole image (letterboxed for wide/tall images)", options: [
          { value: "cover", label: "Fill the space (crop — use focal point)" },
          { value: "contain", label: "Show the whole image (no cropping)" },
        ] },
        { key: "videoUrl", label: "Background video (optional)", type: "media", help: "MP4 / Cloudinary video URL — plays muted behind the hero and overrides the image", allowedMime: ["video/mp4", "video/webm"] },
        { key: "theme", label: "Theme", type: "select", options: [{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }] },
        // Phase 5 · point 24 — hero treatment controls (all additive; omitted → the original look).
        { key: "align", label: "Content alignment", type: "align", options: ALIGN_OPTIONS },
        { key: "overlayStyle", label: "Image overlay", type: "select", help: "Darkens the image so text stays legible", options: [
          { value: "scrim", label: "Editorial scrim (default)" },
          { value: "dark", label: "Even darken" },
          { value: "gradient", label: "Bottom-up gradient" },
          { value: "none", label: "None" },
        ] },
        { key: "overlayOpacity", label: "Overlay strength (%)", type: "number", min: 0, max: 100, help: "0 = no darkening, 100 = strongest" },
        { key: "buttonStyle", label: "Button style", type: "select", options: [
          { value: "ghost", label: "Ghost / outline (default)" },
          { value: "solid", label: "Solid" },
          { value: "underline", label: "Underline" },
        ] },
        { key: "animate", label: "Entrance animation", type: "boolean", default: true },
        { key: "showScroll", label: "Show scroll indicator", type: "boolean", default: true },
      ],
    },
    defaults: () => {
      const c = getActiveCampaign();
      return { eyebrow: c.eyebrow, heading: c.heading, subheading: c.subheading, ctaEnabled: true, ctaLabel: c.ctaLabel, ctaHref: c.ctaHref, heroImage: c.heroImage, imageFit: "cover", videoUrl: "", theme: c.theme, align: "left", overlayStyle: "scrim", buttonStyle: "ghost", animate: true, showScroll: true };
    },
  },
  "brand-story": {
    schema: {
      type: "brand-story", label: "Brand Story", note: "The maker's quiet — image + words + a link",
      fields: [
        { key: "eyebrow", label: "Eyebrow", type: "text", maxLength: 60 },
        { key: "heading", label: "Heading", type: "text", required: true, maxLength: 80 },
        { key: "body", label: "Body", type: "textarea", maxLength: 400 },
        { key: "quote", label: "Pull quote (optional — shown instead of body)", type: "textarea", maxLength: 200 },
        { key: "image", label: "Image", type: "media", help: "Upload, pick from Library, or choose a gradient" },
        { key: "imageAlt", label: "Image alt text", type: "text", maxLength: 160, altFor: "image" },
        { key: "orientation", label: "Image side", type: "select", options: [{ value: "image-left", label: "Image left" }, { value: "image-right", label: "Image right" }] },
        { key: "ctaLabel", label: "Button label", type: "text", maxLength: 24 },
        { key: "ctaHref", label: "Button URL", type: "url" },
      ],
    },
    defaults: () => { const s = getBrandStory(); return { eyebrow: s.eyebrow, heading: s.heading, body: s.body, quote: s.quote, image: s.image, imageAlt: s.imageAlt, orientation: s.orientation, ctaLabel: s.ctaLabel, ctaHref: s.ctaHref }; },
  },
  words: {
    schema: {
      type: "words", label: "Words", note: "One literary sentence",
      fields: [
        { key: "quote", label: "Quote", type: "textarea", required: true },
        { key: "author", label: "Author", type: "text" },
        { key: "align", label: "Alignment", type: "align", options: ALIGN_OPTIONS },
      ],
    },
    defaults: (cid) => { const v = getEditorialVoice(cid); return v ? { quote: v.quote, author: v.author } : {}; },
  },
  letters: {
    schema: {
      type: "letters", label: "The Letters", note: "Quiet editorial close (newsletter)",
      fields: [
        { key: "invitation", label: "Invitation", type: "text", required: true },
        { key: "supportingCopy", label: "Supporting copy", type: "textarea" },
        { key: "ctaLabel", label: "Button label", type: "text" },
        { key: "placeholder", label: "Field placeholder", type: "text" },
        { key: "promise", label: "Expectation line", type: "text" },
        { key: "successMessage", label: "Success message", type: "text" },
      ],
    },
    defaults: (cid) => {
      const l = getLettersInvitation(cid);
      if (!l) return {};
      return { invitation: l.invitation, supportingCopy: l.supportingCopy, ctaLabel: l.ctaLabel, placeholder: l.placeholder, promise: l.promise, successMessage: l.successMessage };
    },
  },
  testimonials: {
    schema: {
      type: "testimonials", label: "Testimonials", note: "Reader voices — repeatable blocks",
      fields: [
        { key: "heading", label: "Heading", type: "text", maxLength: 48 },
        {
          key: "items", label: "Testimonials", type: "blocks", blockLabel: "Testimonial", required: true, minBlocks: 1, maxBlocks: 8,
          blockFields: [
            { key: "quote", label: "Quote", type: "textarea", required: true, maxLength: 240 },
            { key: "author", label: "Author", type: "text", required: true, maxLength: 40 },
            { key: "role", label: "Role / place", type: "text", maxLength: 40 },
          ],
        },
        // Conditional CTA — hidden (and not required) unless enabled (points 2 + 5).
        { key: "ctaEnabled", label: "Show button", type: "boolean" },
        { key: "ctaLabel", label: "Button label", type: "text", maxLength: 24, required: true, showIf: { field: "ctaEnabled", truthy: true } },
        { key: "ctaHref", label: "Button URL", type: "url", required: true, showIf: { field: "ctaEnabled", truthy: true } },
      ],
    },
    defaults: () => ({
      heading: "In their words",
      items: [
        { quote: "The chai candle turned my evenings into a ritual.", author: "Aarohi", role: "Mumbai" },
        { quote: "It smells like a memory I didn't know I missed.", author: "Kabir", role: "Delhi" },
      ],
    }),
  },
  // Authored via repeatable blocks (converted from sourced) — the two editorial
  // plates are now DB-editable. Atmosphere/Editorial-World follow the same pattern.
  invitations: {
    schema: {
      type: "invitations", label: "Living with Fragrance", note: "Two editorial plates — edit each",
      fields: [
        {
          key: "items", label: "Plates", type: "blocks", blockLabel: "Plate", minBlocks: 2, maxBlocks: 2,
          blockFields: [
            { key: "title", label: "Title", type: "text", required: true, maxLength: 60 },
            { key: "line", label: "Caption line", type: "textarea", maxLength: 200 },
            { key: "image", label: "Image", type: "media", help: "Media URL or gradient:name" },
            { key: "imageAlt", label: "Image alt", type: "text", maxLength: 120 },
            { key: "ctaLabel", label: "Link label", type: "text", maxLength: 24 },
            { key: "ctaHref", label: "Link URL", type: "url" },
          ],
        },
      ],
    },
    defaults: (cid) => ({ items: getHomeInvitations(cid) }),
  },
  // ── Signature Chapters — intro + a card per Volume (each with its own gradient/"volume colour") ──
  chapters: {
    schema: {
      type: "chapters", label: "Signature Chapters", note: "The chapter rail — edit the intro and each Volume card",
      fields: [
        { key: "label", label: "Eyebrow", type: "text", maxLength: 40 },
        { key: "heading", label: "Heading", type: "text", required: true, maxLength: 60 },
        { key: "sub", label: "Sub-line", type: "textarea", maxLength: 160 },
        {
          key: "items", label: "Chapter cards", type: "blocks", blockLabel: "Chapter", minBlocks: 1, maxBlocks: 8,
          blockFields: [
            { key: "volume", label: "Volume label", type: "text", maxLength: 24, placeholder: "Volume I" },
            { key: "title", label: "Title", type: "text", required: true, maxLength: 40 },
            { key: "tagline", label: "Poetic line", type: "text", maxLength: 80 },
            { key: "image", label: "Cover (gradient / image)", type: "media", help: "Pick a gradient ‘volume colour’ or upload cover art" },
            { key: "slug", label: "Chapter link (slug)", type: "text", placeholder: "dessert-chapter", help: "Links to /chapters/<slug>" },
            { key: "ctaLabel", label: "Link label", type: "text", maxLength: 24, default: "Discover" },
          ],
        },
      ],
    },
    defaults: () => {
      return {
        label: "Samorah Collections", heading: "The Signature Chapters",
        sub: "A fragrance library composed through atmosphere, ritual and memory.",
        items: getVisibleChapters().map((c) => ({ volume: c.volume, title: c.title, tagline: c.tagline, image: c.image, slug: c.slug, ctaLabel: c.ctaLabel })),
      };
    },
  },
  // ── Featured Atmosphere — one or more selectable fragrances, each with its own image + editorial ──
  atmosphere: {
    schema: {
      type: "atmosphere", label: "Featured Atmosphere", note: "One or more fragrances — the first shows, the rest are selectable. Each has its own image.",
      fields: [
        { key: "heading", label: "Section eyebrow", type: "text", maxLength: 40 },
        {
          key: "items", label: "Featured fragrances", type: "blocks", blockLabel: "Fragrance", required: true, minBlocks: 1, maxBlocks: 5,
          blockSource: { entity: "product", label: "Pull from a product", map: { title: "title", image: "image", chapter: "chapter", productType: "productType", ctaHref: "ctaHref", ctaLabel: "ctaLabel" } },
          blockFields: [
            { key: "title", label: "Name", type: "text", required: true, maxLength: 48 },
            { key: "displayName", label: "Selector label (optional)", type: "text", maxLength: 32, help: "Short name in the picker; defaults to the name" },
            { key: "productType", label: "Type label", type: "text", maxLength: 32, placeholder: "Scented Candle" },
            { key: "chapter", label: "Chapter label", type: "text", maxLength: 40, placeholder: "The Dessert Chapter" },
            { key: "image", label: "Image", type: "media", help: "Upload / pick / gradient — different per fragrance" },
            { key: "imageAlt", label: "Image alt", type: "text", maxLength: 160 },
            { key: "scene", label: "Scene", type: "text", maxLength: 80 },
            { key: "memory", label: "Memory", type: "text", maxLength: 80 },
            { key: "atmosphereIndex", label: "Atmosphere words (one per line)", type: "textarea", help: "Each line becomes an index row" },
            { key: "signatureLine", label: "Signature line", type: "text", maxLength: 120 },
            { key: "scentOpening", label: "Journey — First", type: "text", maxLength: 120 },
            { key: "scentUnfolding", label: "Journey — Then", type: "text", maxLength: 120 },
            { key: "scentLingering", label: "Journey — Finally", type: "text", maxLength: 120 },
            { key: "ctaLabel", label: "Button label", type: "text", maxLength: 32 },
            { key: "ctaHref", label: "Button URL", type: "url" },
            { key: "colorScheme", label: "Text scheme", type: "select", options: [{ value: "on-dark", label: "On dark" }, { value: "on-light", label: "On light" }] },
            { key: "backgroundTone", label: "Background tone", type: "select", options: [{ value: "ember", label: "Ember (warm brown)" }, { value: "forest", label: "Forest (deep green)" }, { value: "twilight", label: "Twilight (violet)" }, { value: "charcoal", label: "Charcoal (near-black)" }, { value: "warm-ivory", label: "Warm ivory (light)" }] },
            { key: "lineColor", label: "Index line colour", type: "color", help: "The Atmosphere-Index leader lines — leave blank for the readable default" },
            { key: "overlayStrength", label: "Overlay strength (0–1)", type: "number", min: 0, max: 1 },
          ],
        },
      ],
    },
    defaults: (cid) => ({
      heading: ATMOSPHERE_HEADING,
      items: getFeaturedExperiences(cid).map((e) => ({
        title: e.title, displayName: e.displayName, productType: e.productType, chapter: e.chapter, image: e.image, imageAlt: e.imageAlt,
        scene: e.scene, memory: e.memory, atmosphereIndex: (e.atmosphereIndex ?? []).join("\n"), signatureLine: e.signatureLine,
        scentOpening: e.scent.opening, scentUnfolding: e.scent.unfolding, scentLingering: e.scent.lingering,
        ctaLabel: e.ctaLabel, ctaHref: e.ctaHref, colorScheme: e.colorScheme, backgroundTone: e.backgroundTone, overlayStrength: e.overlayStrength,
      })),
    }),
  },
  // ── Editorial World — the photo grid; each plate's hover name (title) is editable ──
  "editorial-world": {
    schema: {
      type: "editorial-world", label: "Editorial World", note: "The magazine photo grid — each plate has its own image, hover name and link",
      fields: [
        {
          key: "items", label: "Plates", type: "blocks", blockLabel: "Plate", minBlocks: 1, maxBlocks: 6,
          description: "The magazine spread has 6 fixed positions (1 large opening · 4 centre moments · 1 closing), so “Add Plate” caps at 6. Remove one to add a different image.",
          blockFields: [
            { key: "title", label: "Hover name", type: "text", required: true, maxLength: 48, help: "Shown on hover — never ‘image1.jpg’" },
            { key: "image", label: "Image", type: "media", help: "Upload / pick / gradient" },
            { key: "imageAlt", label: "Image alt", type: "text", maxLength: 160 },
            { key: "editorialImportance", label: "Role in the spread", type: "select", options: IMPORTANCE_OPTIONS, help: "Opening = large left · Closing = right · others fill the centre" },
            { key: "destinationUrl", label: "Link URL (optional)", type: "url" },
          ],
        },
      ],
    },
    defaults: (cid) => ({
      items: getEditorialWorld(cid).map((s) => ({ title: s.title, image: s.image, imageAlt: s.imageAlt, editorialImportance: s.editorialImportance, destinationUrl: s.destinationUrl ?? (s.chapterSlug ? `/chapters/${s.chapterSlug}` : "") })),
    }),
  },
  // ── Editorial content — flexible blocks (points 16/17/18): quote / paragraph (rich text) / heading /
  //    image / button, all reorderable and repeatable ──
  "content-blocks": {
    schema: {
      type: "content-blocks", label: "Editorial content", note: "Add Quote / Paragraph / Heading / Image / Button blocks in any order",
      fields: [
        { key: "eyebrow", label: "Section eyebrow (optional)", type: "text", maxLength: 60 },
        {
          key: "blocks", label: "Content blocks", type: "blocks", blockLabel: "Block", required: true, minBlocks: 1, maxBlocks: 30,
          description: "Reorder with ↑ ↓. Paragraphs support bold, italic, links, lists, quotes and inline images.",
          blockVariants: [
            { key: "paragraph", label: "Paragraph", fields: [{ key: "html", label: "Text", type: "richtext", required: true }] },
            { key: "heading", label: "Heading", fields: [{ key: "text", label: "Heading", type: "text", required: true, maxLength: 120 }, { key: "level", label: "Size", type: "select", options: [{ value: "h2", label: "Large (H2)" }, { value: "h3", label: "Medium (H3)" }] }] },
            { key: "quote", label: "Quote", fields: [{ key: "quote", label: "Quote", type: "textarea", required: true, maxLength: 300 }, { key: "attribution", label: "Attribution", type: "text", maxLength: 80 }] },
            { key: "image", label: "Image", fields: [{ key: "image", label: "Image", type: "media", required: true }, { key: "alt", label: "Alt text", type: "text", maxLength: 160, altFor: "image" }, { key: "caption", label: "Caption", type: "text", maxLength: 160 }] },
            { key: "video", label: "Video", fields: [{ key: "url", label: "Video (upload MP4 / paste YouTube / Vimeo)", type: "media", allowedMime: ["video/mp4", "video/webm"], required: true, placeholder: "Upload an MP4, or paste a YouTube / Vimeo URL" }, { key: "caption", label: "Caption", type: "text", maxLength: 160 }] },
            { key: "cta", label: "Button", fields: [{ key: "label", label: "Button label", type: "text", required: true, maxLength: 32 }, { key: "href", label: "Button URL", type: "url", required: true }] },
          ],
        },
        { key: "align", label: "Alignment", type: "align", options: ALIGN_OPTIONS },
      ],
    },
    defaults: () => ({
      eyebrow: "",
      align: "left",
      blocks: [
        { _type: "heading", text: "A quiet note", level: "h2" },
        { _type: "paragraph", html: "<p>Write freely here — <strong>bold</strong>, <em>italic</em>, links, lists and quotes are all supported.</p>" },
        { _type: "quote", quote: "Fragrance designed to linger beyond the flame.", attribution: "Samorah" },
      ],
    }),
  },
  // ── Featured spotlight (point 28) — pick any product / chapter / atmosphere / testimonial / artist /
  //    journal piece from a dropdown; the picker fills the display fields, which then render + stay editable ──
  "featured-content": {
    schema: {
      type: "featured-content", label: "Featured spotlight", note: "Feature any product, chapter, atmosphere, testimonial, artist or journal piece",
      fields: [
        { key: "eyebrow", label: "Eyebrow", type: "text", maxLength: 40 },
        { key: "entityType", label: "Feature a…", type: "select", options: [
          { value: "product", label: "Product" }, { value: "chapter", label: "Chapter" }, { value: "atmosphere", label: "Atmosphere" },
          { value: "testimonial", label: "Testimonial" }, { value: "artist", label: "Artist" }, { value: "journal", label: "Journal piece" },
        ] },
        { key: "product", label: "Choose a product", type: "reference", refEntity: "product", refFill: FEATURED_FILL, showIf: { field: "entityType", equals: "product" } },
        { key: "chapter", label: "Choose a chapter", type: "reference", refEntity: "collection", refFill: FEATURED_FILL, showIf: { field: "entityType", equals: "chapter" } },
        { key: "atmosphere", label: "Choose an atmosphere", type: "reference", refEntity: "atmosphere", refFill: FEATURED_FILL, showIf: { field: "entityType", equals: "atmosphere" } },
        { key: "testimonial", label: "Choose a testimonial", type: "reference", refEntity: "testimonial", refFill: FEATURED_FILL, showIf: { field: "entityType", equals: "testimonial" } },
        { key: "artist", label: "Choose an artist", type: "reference", refEntity: "artist", refFill: FEATURED_FILL, showIf: { field: "entityType", equals: "artist" } },
        { key: "journal", label: "Choose a journal piece", type: "reference", refEntity: "journal", refFill: FEATURED_FILL, showIf: { field: "entityType", equals: "journal" } },
        { key: "title", label: "Title", type: "text", required: true, maxLength: 120 },
        { key: "blurb", label: "Blurb", type: "textarea", maxLength: 300 },
        { key: "image", label: "Image", type: "media", help: "Filled from the picked item — or choose your own" },
        { key: "imageAlt", label: "Image alt text", type: "text", maxLength: 160, altFor: "image" },
        { key: "href", label: "Link URL", type: "url" },
        { key: "ctaLabel", label: "Button label", type: "text", maxLength: 24 },
      ],
    },
    defaults: () => ({ eyebrow: "Featured", entityType: "product", title: "", blurb: "", image: "", imageAlt: "", href: "", ctaLabel: "Discover" }),
  },
};

// Cross-field validation hook (point 5) — guard against shipping placeholder copy.
SECTION_DEFS.hero.schema.validate = (c) => {
  const h = String(c.heading ?? "").trim().toLowerCase();
  return h === "title" || h === "headline" ? ['Replace the placeholder headline before publishing'] : [];
};

export const SECTION_SCHEMAS = Object.fromEntries(Object.entries(SECTION_DEFS).map(([t, d]) => [t, d.schema])) as Record<SectionType, SectionSchema>;

// Register Homepage as consumer #1 of the Composable Page Registry (point 6).
registerPageType({ key: "homepage", label: "Homepage", sections: SECTION_DEFS });

// Register About as consumer #2 — the SAME section definitions, a different subset.
// A new page type is a registration, not new code.
registerPageType({
  key: "about", label: "About",
  sections: {
    hero: SECTION_DEFS.hero,
    "brand-story": SECTION_DEFS["brand-story"],
    words: SECTION_DEFS.words,
    testimonials: SECTION_DEFS.testimonials,
    letters: SECTION_DEFS.letters,
  },
});

// Consumer #3 — Journal. Same section definitions, a different subset + order.
registerPageType({
  key: "journal", label: "Journal",
  sections: {
    hero: SECTION_DEFS.hero,
    words: SECTION_DEFS.words,
    testimonials: SECTION_DEFS.testimonials,
    letters: SECTION_DEFS.letters,
  },
});
