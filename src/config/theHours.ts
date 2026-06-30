/**
 * The Hours — Air Chapters content (Experience B). A "volume" is a diary of the
 * day's unnoticed moments; each **Hour** is an entry (time · name · story ·
 * scent) tied to a Room or Linen spray. Two groups per volume — Shared Hours
 * (the spaces we share) and Private Hours (closer to you).
 *
 * CMS-ready & config-driven (no air products in the DB yet): the Air page reads
 * these typed objects, exactly like the homepage sections. Experiences, never
 * categories — the copy sells the moment before the product. `productSlug`
 * resolves to a real Room/Linen spray once seeded; imagery uses `gradient:*`
 * placeholders until SPD photography → Cloudinary.
 */
export type HourGroupKind = "room" | "linen";

export interface HourEntry {
  id: string;
  time: string; // "07:00" — shown as "HOUR 07:00"
  moment: string; // "Morning Begins" — a small poetic descriptor under the hour
  name: string;
  story: string; // the "feels like" line
  scent: string[]; // the "smells like" notes
  productSlug: string; // → /shop/[slug] (the Room/Linen spray)
  priceLabel: string; // "From ₹599" until the commerce projection resolves it
  gradient: string; // "gradient:grad-air"
  /** A short editorial line shown between this Hour and the next (turning a leaf). */
  interlude?: string;
}

export interface HourGroup {
  kind: HourGroupKind;
  label: string; // eyebrow — "Shared Hours" · "Private Hours"
  title: string; // editorial — "Spaces We Share" · "Closer to You"
  note: string; // a quiet sub-line
  hours: HourEntry[];
}

export interface AirVolume {
  slug: string; // "the-everyday"
  volume: string; // "Volume I"
  title: string; // "The Everyday"
  tagline: string; // "The unnoticed moments that shape a day."
  cover: string; // "gradient:grad-air"
  isComingSoon: boolean;
  groups: HourGroup[];
  nextVolume?: {
    volume: string;
    title: string;
    story: string; // "For evenings. For whispers. For the spaces closest to you."
    closing: string; // "Coming in the next volume."
    cta: string; // "Discover Soon"
  };
}

export const AIR_VOLUMES: AirVolume[] = [
  {
    slug: "the-everyday",
    volume: "Volume I",
    title: "The Everyday",
    tagline: "The unnoticed moments that shape a day.",
    cover: "gradient:grad-air",
    isComingSoon: false,
    groups: [
      {
        kind: "room",
        label: "Shared Hours",
        title: "Spaces We Share",
        note: "Light, air, and the rooms a day moves through.",
        hours: [
          {
            id: "open-window",
            time: "07:00",
            moment: "Morning Begins",
            name: "Open Window",
            story: "The room before the day begins — light arriving, quietly expectant.",
            scent: ["White Tea", "Fresh Air", "Soft Cotton"],
            productSlug: "open-window",
            priceLabel: "From ₹599",
            gradient: "gradient:grad-air",
            interlude: "The morning arrives quietly.",
          },
          {
            id: "slow-evening",
            time: "14:00",
            moment: "Afternoon Lingers",
            name: "Slow Evening",
            story: "The unhurried middle of an afternoon — soft linen, warm light through glass.",
            scent: ["Cotton", "Iris", "Warm Sandalwood"],
            productSlug: "slow-evening",
            priceLabel: "From ₹599",
            gradient: "gradient:grad-blush",
            interlude: "Afternoon forgets to hurry.",
          },
          {
            id: "after-dinner",
            time: "19:30",
            moment: "Evening Settles",
            name: "After Dinner",
            story: "The comfortable haze after a meal — soft conversation, the warmth of something good.",
            scent: ["Tonka Bean", "Amber", "Soft Cedar"],
            productSlug: "after-dinner",
            priceLabel: "From ₹599",
            gradient: "gradient:grad-chai",
          },
        ],
      },
      {
        kind: "linen",
        label: "Private Hours",
        title: "Closer to You",
        note: "For linen, for fabric, for the hours that ask for nothing.",
        hours: [
          {
            id: "private-hours",
            time: "23:00",
            moment: "Night Holds",
            name: "Private Hours",
            story: "The most intimate hour of the day. The one that belongs only to you.",
            scent: ["Lavender", "Cashmere", "Dark Musk"],
            productSlug: "private-hours",
            priceLabel: "From ₹599",
            gradient: "gradient:grad-amethyst",
          },
        ],
      },
    ],
    nextVolume: {
      volume: "Volume II",
      title: "The Intimate",
      story: "For evenings. For whispers. For the spaces closest to you.",
      closing: "Coming in the next volume.",
      cta: "Available Soon",
    },
  },
];

/** Visible volumes. */
export function getAirVolumes(): AirVolume[] {
  return AIR_VOLUMES.filter((v) => !v.isComingSoon);
}

export function getAirVolume(slug: string): AirVolume | undefined {
  return AIR_VOLUMES.find((v) => v.slug === slug);
}
