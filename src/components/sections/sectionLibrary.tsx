import { BrandStory } from "@/components/home/BrandStory";
import { Words } from "@/components/home/Words";
import { EditorialWorld } from "@/components/home/EditorialWorld";
import { TheLetters } from "@/components/home/TheLetters";
import { ChapterHero } from "@/components/chapters/ChapterHero";
import { ChapterIntro } from "@/components/chapters/ChapterIntro";
import { ChapterFeaturedProduct } from "@/components/chapters/ChapterFeaturedProduct";
import { ChapterProductCollection } from "@/components/chapters/ChapterProductCollection";
import { ChapterRailSection } from "@/components/chapters/ChapterRailSection";
import { HoursGroup } from "@/components/air/HoursGroup";
import { FutureVolumeTeaser } from "@/components/air/FutureVolumeTeaser";
import { EditorialStatement } from "@/components/pdp/EditorialStatement";
import { FragrancePyramid } from "@/components/pdp/FragrancePyramid";
import { ArtistFeature } from "@/components/pdp/ArtistFeature";
import { ArtworkFeature } from "@/components/pdp/ArtworkFeature";
import { EditorialQuote } from "@/components/pdp/EditorialQuote";
import { EditorialAccordion } from "@/components/pdp/EditorialAccordion";
import { RelatedProducts } from "@/components/pdp/RelatedProducts";
import { MoodGrid } from "@/components/pdp/MoodGrid";
import { CraftDetails } from "@/components/pdp/CraftDetails";
import { LifestyleFeature } from "@/components/pdp/LifestyleFeature";
import { NotesColumn } from "@/components/pdp/NotesColumn";
import { PoeticLines } from "@/components/pdp/PoeticLines";
import { PlacementGrid } from "@/components/pdp/PlacementGrid";
import { EditorialDivider } from "@/components/pdp/EditorialDivider";
import { Testimonials } from "@/components/pdp/Testimonials";
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
    type: "ChapterIntro",
    displayName: "Chapter Introduction",
    category: "narrative",
    description: "The opening pause — volume, title and one poetic line, no product.",
    icon: "feather",
    variants: ["centered"],
    renderCost: "light",
    capabilities: { theme: true, animation: true },
    permissions: { edit: ["administrator", "editor", "marketing"], publish: ["administrator", "editor"] },
    emits: ["scroll-past"],
    component: ChapterIntro,
  });
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

  // — Air Chapters / The Hours (Template B; Experience B) —
  registerSection({
    type: "HoursGroup",
    displayName: "Hours Group",
    category: "narrative",
    description: "A movement of the Air diary — alternating Hour Blocks with interludes.",
    icon: "clock",
    variants: ["room", "linen"],
    renderCost: "medium",
    capabilities: { variants: true, theme: true, assets: true, animation: true, relationships: true, analytics: true },
    permissions: { edit: ["administrator", "editor", "marketing"], publish: ["administrator", "editor"] },
    emits: ["product-click", "cta-click"],
    component: HoursGroup,
  });
  registerSection({
    type: "FutureVolume",
    displayName: "Future Volume",
    category: "narrative",
    description: "The next volume, as anticipation — a dark editorial close.",
    icon: "moon",
    variants: ["teaser"],
    renderCost: "light",
    capabilities: { theme: true, animation: true },
    permissions: { edit: ["administrator", "editor", "marketing"], publish: ["administrator", "editor"] },
    emits: ["scroll-past"],
    component: FutureVolumeTeaser,
  });

  // — Editorial PDP blocks (Phase 9; product-agnostic, reusable) —
  registerSection({
    type: "EditorialStatement",
    displayName: "Editorial Statement",
    category: "narrative",
    description: "A large editorial paragraph beside one image (or full-width text).",
    icon: "align-left",
    variants: ["statement"],
    renderCost: "medium",
    capabilities: { theme: true, assets: true, animation: true },
    component: EditorialStatement,
  });
  registerSection({
    type: "FragrancePyramid",
    displayName: "Fragrance Pyramid",
    category: "narrative",
    description: "Top / Heart / Base composition as an editorial pyramid.",
    icon: "triangle",
    variants: ["pyramid"],
    renderCost: "light",
    capabilities: { theme: true, animation: true },
    component: FragrancePyramid,
  });
  registerSection({
    type: "ArtistFeature",
    displayName: "Artist Feature",
    category: "narrative",
    description: "Layout A — process image + the artist's story.",
    icon: "user",
    variants: ["feature"],
    renderCost: "medium",
    capabilities: { theme: true, assets: true, animation: true },
    component: ArtistFeature,
  });
  registerSection({
    type: "ArtworkFeature",
    displayName: "Artwork Feature",
    category: "media",
    description: "Layout B — a full-width artwork, edge to edge, no UI.",
    icon: "image",
    variants: ["full"],
    renderCost: "medium",
    capabilities: { theme: true, assets: true, animation: true },
    component: ArtworkFeature,
  });
  registerSection({
    type: "EditorialQuote",
    displayName: "Editorial Quote",
    category: "narrative",
    description: "One centred sentence in generous whitespace (hairline · handwritten).",
    icon: "quote",
    variants: ["hairline", "handwritten"],
    renderCost: "light",
    capabilities: { variants: true, theme: true, animation: true },
    component: EditorialQuote,
  });
  registerSection({
    type: "MoodGrid",
    displayName: "Mood Grid",
    category: "narrative",
    description: "The scent's character as editorial cards (mood · persona · theme).",
    icon: "grid",
    variants: ["cards"],
    renderCost: "light",
    capabilities: { theme: true, animation: true },
    component: MoodGrid,
  });
  registerSection({
    type: "CraftDetails",
    displayName: "Craft Details",
    category: "narrative",
    description: "How it's made — hand-poured · wax · wick · burn · vessel.",
    icon: "tool",
    variants: ["list"],
    renderCost: "light",
    capabilities: { theme: true, animation: true },
    component: CraftDetails,
  });
  registerSection({
    type: "LifestyleFeature",
    displayName: "Lifestyle Feature",
    category: "narrative",
    description: "Image + where / when / pairs-with rows.",
    icon: "home",
    variants: ["feature"],
    renderCost: "medium",
    capabilities: { theme: true, assets: true, animation: true },
    component: LifestyleFeature,
  });
  registerSection({
    type: "NotesColumn",
    displayName: "Notes Column",
    category: "narrative",
    description: "Scent notes in large type — the 'Smells Like' beat.",
    icon: "list",
    variants: ["column"],
    renderCost: "light",
    capabilities: { theme: true, animation: true },
    component: NotesColumn,
  });
  registerSection({
    type: "PoeticLines",
    displayName: "Poetic Lines",
    category: "narrative",
    description: "A few lines read like verse — the 'Feels Like' beat.",
    icon: "feather",
    variants: ["verse"],
    renderCost: "light",
    capabilities: { theme: true, animation: true },
    component: PoeticLines,
  });
  registerSection({
    type: "PlacementGrid",
    displayName: "Placement Grid",
    category: "narrative",
    description: "Where the fragrance belongs — bedroom · living · workspace.",
    icon: "grid",
    variants: ["grid"],
    renderCost: "light",
    capabilities: { theme: true, animation: true },
    component: PlacementGrid,
  });
  registerSection({
    type: "EditorialDivider",
    displayName: "Editorial Divider",
    category: "structure",
    description: "A hairline with an optional short line — a breathing beat.",
    icon: "minus",
    variants: ["rule", "line"],
    renderCost: "light",
    capabilities: { theme: true, animation: true },
    component: EditorialDivider,
  });
  registerSection({
    type: "EditorialAccordion",
    displayName: "Editorial Accordion",
    category: "structure",
    description: "Collapsed details — care, shipping, ingredients.",
    icon: "chevron-down",
    variants: ["list"],
    renderCost: "light",
    capabilities: { theme: true },
    component: EditorialAccordion,
  });
  registerSection({
    type: "Testimonials",
    displayName: "From Our Homes",
    category: "narrative",
    description: "Curated editorial voices — no stars, counts or avatars.",
    icon: "quote",
    variants: ["voices"],
    renderCost: "light",
    capabilities: { theme: true, animation: true },
    component: Testimonials,
  });
  registerSection({
    type: "RelatedProducts",
    displayName: "Related Products",
    category: "commerce",
    description: "Continue the Chapter / Hours — reuses ProductCard.",
    icon: "grid",
    variants: ["rail"],
    renderCost: "medium",
    capabilities: { theme: true, assets: true, relationships: true, analytics: true },
    emits: ["product-click"],
    component: RelatedProducts,
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
