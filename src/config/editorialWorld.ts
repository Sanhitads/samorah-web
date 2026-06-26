/**
 * Homepage §7 — the Editorial World (titleless; formerly "Atmosphere Gallery").
 *
 * NOT a gallery, feed, masonry, carousel or product showcase. It is the final
 * editorial chapter before the newsletter — the life the fragrance belongs to.
 * It answers one last question through imagery, never words: *"What kind of life
 * does Samorah belong in?"* The visitor should leave thinking "I want my home to
 * feel like this," not "what beautiful photography."
 *
 * STORE STORIES, NOT IMAGES — and GUIDE THE CURATOR. `editorialImportance` is a
 * narrative role, so the CMS reads as a magazine brief (Opening · Ritual · Detail
 * · Still Life · Closing) rather than "Image 1 … Image 6". Every campaign becomes
 * its own magazine story; the layout is permanent, only the data changes:
 *
 *   Christmas →  Opening (Christmas table) · Ritual (pouring tea) ·
 *                Detail (hands wrapping a gift) · Still Life (a lit candle) ·
 *                Closing (the family room).   Nothing changes but data.
 *
 * MASTER CONTENT SOURCE (future): one shoot powers homepage · blog · newsletter
 * · social · press · campaign pages. Several fields exist for that wider
 * ecosystem — SEO, analytics, personalization, AI retrieval, Cloudinary
 * responsive imagery — and are not all consumed here yet (PROJECT_CONTEXT §8).
 */
export type EditorialImportance =
  | "Opening" // the establishing world (left, dominant)
  | "Ritual" // a human moment — pouring, lighting, arranging (centre)
  | "Detail" // objects, books, ceramics, a close detail (centre)
  | "Still Life" // texture / material / a styled still life (centre)
  | "Closing"; // the life lived in this world (right, the closing page)

export interface EditorialStory {
  id: string;

  // — editorial content (SEO: never "image1.jpg") —
  title: string; // "Morning Window"
  caption?: string; // "The Dessert Chapter"
  story?: string;
  seoDescription?: string; // "Editorial photography from The Dessert Chapter"

  // — imagery (→ Cloudinary; responsive + blur placeholder at that phase) —
  image: string;
  mobileImage?: string;
  imageAlt: string; // "Sunlight entering a quiet reading room with a Samorah candle"
  imageRatio?: string; // hint / SEO only — the composition decides the displayed crop
  orientation?: "portrait" | "landscape" | "square";
  colorPalette?: string;
  photographyStyle?: string;

  // — placement (the only signal that drives layout) —
  editorialImportance: EditorialImportance;
  /** Marketing may temporarily swap a single image for a seasonal moment
   *  (Christmas / Valentine's / Mother's Day) without touching the layout. */
  featuredImage?: boolean;

  // — destination (the whole plate is one clickable link) —
  destinationUrl?: string;
  chapterSlug?: string;
  collectionSlug?: string;
  experienceType?: string;
  /** 0 / 1 / many — products live *inside* the story, never product-first. */
  products?: string[];

  // — story metadata (campaign · SEO · analytics · AI · personalization) —
  campaignId?: string;
  season?: string;
  mood?: string;
  location?: string;
  publishDate?: string;
  expiryDate?: string;

  // — CMS control —
  homepageFeatured: boolean;
  campaignPriority?: number;
  displayOrder: number;
  visibility: boolean;
}

/**
 * The launch world — the Kashmiri Chai shoot. One mood, the narrative
 * Opening → Ritual → Detail → Still Life → Closing. ≈ 80% spaces / objects /
 * texture / life · ≈ 20% product living naturally inside. A different campaign
 * replaces the whole world through data alone.
 */
export const EDITORIAL_STORIES: EditorialStory[] = [
  {
    id: "kc-window",
    title: "Morning Window",
    caption: "The Dessert Chapter",
    seoDescription: "Editorial photography from The Dessert Chapter — morning light in a quiet room.",
    image: "gradient:grad-atm1",
    imageAlt: "Sunlight entering a quiet reading room, sheer curtains and a cane chair, a Samorah candle on the sill.",
    orientation: "portrait",
    photographyStyle: "Spaces — interior, window light. The establishing world.",
    editorialImportance: "Opening",
    destinationUrl: "/chapters/dessert-chapter",
    chapterSlug: "dessert-chapter",
    products: ["Kashmiri Chai"],
    campaignId: "kashmiri-chai-launch",
    season: "winter",
    mood: "Slow Morning",
    location: "A room in the late morning",
    homepageFeatured: true,
    campaignPriority: 1,
    displayOrder: 1,
    visibility: true,
  },
  {
    id: "kc-pour",
    title: "The Pour",
    caption: "The Dessert Chapter",
    seoDescription: "A slow tea ritual — Kashmiri Chai poured into porcelain.",
    image: "gradient:grad-smoke",
    imageAlt: "Hands pouring tea into a porcelain cup, steam rising into cold light.",
    orientation: "landscape",
    photographyStyle: "Human presence — a ritual, never a posed portrait.",
    editorialImportance: "Ritual",
    destinationUrl: "/chapters/dessert-chapter",
    chapterSlug: "dessert-chapter",
    campaignId: "kashmiri-chai-launch",
    season: "winter",
    mood: "Intimate",
    location: "At the table",
    homepageFeatured: true,
    campaignPriority: 2,
    displayOrder: 2,
    visibility: true,
  },
  {
    id: "kc-objects",
    title: "Architecture of Bombay",
    caption: "The Dessert Chapter",
    seoDescription: "Editorial objects — a ceramic bowl resting on well-read books.",
    image: "gradient:grad-bundle",
    imageAlt: "A ceramic bowl on a stack of books beside a cane chair.",
    orientation: "landscape",
    photographyStyle: "Objects — books, ceramics, paper. Character and depth.",
    editorialImportance: "Detail",
    destinationUrl: "/chapters/dessert-chapter",
    chapterSlug: "dessert-chapter",
    campaignId: "kashmiri-chai-launch",
    season: "winter",
    mood: "Considered",
    location: "The side table",
    homepageFeatured: true,
    campaignPriority: 3,
    displayOrder: 3,
    visibility: true,
  },
  {
    id: "kc-bloom",
    title: "First Bloom",
    caption: "The Dessert Chapter",
    seoDescription: "A close still life — a single flower in soft, warm light.",
    image: "gradient:grad-story",
    imageAlt: "A white flower in soft focus against warm afternoon light.",
    orientation: "square",
    photographyStyle: "Texture / still life — a close-up, sensory connection.",
    editorialImportance: "Still Life",
    destinationUrl: "/chapters/dessert-chapter",
    chapterSlug: "dessert-chapter",
    campaignId: "kashmiri-chai-launch",
    season: "winter",
    mood: "Tender",
    location: "Close",
    homepageFeatured: true,
    campaignPriority: 4,
    displayOrder: 4,
    visibility: true,
  },
  {
    id: "kc-linen",
    title: "On Linen",
    caption: "Mood Library",
    seoDescription: "A fragrance resting naturally in the folds of unmade linen.",
    image: "gradient:grad-air",
    imageAlt: "A small fragrance bottle resting in the folds of soft linen.",
    orientation: "square",
    photographyStyle: "Product living naturally inside the scene — discovered, not displayed.",
    editorialImportance: "Detail",
    destinationUrl: "/shop/velvet-hour",
    chapterSlug: "mood-library",
    products: ["Velvet Hour"],
    campaignId: "kashmiri-chai-launch",
    season: "winter",
    mood: "Quiet",
    location: "On the bed",
    homepageFeatured: true,
    campaignPriority: 5,
    displayOrder: 5,
    visibility: true,
  },
  {
    id: "kc-reading",
    title: "Reading Hour",
    caption: "The Dessert Chapter",
    seoDescription: "The closing page — an afternoon lived with a book and a candle.",
    image: "gradient:grad-chai",
    imageAlt: "Someone reading on linen sheets, a lit Samorah candle and tray nearby.",
    orientation: "portrait",
    photographyStyle: "Lifestyle — the fragrance living with someone. The closing feeling.",
    editorialImportance: "Closing",
    destinationUrl: "/chapters/dessert-chapter",
    chapterSlug: "dessert-chapter",
    products: ["Kashmiri Chai"],
    campaignId: "kashmiri-chai-launch",
    season: "winter",
    mood: "Aspirational",
    location: "The bedroom, afternoon",
    homepageFeatured: true,
    campaignPriority: 6,
    displayOrder: 6,
    visibility: true,
  },
];

/**
 * The editorial world for the active campaign. Render only `homepageFeatured` &&
 * `visibility`; sort by campaign match → campaignPriority → displayOrder. The
 * homepage stays curated and marketing controls everything through the CMS.
 */
export function getEditorialWorld(campaignId?: string): EditorialStory[] {
  const pool = EDITORIAL_STORIES.filter((s) => s.homepageFeatured && s.visibility);
  return [...pool].sort((a, b) => {
    if (campaignId) {
      const am = a.campaignId === campaignId ? 0 : 1;
      const bm = b.campaignId === campaignId ? 0 : 1;
      if (am !== bm) return am - bm;
    }
    const ap = a.campaignPriority ?? Number.MAX_SAFE_INTEGER;
    const bp = b.campaignPriority ?? Number.MAX_SAFE_INTEGER;
    if (ap !== bp) return ap - bp;
    return a.displayOrder - b.displayOrder;
  });
}
