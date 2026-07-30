/**
 * Section templates (Homepage Builder · Phase 2 · point 8) — starting points offered by the "Add
 * section" picker instead of a blank block. Each maps to a real section `type`; its starter `settings`
 * are resolved server-side from that type's schema + config defaults (+ optional overrides), so the
 * form and preview are populated immediately. `comingSoon` entries need NEW storefront components and
 * are shown disabled (see docs/POST_LAUNCH_ROADMAP.md) rather than faked.
 */
export interface SectionTemplateDef {
  id: string;
  label: string;
  description: string;
  type: string;                 // maps to an existing composed-section type ("" for coming-soon)
  overrides?: Record<string, unknown>;
  comingSoon?: boolean;
}

export const SECTION_TEMPLATES: SectionTemplateDef[] = [
  { id: "hero", label: "Hero", description: "Full-bleed opening — headline, sub, and a call-to-action.", type: "hero" },
  { id: "image-quote", label: "Image + Quote", description: "An editorial image beside a short pull-quote.", type: "brand-story", overrides: { quote: "Before it is a fragrance, it is a memory." } },
  { id: "editorial", label: "Editorial", description: "The art-directed magazine photo spread.", type: "editorial-world" },
  { id: "gallery", label: "Gallery", description: "A grid of images with hover captions.", type: "editorial-world" },
  { id: "newsletter", label: "Newsletter", description: "Quiet email capture with an invitation.", type: "letters" },
  { id: "testimonials", label: "Testimonials", description: "Reader voices, in their own words.", type: "testimonials" },
  { id: "words", label: "Quote / Words", description: "One literary sentence set in whitespace.", type: "words" },
  { id: "chapters", label: "Chapters rail", description: "The signature chapter cards.", type: "chapters" },
  { id: "atmosphere", label: "Featured Atmosphere", description: "Selectable fragrance worlds, each with its own image.", type: "atmosphere" },
  { id: "invitations", label: "Living with Fragrance", description: "Two connected editorial plates.", type: "invitations" },
  { id: "editorial-content", label: "Editorial content", description: "Compose from Quote / Paragraph / Heading / Image / Button blocks — with a rich-text editor.", type: "content-blocks" },
  // Coming soon — these need new storefront components / integrations before they can render.
  { id: "split-hero", label: "Split Hero", description: "Two-column hero (image + copy). Needs a new component.", type: "", comingSoon: true },
  { id: "video", label: "Video", description: "Background or embedded video. Needs a new component.", type: "", comingSoon: true },
  { id: "instagram", label: "Instagram", description: "Live Instagram feed. Needs an integration.", type: "", comingSoon: true },
  { id: "journal", label: "Journal", description: "Latest journal entries. Needs a new component.", type: "", comingSoon: true },
];
