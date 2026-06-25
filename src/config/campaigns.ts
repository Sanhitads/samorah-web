/**
 * Homepage Campaign System (approved architecture — see PROJECT_CONTEXT
 * "Approved Future Architecture → Homepage Campaign System").
 *
 * The Homepage Hero is a **campaign-driven editorial component**, not a static
 * banner: the layout, typography, spacing, motion and photography *treatment*
 * never change — only the campaign *content* does (Trudon / Dior Maison / Loewe
 * model). This file is the local placeholder source; the full Campaign Manager
 * (CMS + automatic date scheduling) arrives in the Admin phase. The component
 * already reads from this object, so no layout refactor is required later.
 *
 * NOT a carousel / slider / rotating banner — exactly one campaign is active.
 */
export interface HeroCampaign {
  id: string;
  campaignName: string;
  /**
   * `gradient:<class>` placeholder until SPD photography → a Cloudinary URL.
   * Rendered via the existing `isGradientPlaceholder` / `gradientClass` helpers,
   * so the swap to real photography needs no component change (SPD §15/§17).
   */
  heroImage: string;
  eyebrow: string;
  heading: string;
  subheading: string;
  ctaLabel: string;
  ctaHref: string;
  /** Colour mood / editorial atmosphere (future: tints scrim/accents). */
  theme: string;
  isActive: boolean;
  /** ISO dates; null = open-ended. Drives automatic scheduling later. */
  startDate: string | null;
  endDate: string | null;
  displayOrder: number;
}

/** Local campaigns (one for now). The CMS will own this list. */
export const HERO_CAMPAIGNS: HeroCampaign[] = [
  {
    id: "kashmiri-chai-launch",
    campaignName: "Kashmiri Chai",
    heroImage: "gradient:grad-hero1",
    eyebrow: "Handcrafted in India",
    heading: "Fragrance Crafted As Atmosphere",
    subheading:
      "Slow-crafted luxury candles inspired by ritual, silence and timeless warmth.",
    ctaLabel: "Explore Chapters",
    ctaHref: "/chapters",
    theme: "warm-dark",
    isActive: true,
    startDate: null,
    endDate: null,
    displayOrder: 1,
  },
];

function isWithinWindow(c: HeroCampaign, now: Date): boolean {
  if (c.startDate && now < new Date(c.startDate)) return false;
  if (c.endDate && now > new Date(c.endDate)) return false;
  return true;
}

/**
 * The single active Hero campaign for `now`. Future: with multiple dated
 * campaigns this selects automatically by date — no deploy needed to switch the
 * Homepage. (Date-based scheduling will require the Homepage to be ISR/dynamic;
 * with one open-ended campaign today the page stays static.)
 */
export function getActiveCampaign(now: Date = new Date()): HeroCampaign {
  const active = HERO_CAMPAIGNS.filter(
    (c) => c.isActive && isWithinWindow(c, now),
  ).sort((a, b) => a.displayOrder - b.displayOrder);
  return active[0] ?? HERO_CAMPAIGNS[0];
}
