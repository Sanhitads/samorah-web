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
import type { SectionType } from "@/services/homepageService";
import { getActiveCampaign } from "@/config/campaigns";
import { getBrandStory } from "@/config/brandStory";
import { getEditorialVoice } from "@/config/voices";
import { getLettersInvitation } from "@/config/letters";

export interface SectionDefinition {
  schema: SectionSchema;
  /** Current content from config — the baseline before any DB edit. */
  defaults: (campaignId: string) => Record<string, unknown>;
}

const sourced = (type: SectionType, label: string, note: string): SectionDefinition => ({
  schema: { type, label, note, fields: [], sourced: true },
  defaults: () => ({}),
});

export const SECTION_DEFS: Record<SectionType, SectionDefinition> = {
  hero: {
    schema: {
      type: "hero", label: "Hero", note: "The opening threshold",
      fields: [
        { key: "eyebrow", label: "Eyebrow", type: "text" },
        { key: "heading", label: "Headline", type: "text", required: true },
        { key: "subheading", label: "Subheading", type: "textarea" },
        { key: "ctaLabel", label: "Button label", type: "text" },
        { key: "ctaHref", label: "Button URL", type: "url" },
        { key: "heroImage", label: "Background image", type: "media", help: "Media URL or gradient:name placeholder" },
        { key: "theme", label: "Theme", type: "select", options: [{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }] },
      ],
    },
    defaults: () => {
      const c = getActiveCampaign();
      return { eyebrow: c.eyebrow, heading: c.heading, subheading: c.subheading, ctaLabel: c.ctaLabel, ctaHref: c.ctaHref, heroImage: c.heroImage, theme: c.theme };
    },
  },
  "brand-story": {
    schema: {
      type: "brand-story", label: "Brand Story", note: "The maker's quiet",
      fields: [
        { key: "eyebrow", label: "Eyebrow", type: "text" },
        { key: "heading", label: "Heading", type: "text", required: true },
        { key: "body", label: "Body", type: "textarea" },
      ],
    },
    defaults: () => { const s = getBrandStory(); return { eyebrow: s.eyebrow, heading: s.heading, body: s.body }; },
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
  chapters: sourced("chapters", "Signature Chapters", "Chapter rail — items from the chapters catalogue"),
  atmosphere: sourced("atmosphere", "The Atmosphere", "Fragrance-worlds — items from experiences config"),
  invitations: sourced("invitations", "Living with Fragrance", "Two ways of living — from invitations config"),
  "editorial-world": sourced("editorial-world", "Editorial World", "Magazine spread — from editorial config"),
};

export const SECTION_SCHEMAS = Object.fromEntries(Object.entries(SECTION_DEFS).map(([t, d]) => [t, d.schema])) as Record<SectionType, SectionSchema>;
