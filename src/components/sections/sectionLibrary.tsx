import { BrandStory } from "@/components/home/BrandStory";
import { Words } from "@/components/home/Words";
import { EditorialWorld } from "@/components/home/EditorialWorld";
import { TheLetters } from "@/components/home/TheLetters";
import { ChapterHero } from "@/components/chapters/ChapterHero";
import { ChapterFeaturedProduct } from "@/components/chapters/ChapterFeaturedProduct";
import { ChapterProductCollection } from "@/components/chapters/ChapterProductCollection";
import { ChapterRailSection } from "@/components/chapters/ChapterRailSection";
import type { BrandStory as StorySettings } from "@/config/brandStory";
import type { EditorialVoice } from "@/config/voices";
import type { EditorialStory } from "@/config/editorialWorld";
import type { LettersInvitation } from "@/config/letters";
import { registerSection, type SectionComponentProps } from "./registry";

/**
 * The reusable section library (§16). Registers section components into the
 * registry — including the EXISTING homepage components via thin adapters, so
 * they are reused on chapter/air pages without rewriting the committed homepage.
 * Idempotent; call once before rendering with `SectionRenderer`.
 */

// — a native section that follows the settings contract directly (no adapter) —
function DividerSection({ settings, variant }: SectionComponentProps) {
  const label = typeof settings.label === "string" ? settings.label : undefined;
  return (
    <div className="section-divider" data-variant={variant}>
      {label ? (
        <span className="section-divider__label">{label}</span>
      ) : (
        <span className="section-divider__rule" aria-hidden="true" />
      )}
    </div>
  );
}

let registered = false;

export function registerSectionLibrary(): void {
  if (registered) return;
  registered = true;

  registerSection({
    type: "Divider",
    displayName: "Divider",
    category: "structure",
    description: "A hairline, a labelled transition, or a spacer.",
    icon: "minus",
    variants: ["hairline", "labelled", "spacer"],
    renderCost: "light",
    capabilities: { variants: true, theme: true },
    component: DividerSection,
  });

  // — existing homepage editorial components, reused via thin adapters —
  registerSection({
    type: "Story",
    displayName: "Editorial Story",
    category: "narrative",
    description: "An image + copy spread (the maker's quiet).",
    icon: "book-open",
    variants: ["image-left", "image-right", "centered"],
    renderCost: "medium",
    capabilities: { variants: true, background: true, theme: true, assets: true, animation: true, scheduling: true },
    permissions: { edit: ["administrator", "editor", "marketing"], publish: ["administrator", "editor"] },
    emits: ["cta-click", "scroll-past"],
    validate: (s) =>
      s.heading || (s as { story?: unknown }).story
        ? []
        : [{ message: "Story needs a heading or a story object." }],
    component: ({ settings }) => (
      <BrandStory story={settings as unknown as StorySettings} />
    ),
  });
  registerSection({
    type: "Quote",
    displayName: "Editorial Quote",
    category: "narrative",
    description: "One literary sentence with the gold-hairline signature.",
    icon: "quote",
    renderCost: "light",
    capabilities: { theme: true, animation: true, scheduling: true, personalization: true },
    permissions: { edit: ["administrator", "editor", "marketing"], publish: ["administrator", "editor"] },
    component: ({ settings }) => (
      <Words voice={(settings.voice as EditorialVoice) ?? null} />
    ),
  });
  registerSection({
    type: "Gallery",
    displayName: "Editorial World",
    category: "media",
    description: "The art-directed magazine spread.",
    icon: "images",
    variants: ["spread"],
    renderCost: "heavy",
    capabilities: { variants: true, blocks: true, theme: true, assets: true, animation: true, relationships: true, analytics: true },
    permissions: { edit: ["administrator", "editor", "marketing", "designer"], publish: ["administrator", "editor"] },
    emits: ["image-click", "story-open", "campaign-click"],
    component: ({ settings }) => (
      <EditorialWorld stories={(settings.stories as EditorialStory[]) ?? []} />
    ),
  });
  // — chapter sections (the Editorial Chapter template; step 9) —
  registerSection({
    type: "Hero",
    displayName: "Chapter Hero",
    category: "narrative",
    description: "The chapter's opening book cover — volume, title, poetic line.",
    icon: "image",
    variants: ["cinematic", "immersive"],
    renderCost: "medium",
    capabilities: { variants: true, background: true, theme: true, assets: true, animation: true },
    permissions: { edit: ["administrator", "editor", "marketing"], publish: ["administrator", "editor"] },
    emits: ["scroll-past"],
    component: ChapterHero,
  });
  registerSection({
    type: "FeaturedProduct",
    displayName: "Featured Fragrance",
    category: "commerce",
    description: "The chapter's signature candle as an editorial spotlight.",
    icon: "sparkles",
    variants: ["spotlight"],
    renderCost: "light",
    capabilities: { variants: true, theme: true, assets: true, animation: true, relationships: true, analytics: true },
    permissions: { edit: ["administrator", "editor", "marketing"], publish: ["administrator", "editor"] },
    emits: ["product-click", "cta-click"],
    component: ChapterFeaturedProduct,
  });
  registerSection({
    type: "ProductCollection",
    displayName: "Chapter Collection",
    category: "commerce",
    description: "The rest of the chapter as a quiet product grid.",
    icon: "grid",
    variants: ["paired", "grid", "rail"],
    renderCost: "medium",
    capabilities: { variants: true, theme: true, assets: true, animation: true, relationships: true, analytics: true },
    permissions: { edit: ["administrator", "editor", "marketing"], publish: ["administrator", "editor"] },
    emits: ["product-click"],
    component: ChapterProductCollection,
  });
  registerSection({
    type: "ChapterRail",
    displayName: "Continue Reading",
    category: "navigation",
    description: "The closing rail of other chapters (the shared ChapterRail).",
    icon: "arrow-right",
    variants: ["rail"],
    renderCost: "medium",
    capabilities: { theme: true, assets: true, relationships: true, analytics: true },
    permissions: { edit: ["administrator", "editor", "marketing"], publish: ["administrator", "editor"] },
    emits: ["chapter-click"],
    component: ChapterRailSection,
  });

  registerSection({
    type: "Newsletter",
    displayName: "The Letters",
    category: "conversion",
    description: "The quiet editorial invitation to subscribe.",
    icon: "mail",
    renderCost: "light",
    capabilities: { theme: true, animation: true, scheduling: true, analytics: true },
    permissions: { edit: ["administrator", "editor", "marketing"], publish: ["administrator", "editor"] },
    emits: ["subscribed", "cta-click"],
    component: ({ settings }) => (
      <TheLetters invitation={(settings.invitation as LettersInvitation) ?? null} />
    ),
  });
}
