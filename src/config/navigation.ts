/**
 * Primary navigation model — the editorial "table of contents" rendered by the
 * Mega Menu (Component 3) and, later, the Mobile Menu (Component 7).
 *
 * Typed so links can go live without a redesign: flip `isComingSoon` off and
 * give the item a real `href`. The Mega Menu renders coming-soon items as quiet,
 * non-interactive labels. (This is NOT the footer model — that lives separately,
 * SDD-VISUAL §31.)
 */

export interface MenuItem {
  label: string;
  href: string;
  /** Render as a quiet, non-navigating "Coming Soon" label until ready. */
  isComingSoon?: boolean;
  /**
   * Visual hierarchy within a branch (used by Collections): a `parent` carries
   * slightly more presence, `child` items are subordinate (indented, softer),
   * and `cta` sits apart as a quiet editorial call-to-action. Untagged items
   * render flat, unchanged.
   */
  tier?: "parent" | "child" | "cta";
}

export interface MenuCampaign {
  /** Micro eyebrow, e.g. "Featured". */
  eyebrow: string;
  /** Serif headline. */
  title: string;
  /** Supporting italic line. */
  description: string;
  /** Click target for the whole panel. */
  href: string;
  /**
   * Gradient placeholder class (globals.css `.grad-*`) shown until SPD
   * photography arrives. The SPD swaps `image` in without touching layout.
   */
  gradient: string;
}

export interface MenuBranch {
  id: "shop" | "chapters" | "collections" | "archive" | "about";
  label: string;
  items: MenuItem[];
  campaign: MenuCampaign;
}

/** Left-rail branches, in order. SHOP is the default-active branch. */
export const MENU_BRANCHES: MenuBranch[] = [
  {
    id: "shop",
    label: "Shop",
    items: [
      { label: "All Products", href: "/shop" },
      { label: "Scented Candles", href: "/shop" },
      { label: "Room & Linen Sprays", href: "/collections/the-everyday" },
      { label: "Ritual Bundles", href: "/bundles" },
      { label: "Best Sellers", href: "/shop?sort=featured" },
      { label: "New Arrivals", href: "/shop?sort=newest" },
    ],
    campaign: {
      eyebrow: "Featured",
      title: "December's First Flame",
      description: "A warm chai editorial to open the season.",
      href: "/shop?sort=newest",
      gradient: "grad-chai",
    },
  },
  {
    id: "chapters",
    label: "Chapters",
    items: [
      { label: "Vol. I — Dessert Chapter", href: "/chapters/dessert-chapter" },
      { label: "Vol. II — The Wild Within", href: "/chapters/the-wild-within" },
      { label: "Vol. III — Mood Library", href: "/chapters/mood-library" },
      { label: "Vol. IV — Nature Chapter", href: "/chapters/nature-chapter" },
    ],
    campaign: {
      eyebrow: "The Chapters",
      title: "Dessert Chapter",
      description: "Chai steam, amber glow, brass warmth.",
      href: "/chapters/dessert-chapter",
      gradient: "grad-gajar",
    },
  },
  {
    id: "collections",
    label: "Collections",
    items: [
      { label: "The Hours Collection", href: "/collections/the-hours", tier: "parent" },
      { label: "Volume I — The Everyday", href: "/collections/the-everyday", tier: "child" },
      {
        label: "Volume II — The Intimate",
        href: "/collections/the-intimate",
        isComingSoon: true,
        tier: "child",
      },
      { label: "Discover The Collection", href: "/collections", tier: "cta" },
    ],
    campaign: {
      eyebrow: "The Air Chapters",
      title: "The Hours Collection",
      description: "Fragrance for the unnoticed hours of a day.",
      href: "/collections/the-hours",
      gradient: "grad-air",
    },
  },
  {
    id: "archive",
    label: "Archive",
    // One quiet entry for now — preserved as a top-level branch to signal
    // legacy, collector permanence and seasonality. Flip isComingSoon when live.
    items: [{ label: "The Archive", href: "/archive", isComingSoon: true }],
    campaign: {
      eyebrow: "Preserved",
      title: "The Samorah Archive",
      description: "Retired editions, kept for legacy.",
      href: "/archive",
      gradient: "grad-smoke",
    },
  },
  {
    id: "about",
    label: "About",
    items: [
      { label: "Our Story", href: "/about/our-story" },
      { label: "Craft & Ingredients", href: "/about/craft-ingredients" },
      { label: "Meet The Makers", href: "/about/meet-the-makers" },
      { label: "Contact", href: "/contact" },
    ],
    campaign: {
      eyebrow: "Featured",
      title: "Made With Intention",
      description: "Every candle, a story.",
      href: "/about/our-story",
      gradient: "grad-story",
    },
  },
];

export const DEFAULT_BRANCH_ID: MenuBranch["id"] = "shop";

/* ── Footer ────────────────────────────────────────────────────────────────
   The footer's own information architecture (SDD-VISUAL §31, as refined for
   Component 6): Shop · Chapters · About · Help · Follow. Distinct from the Mega
   Menu model above — the footer is a permanent index, not a campaign menu. */

export interface FooterLink {
  label: string;
  href: string;
  /** Off-site (social) link — opens in a new tab. */
  external?: boolean;
}

export interface FooterSection {
  title: string;
  links: FooterLink[];
}

export const FOOTER_SECTIONS: FooterSection[] = [
  {
    title: "Shop",
    links: [
      { label: "All Products", href: "/shop" },
      { label: "Room & Linen Sprays", href: "/collections/the-everyday" },
      { label: "Ritual Bundles", href: "/bundles" },
      { label: "New Arrivals", href: "/shop?sort=newest" },
    ],
  },
  {
    title: "Chapters",
    links: [
      { label: "Vol. I — Dessert Chapter", href: "/chapters/dessert-chapter" },
      { label: "Vol. II — The Wild Within", href: "/chapters/the-wild-within" },
      { label: "Vol. III — Mood Library", href: "/chapters/mood-library" },
      { label: "Vol. IV — Nature Chapter", href: "/chapters/nature-chapter" },
    ],
  },
  {
    title: "About",
    links: [
      { label: "Our Story", href: "/about/our-story" },
      { label: "Craft & Ingredients", href: "/about/craft-ingredients" },
      { label: "Meet The Makers", href: "/about/meet-the-makers" },
      { label: "Product Care", href: "/product-care" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Help",
    links: [
      { label: "Shipping Policy", href: "/shipping" },
      { label: "Returns & Exchanges", href: "/returns" },
      { label: "Terms & Conditions", href: "/terms" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "FAQ", href: "/faq" },
    ],
  },
  {
    title: "Follow",
    // Placeholder destinations until the real handles are confirmed.
    links: [
      { label: "Instagram", href: "https://www.instagram.com/", external: true },
      { label: "Pinterest", href: "https://www.pinterest.com/", external: true },
      { label: "Spotify", href: "https://open.spotify.com/", external: true },
    ],
  },
];
