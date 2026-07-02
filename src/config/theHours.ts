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
  hourReason: string; // "The Hour" — why this hour inspired the fragrance (PDP)
  hourStory?: string; // long-form "The Hour" narrative (overrides hourReason on the PDP)
  scentEffect?: string; // "The Effect" — a line shown with the Fragrance Journey
  productDetails?: string; // custom "Composition" accordion body
  scent: string[]; // the "smells like" notes (opening · heart · lingering)
  feels: string[]; // the "feels like" poetic lines (PDP)
  experience: string; // "The Experience" — how the room changes (PDP)
  placement: { label: string; note: string }[]; // where it belongs + a moment (PDP)
  signature: string; // the Signature Line — one sentence (PDP)
  productSlug: string; // → /shop/[slug] (the Room/Linen spray)
  priceLabel: string; // "From ₹599" until the commerce projection resolves it
  price: number; // commerce price (placeholder until air products exist)
  palette: string; // per-hour atmosphere theme token (the PDP editorial palette)
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
            hourReason: "When the windows open and the day begins.",
            scent: ["Fresh Air", "White Tea", "Soft Cotton"],
            feels: ["Fresh sheets.", "Curtains moving.", "The first coffee."],
            experience: "Morning begins quietly. Curtains move where they couldn't before. Fresh air enters, and the room resets — everything rinsed and beginning again.",
            placement: [
              { label: "Bedroom", note: "For slow mornings." },
              { label: "Kitchen", note: "For fresh beginnings." },
              { label: "Entryway", note: "The first impression." },
            ],
            signature: "Stillness before the day begins.",
            productSlug: "open-window",
            priceLabel: "From ₹599",
            price: 599,
            palette: "morning-blue",
            gradient: "gradient:grad-air",
            interlude: "The morning arrives quietly.",
          },
          {
            id: "slow-evening",
            time: "14:00",
            moment: "Afternoon Lingers",
            name: "Slow Evening",
            story: "The unhurried middle of an afternoon — soft linen, warm light through glass.",
            hourReason: "The hour the afternoon forgets to hurry.",
            scent: ["Iris", "Cotton", "Warm Sandalwood"],
            feels: ["Soft linen.", "Light through glass.", "Nowhere to be."],
            experience: "The afternoon stretches. Warmth settles into the corners of the room, and time loosens its grip. Nothing here is urgent.",
            placement: [
              { label: "Living room", note: "For unhurried afternoons." },
              { label: "Reading nook", note: "For a chapter or two." },
              { label: "Studio", note: "For quiet work." },
            ],
            signature: "The hour that asks for nothing.",
            productSlug: "slow-evening",
            priceLabel: "From ₹599",
            price: 599,
            palette: "dusty-rose",
            gradient: "gradient:grad-blush",
            interlude: "Afternoon forgets to hurry.",
          },
          {
            id: "after-dinner",
            time: "19:30",
            moment: "Evening Settles",
            name: "After Dinner",
            story: "The comfortable haze after a meal — soft conversation, the warmth of something good.",
            hourReason: "When the table clears and the evening softens.",
            scent: ["Amber", "Tonka Bean", "Soft Cedar"],
            feels: ["Low light.", "Soft voices.", "Something good, remembered."],
            experience: "Plates cleared, the room holds the warmth of the evening. Conversation slows to comfort, and the day folds itself away.",
            placement: [
              { label: "Dining room", note: "For lingering meals." },
              { label: "Living room", note: "For soft conversation." },
              { label: "Kitchen", note: "For the warmth after." },
            ],
            signature: "The warmth that stays after the meal.",
            productSlug: "after-dinner",
            priceLabel: "From ₹599",
            price: 599,
            palette: "amber-hour",
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
            hourReason: "The last hour, kept only for you.",
            scent: ["Lavender", "Cashmere", "Dark Musk"],
            feels: ["Cool cotton.", "A closed door.", "The day, finally quiet."],
            experience: "The house exhales. The last light is low and kind. This hour belongs to no one else — it is entirely, finally, yours.",
            placement: [
              { label: "Bedroom", note: "For winding down." },
              { label: "Bathroom", note: "For a long soak." },
              { label: "Dressing room", note: "For the quiet ritual." },
            ],
            signature: "The hour that belongs only to you.",
            productSlug: "private-hours",
            priceLabel: "From ₹599",
            price: 599,
            palette: "deep-indigo",
            gradient: "gradient:grad-amethyst",
          },
        ],
      },
    ],
    nextVolume: {
      volume: "Volume II",
      title: "First Light",
      story: "The mornings you didn't plan. The air a room makes before you wake.",
      closing: "Continue to the next volume.",
      cta: "Explore Volume II",
    },
  },
  {
    slug: "first-light",
    volume: "Volume II",
    title: "First Light",
    tagline: "The mornings you didn't plan.",
    cover: "gradient:grad-air",
    isComingSoon: false,
    groups: [
      {
        kind: "room",
        label: "Shared Hours",
        title: "The Unplanned Mornings",
        note: "The air a room makes for itself, before the day is yours.",
        hours: [
          {
            id: "morning-open-window",
            time: "09:20",
            moment: "Air After First Light",
            name: "Open Window",
            story: "Air after the first light.",
            hourReason: "The air a room makes for itself, before you wake.",
            hourStory:
              "You didn't wake up early on purpose. Something else did.\n\nMaybe the light. Maybe the sound of a bike starting. Maybe someone in the building already living their best life at 6 AM.\n\nYou sit up, slightly confused. The room feels different. The window is open. You don't remember opening it.\n\nFor a second, it feels like the air doesn't belong to you anymore. It's fresher. Slightly unfamiliar. Slightly addictive.\n\nYou don't question it. You just stay there longer than usual.",
            scentEffect: "Warm. Slightly addictive. Familiar — like the room reset itself before you woke up.",
            productDetails: "A room mist spray. A fine fragrance blend. Size: 100 ml. Made in India.",
            scent: ["Green Paan Leaf", "Tonka Warmth", "Dry Amber Woods"],
            feels: ["A room that aired itself before you woke up."],
            experience: "A fine mist that diffuses gently. Built to linger without overwhelming. Designed for air, not surfaces.",
            placement: [
              { label: "Near open windows", note: "" },
              { label: "Morning routines you didn't plan", note: "" },
              { label: "Rooms that need a reset", note: "" },
            ],
            signature: "Best experienced at 09:20.",
            productSlug: "morning-open-window",
            priceLabel: "From ₹599",
            price: 599,
            palette: "morning-blue",
            gradient: "gradient:grad-air",
          },
        ],
      },
    ],
  },
];

/** Visible volumes. */
export function getAirVolumes(): AirVolume[] {
  return AIR_VOLUMES.filter((v) => !v.isComingSoon);
}

export function getAirVolume(slug: string): AirVolume | undefined {
  return AIR_VOLUMES.find((v) => v.slug === slug);
}

/** Resolve a single Hour (an air "product") by its productSlug, with its volume
 *  and group — the temporary data source for the Air PDP until real air products
 *  exist. The PDP UI + builder are identical, so the source can swap later. */
export function getHourBySlug(
  productSlug: string,
): { hour: HourEntry; group: HourGroup; volume: AirVolume } | undefined {
  for (const volume of AIR_VOLUMES) {
    for (const group of volume.groups) {
      const hour = group.hours.find((h) => h.productSlug === productSlug);
      if (hour) return { hour, group, volume };
    }
  }
  return undefined;
}

